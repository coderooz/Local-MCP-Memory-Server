#!/usr/bin/env node

import dotenv from "dotenv";
import express from "express";
import { MongoClient } from "mongodb";
import path from "path";
import { fileURLToPath } from "url";

import { initLogger, logError, logInfo } from "./logger.js";
import {
  ActionModel,
  AgentModel,
  ContextModel,
  IssueModel,
  MEMORY_LIFECYCLE,
  MemoryQueryBuilder,
  MessageModel,
  ProjectMapModel,
  SessionModel,
  TaskModel,
  normalizeMemory
} from "./mcp.model.js";
import {
  buildTaskSchedule,
  autoAssignTask,
  computeTaskPriorityScore,
  deriveAgentStatus,
  refreshAgentStatuses
} from "./utils/coordinationEngine.js";
import {
  acquireResourceLock,
  cleanupExpiredLocks,
  evaluateCollaborationRisk,
  listResourceLocks,
  releaseResourceLock
} from "./utils/collaborationEngine.js";
import { createEventBus } from "./utils/eventBus.js";
import { recordMetric } from "./utils/metrics.js";
import {
  buildProjectDescriptorFilter,
  detectAndResolveMemoryConflicts,
  evaluateMemoryState,
  getConnectedContextData,
  optimizeMemories,
  upsertProjectDescriptor,
  updateContextWithVersioning
} from "./utils/memoryEngine.js";
import { recordActivity } from "./utils/activityTracker.js";
import { routeHandler } from "./utils/routeHandler.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({
  path: path.join(__dirname, ".env"),
  quiet: true
});

const DB_NAME = process.env.MONGO_DB_NAME || "mcp_memory";
const DEFAULT_PORT = Number(process.env.PORT || 4000);
const eventBus = createEventBus();

const app = express();
app.use(express.json());

let client = null;
let db = null;
let server = null;
let startupPromise = null;

function getDb() {
  if (!db) {
    throw new Error("Database not ready");
  }

  return db;
}

function parsePositiveInt(value, fallback) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

function parseBoolean(value, fallback = false) {
  if (value === undefined) {
    return fallback;
  }

  if (typeof value === "boolean") {
    return value;
  }

  return String(value).toLowerCase() === "true";
}

function toStringArray(value) {
  return Array.isArray(value)
    ? value.filter((item) => typeof item === "string" && item.trim())
    : [];
}

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function rankSearchResults(results, query) {
  const now = new Date();
  const words = query.toLowerCase().split(" ").filter(Boolean);

  return results
    .map((item) => {
      let score = 0;
      const content = item.content?.toLowerCase() || "";
      const summary = item.summary?.toLowerCase() || "";

      const matches = words.filter(
        (word) => content.includes(word) || summary.includes(word)
      ).length;

      score += matches * 2;
      score += (item.importance || 3) * 2;

      const ageHours = (now - new Date(item.createdAt || now)) / 3600000;
      score += Math.max(0, 5 - ageHours / 24);
      score += Math.log((item.accessCount || 0) + 1);

      if (item.type === "project") {
        score += 6;
      }

      if (item.lifecycle === MEMORY_LIFECYCLE.DEPRECATED) {
        score -= 3;
      }

      if (item.lifecycle === MEMORY_LIFECYCLE.ARCHIVED) {
        score -= 8;
      }

      return { ...item, score };
    })
    .sort((left, right) => right.score - left.score);
}

function buildContextUpdatePayload(updates = {}) {
  const payload = {};
  const scalarFields = [
    "type",
    "content",
    "summary",
    "importance",
    "lifecycle",
    "scope",
    "updateReason"
  ];

  for (const field of scalarFields) {
    if (updates[field] !== undefined) {
      payload[field] = updates[field];
    }
  }

  if (updates.metadata && typeof updates.metadata === "object") {
    payload.metadata = updates.metadata;
  }

  if (updates.projectDescriptor && typeof updates.projectDescriptor === "object") {
    payload.projectDescriptor = updates.projectDescriptor;
  }

  for (const field of [
    "tags",
    "relatedContexts",
    "relatedActions",
    "relatedTasks",
    "relatedIssues",
    "conflictsWith"
  ]) {
    if (updates[field] !== undefined) {
      payload[field] = toStringArray(updates[field]);
    }
  }

  return payload;
}

function firstNonEmptyString(...values) {
  return values.find((value) => hasText(value)) || null;
}

async function trackActivity(database, payload = {}) {
  if (!payload.message) {
    return null;
  }

  return recordActivity(database, payload);
}

async function trackCollaborationWarnings(
  database,
  {
    actor,
    project,
    resource,
    warnings,
    relatedTaskId,
    collectionName,
    filter
  }
) {
  if (!warnings?.length) {
    return [];
  }

  const activityIds = [];

  for (const warning of warnings) {
    const activity = await trackActivity(database, {
      agent: actor || "system",
      project,
      type: "decision",
      message: warning,
      related_task: relatedTaskId || null,
      resource,
      metadata: {
        category: "collaboration_warning"
      }
    });

    if (activity?.activity_id) {
      activityIds.push(activity.activity_id);
    }
  }

  if (collectionName && filter && activityIds.length) {
    await database.collection(collectionName).updateOne(
      filter,
      {
        $addToSet: {
          conflictsWith: { $each: activityIds }
        }
      }
    );
  }

  await recordMetric(database, {
    agent: actor || "system",
    project: project || "default",
    metric_type: "collaboration",
    name: "collaboration_warning",
    value: warnings.length,
    data: {
      resource,
      relatedTaskId,
      warnings
    }
  });

  return activityIds;
}

async function ensureIndexes(database) {
  await Promise.all([
    database.collection("contexts").createIndex({ id: 1 }, { unique: true }),
    database.collection("contexts").createIndex({
      content: "text",
      summary: "text",
      tags: "text"
    }),
    database.collection("contexts").createIndex({
      project: 1,
      type: 1,
      lifecycle: 1,
      updatedAt: -1
    }),
    database.collection("contexts").createIndex({ project: 1, conflictsWith: 1 }),
    database.collection("actions").createIndex({ id: 1 }, { unique: true }),
    database.collection("actions").createIndex({ contextRefs: 1 }),
    database.collection("sessions").createIndex({ sessionId: 1 }, { unique: true }),
    database.collection("logs").createIndex({ createdAt: -1 }),
    database.collection("agents").createIndex({ agent_id: 1 }, { unique: true }),
    database.collection("agents").createIndex({ project: 1, status: 1, last_seen: -1 }),
    database.collection("tasks").createIndex({ task_id: 1 }, { unique: true }),
    database.collection("tasks").createIndex({ project: 1, status: 1, priority: -1 }),
    database.collection("tasks").createIndex({ project: 1, assigned_to: 1, updatedAt: -1 }),
    database.collection("messages").createIndex({ message_id: 1 }, { unique: true }),
    database.collection("messages").createIndex({ project: 1, to_agent: 1, createdAt: -1 }),
    database.collection("project_map").createIndex({ project: 1, file_path: 1 }),
    database.collection("project_map").createIndex({ project: 1, type: 1, updatedAt: -1 }),
    database.collection("project_map").createIndex({
      file_path: "text",
      summary: "text",
      key_details: "text",
      dependencies: "text",
      exports: "text",
      tags: "text"
    }),
    database.collection("memory_versions").createIndex(
      { context_id: 1, context_version: -1 },
      { unique: true }
    ),
    database.collection("memory_versions").createIndex({ project: 1, changedAt: -1 }),
    database.collection("issues").createIndex({ issue_id: 1 }, { unique: true }),
    database.collection("issues").createIndex({ project: 1, status: 1, type: 1, updatedAt: -1 }),
    database.collection("issues").createIndex({ relatedTasks: 1 }),
    database.collection("issues").createIndex({ relatedContexts: 1 }),
    database.collection("activity").createIndex({ activity_id: 1 }, { unique: true }),
    database.collection("activity").createIndex({ project: 1, timestamp: -1 }),
    database.collection("activity").createIndex({ project: 1, related_task: 1, timestamp: -1 }),
    database.collection("resource_locks").createIndex({ lock_id: 1 }, { unique: true }),
    database.collection("resource_locks").createIndex(
      { project: 1, resource: 1, locked_by: 1 },
      { unique: true }
    ),
    database.collection("resource_locks").createIndex({ expiresAt: 1 }),
    database.collection("metrics").createIndex({ metric_id: 1 }, { unique: true }),
    database.collection("metrics").createIndex({
      project: 1,
      metric_type: 1,
      name: 1,
      recordedAt: -1
    })
  ]);
}

async function buildDerivedTaskState(database, taskInput) {
  const task = new TaskModel(taskInput);
  const priorityScore = await computeTaskPriorityScore(database, task);
  const schedule = await buildTaskSchedule(database, task);
  let status = task.status;

  if (task.status !== "completed") {
    status = schedule.status === "blocked" ? "blocked" : task.status;
  }

  return new TaskModel({
    ...task,
    priorityScore,
    status,
    scheduledFor: schedule.scheduledFor,
    schedulingNotes: schedule.schedulingNotes
  });
}

async function syncAgentTaskState(database, previousTask, nextTask) {
  const previousAgent = previousTask?.assigned_to;
  const nextAgent = nextTask?.assigned_to;

  if (previousAgent && previousAgent !== nextAgent) {
    await database.collection("agents").updateOne(
      { agent_id: previousAgent },
      {
        $set: {
          current_task: null,
          status: "idle",
          updatedAt: new Date()
        }
      }
    );
  }

  if (nextAgent) {
    await database.collection("agents").updateOne(
      { agent_id: nextAgent },
      {
        $set: {
          current_task:
            nextTask.status === "completed" || nextTask.status === "blocked"
              ? null
              : nextTask.task_id,
          status: nextTask.status === "in_progress" ? "active" : "idle",
          last_seen: new Date(),
          updatedAt: new Date()
        }
      }
    );
  }
}

eventBus.on("task_created", async ({ db: database, task }) => {
  const storedTask = await database
    .collection("tasks")
    .findOne({ task_id: task.task_id });

  if (!storedTask || storedTask.assigned_to) {
    return;
  }

  const selectedAgent = await autoAssignTask(database, storedTask);

  if (!selectedAgent) {
    return;
  }

  const nextStatus =
    storedTask.status === "pending" ? "in_progress" : storedTask.status;

  await database.collection("tasks").updateOne(
    { task_id: storedTask.task_id },
    {
      $set: {
        assigned_to: selectedAgent.agent_id,
        status: nextStatus,
        updatedAt: new Date()
      }
    }
  );

  await database.collection("agents").updateOne(
    { agent_id: selectedAgent.agent_id },
    {
      $set: {
        current_task: nextStatus === "in_progress" ? storedTask.task_id : null,
        status: nextStatus === "in_progress" ? "active" : "idle",
        last_seen: new Date(),
        updatedAt: new Date()
      }
    }
  );

  await recordMetric(database, {
    agent: task.agent,
    project: task.project,
    metric_type: "task_orchestration",
    name: "task_auto_assigned",
    data: {
      task_id: storedTask.task_id,
      assigned_to: selectedAgent.agent_id
    }
  });

  await trackActivity(database, {
    agent: task.agent,
    project: task.project,
    type: "task_update",
    message: `Task ${storedTask.task_id} auto-assigned to ${selectedAgent.agent_id}`,
    related_task: storedTask.task_id,
    resource: `task:${storedTask.task_id}`
  });
});

eventBus.on("memory_updated", async ({ db: database, context, agent }) => {
  const storedContext = await database
    .collection("contexts")
    .findOne({ id: context.id });

  if (!storedContext) {
    return;
  }

  const evaluatedContext = await evaluateMemoryState(database, storedContext, {
    reason: "Event-driven memory evaluation",
    changedBy: agent || storedContext.agent || "system"
  });

  await detectAndResolveMemoryConflicts(database, evaluatedContext || storedContext);

  await trackActivity(database, {
    agent: agent || storedContext.agent || "system",
    project: storedContext.project,
    type: "decision",
    message: `Memory ${storedContext.id} re-evaluated after update`,
    resource: `context:${storedContext.id}`
  });
});

app.post(
  "/context",
  routeHandler("contexts", async ({ req, collection, db: database }) => {
    const isProjectDescriptor =
      req.body.type === "project" || Boolean(req.body.projectDescriptor);
    const actor = req.body.agent || "system";

    if (isProjectDescriptor) {
      const existingDescriptor = await database
        .collection("contexts")
        .findOne(buildProjectDescriptorFilter(req.body.project));
      const collaboration = await evaluateCollaborationRisk(database, {
        project: req.body.project,
        actor,
        resource: "project:descriptor",
        currentDocument: existingDescriptor,
        expectedUpdatedAt: req.body.expectedUpdatedAt,
        expectedVersion: req.body.expectedVersion
      });
      const context = await upsertProjectDescriptor(database, req.body);

      await recordMetric(database, {
        agent: context.agent,
        project: context.project,
        metric_type: "memory_usage",
        name: "project_descriptor_upserted",
        data: { context_id: context.id }
      });

      await eventBus.emit("memory_updated", {
        db: database,
        context,
        agent: context.agent
      });

      await trackActivity(database, {
        agent: actor,
        project: context.project,
        type: "decision",
        message: `Project descriptor stored for ${context.project}`,
        resource: "project:descriptor"
      });

      await trackCollaborationWarnings(database, {
        actor,
        project: context.project,
        resource: "project:descriptor",
        warnings: collaboration.warnings,
        collectionName: "contexts",
        filter: { id: context.id }
      });

      return { success: true, context, warnings: collaboration.warnings };
    }

    const context = new ContextModel(req.body);
    await collection.insertOne(normalizeMemory(context));

    await recordMetric(database, {
      agent: context.agent,
      project: context.project,
      metric_type: "memory_usage",
      name: "context_created",
      data: { context_id: context.id, type: context.type }
    });

    await eventBus.emit("memory_updated", {
      db: database,
      context,
      agent: context.agent
    });

    const storedContext = await collection.findOne({ id: context.id });

    await logInfo("Context stored", {
      agent: context.agent,
      project: context.project
    });

    await trackActivity(database, {
      agent: context.agent,
      project: context.project,
      type: "decision",
      message: `Context ${context.id} stored`,
      resource: `context:${context.id}`,
      metadata: { context_type: context.type }
    });

    return { success: true, context: storedContext, warnings: [] };
  })
);

app.post(
  "/project/descriptor",
  routeHandler("contexts", async ({ req, db: database }) => {
    const { name, category, description } = req.body;
    const actor = req.body.agent || "system";

    if (!hasText(name)) {
      return { error: "Missing project descriptor name" };
    }

    if (!hasText(category)) {
      return { error: "Missing project descriptor category" };
    }

    if (!hasText(description)) {
      return { error: "Missing project descriptor description" };
    }

    const existingDescriptor = await database
      .collection("contexts")
      .findOne(buildProjectDescriptorFilter(req.body.project));
    const collaboration = await evaluateCollaborationRisk(database, {
      project: req.body.project,
      actor,
      resource: "project:descriptor",
      currentDocument: existingDescriptor,
      expectedUpdatedAt: req.body.expectedUpdatedAt,
      expectedVersion: req.body.expectedVersion
    });
    const context = await upsertProjectDescriptor(database, req.body);

    await recordMetric(database, {
      agent: context.agent,
      project: context.project,
      metric_type: "memory_usage",
      name: "project_descriptor_upserted",
      data: { context_id: context.id }
    });

    await eventBus.emit("memory_updated", {
      db: database,
      context,
      agent: context.agent
    });

    await trackActivity(database, {
      agent: actor,
      project: context.project,
      type: "decision",
      message: `Project descriptor updated for ${context.project}`,
      resource: "project:descriptor"
    });

    await trackCollaborationWarnings(database, {
      actor,
      project: context.project,
      resource: "project:descriptor",
      warnings: collaboration.warnings,
      collectionName: "contexts",
      filter: { id: context.id }
    });

    return { success: true, context, warnings: collaboration.warnings };
  })
);

app.get(
  "/project/descriptor",
  routeHandler("contexts", async ({ req, collection }) => {
    const project = req.query.project;

    if (!project) {
      return { error: "Missing project" };
    }

    const context = await collection.findOne(buildProjectDescriptorFilter(project));
    return context || { error: "Project descriptor not found" };
  })
);

app.post(
  "/context/search",
  routeHandler("contexts", async ({ req, collection, db: database }) => {
    const {
      agent,
      project,
      query = "",
      limit = 10,
      lifecycle
    } = req.body;

    const baseQuery = MemoryQueryBuilder.build({
      agent,
      project,
      query,
      lifecycle
    });

    const results = await collection.find(baseQuery).limit(50).toArray();
    const ranked = rankSearchResults(results, query).slice(0, limit);
    const ids = ranked.map((item) => item.id);

    if (ids.length) {
      await collection.updateMany(
        { id: { $in: ids } },
        {
          $inc: { accessCount: 1 },
          $set: { lastAccessedAt: new Date() }
        }
      );

      const touchedEntries = await collection.find({ id: { $in: ids } }).toArray();

      await Promise.all(
        touchedEntries.map((entry) =>
          evaluateMemoryState(database, entry, {
            reason: "Search access evaluation",
            changedBy: agent || "system"
          })
        )
      );
    }

    await recordMetric(database, {
      agent: agent || "system",
      project: project || "default",
      metric_type: "memory_usage",
      name: "context_search",
      value: ids.length,
      data: { query, limit }
    });

    const refreshed = ids.length
      ? await collection.find({ id: { $in: ids } }).toArray()
      : [];
    const refreshedMap = new Map(refreshed.map((entry) => [entry.id, entry]));

    return ranked.map((item) => refreshedMap.get(item.id) || item);
  })
);

app.post(
  "/context/update",
  routeHandler("contexts", async ({ req, db: database }) => {
    const { context_id, updates = {}, reason } = req.body;
    const actor = req.body.agent || "system";

    if (!context_id) {
      return { error: "Missing context_id" };
    }

    const existing = await database.collection("contexts").findOne({ id: context_id });

    if (!existing) {
      return { error: "Context not found" };
    }

    const payload = buildContextUpdatePayload(updates);

    if (!Object.keys(payload).length) {
      return { error: "No valid updates provided" };
    }

    const collaboration = await evaluateCollaborationRisk(database, {
      project: existing.project,
      actor,
      resource: `context:${context_id}`,
      relatedTaskId: firstNonEmptyString(
        req.body.related_task,
        payload.relatedTasks?.[0],
        existing.relatedTasks?.[0]
      ),
      currentDocument: existing,
      expectedUpdatedAt: req.body.expectedUpdatedAt,
      expectedVersion: req.body.expectedVersion
    });

    const isProjectDescriptor =
      existing.type === "project" ||
      payload.type === "project" ||
      Boolean(payload.projectDescriptor);

    const context = isProjectDescriptor
      ? await upsertProjectDescriptor(database, {
          ...existing,
          ...payload,
          reason: reason || "Project descriptor updated",
          agent: actor,
          project: existing.project
        })
      : await updateContextWithVersioning(database, context_id, payload, {
          reason: reason || "Context updated",
          changedBy: actor || existing.agent || "system"
        });

    await recordMetric(database, {
      agent: actor || existing.agent || "system",
      project: existing.project,
      metric_type: "memory_usage",
      name: "context_updated",
      data: { context_id, reason: reason || "Context updated" }
    });

    await eventBus.emit("memory_updated", {
      db: database,
      context,
      agent: actor || existing.agent || "system"
    });

    await trackActivity(database, {
      agent: actor,
      project: existing.project,
      type: "decision",
      message: `Context ${context_id} updated`,
      related_task: collaboration.relatedTask?.task_id || null,
      resource: `context:${context_id}`,
      metadata: {
        reason: reason || "Context updated"
      }
    });

    await trackCollaborationWarnings(database, {
      actor,
      project: existing.project,
      resource: `context:${context_id}`,
      warnings: collaboration.warnings,
      relatedTaskId: collaboration.relatedTask?.task_id,
      collectionName: "contexts",
      filter: { id: context_id }
    });

    return { success: true, context, warnings: collaboration.warnings };
  })
);

app.get(
  "/context/:id/full",
  routeHandler("contexts", async ({ req, db: database }) => {
    const context = await database
      .collection("contexts")
      .findOne({ id: req.params.id });

    if (!context) {
      return { error: "Context not found" };
    }

    const [actions, versions] = await Promise.all([
      database.collection("actions").find({ contextRefs: context.id }).toArray(),
      database.collection("memory_versions")
        .find({ context_id: context.id })
        .sort({ changedAt: -1 })
        .limit(20)
        .toArray()
    ]);

    return { context, actions, versions };
  })
);

app.get(
  "/context/:id/connected",
  routeHandler("contexts", async ({ req, db: database }) => {
    const connected = await getConnectedContextData(database, req.params.id);

    if (!connected) {
      return { error: "Context not found" };
    }

    return connected;
  })
);

app.post(
  "/memory/optimize",
  routeHandler("contexts", async ({ req, db: database }) => {
    const summary = await optimizeMemories(database, {
      project: req.body.project,
      limit: parsePositiveInt(req.body.limit, 100)
    });

    await recordMetric(database, {
      agent: req.body.agent || "system",
      project: req.body.project || "default",
      metric_type: "memory_usage",
      name: "memory_optimization_run",
      value: summary.changed,
      data: summary
    });

    return { success: true, summary };
  })
);

app.post(
  "/action",
  routeHandler("actions", async ({ req, collection, db: database }) => {
    const action = new ActionModel(req.body);
    await collection.insertOne(normalizeMemory(action));

    await trackActivity(database, {
      agent: action.agent,
      project: action.project,
      type: "action",
      message: action.summary || `${action.actionType} on ${action.target || "unknown target"}`,
      related_task: req.body.related_task || null,
      resource: action.target || null,
      metadata: {
        actionType: action.actionType
      }
    });

    return { success: true, action };
  })
);

app.post(
  "/session",
  routeHandler("sessions", async ({ req, collection }) => {
    const session = new SessionModel(req.body);
    await collection.insertOne(normalizeMemory(session));

    return { success: true, session };
  })
);

app.post(
  "/logs",
  routeHandler("logs", async ({ req, collection }) => {
    const { query = {}, limit = 20 } = req.body;

    return collection
      .find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();
  })
);

app.post(
  "/activity",
  routeHandler("activity", async ({ req, db: database }) => {
    const { message, type = "action" } = req.body;

    if (!hasText(message)) {
      return { error: "Missing activity message" };
    }

    const activity = await trackActivity(database, {
      agent: req.body.agent || "system",
      project: req.body.project || "default",
      type,
      message,
      related_task: req.body.related_task || null,
      resource: req.body.resource || null,
      metadata: req.body.metadata || {}
    });

    return { success: true, activity };
  })
);

app.get(
  "/activity",
  routeHandler("activity", async ({ req, collection }) => {
    const filter = {};

    if (req.query.project) {
      filter.project = req.query.project;
    }

    if (req.query.agent) {
      filter.agent = req.query.agent;
    }

    if (req.query.type) {
      filter.type = req.query.type;
    }

    if (req.query.related_task) {
      filter.related_task = req.query.related_task;
    }

    return collection
      .find(filter)
      .sort({ timestamp: -1, createdAt: -1 })
      .limit(parsePositiveInt(req.query.limit, 100))
      .toArray();
  })
);

app.post(
  "/lock/acquire",
  routeHandler("resource_locks", async ({ req, db: database }) => {
    const { resource } = req.body;
    const actor = req.body.agent || req.body.locked_by || "system";
    const project = req.body.project || "default";

    if (!hasText(resource)) {
      return { error: "Missing resource" };
    }

    const result = await acquireResourceLock(database, {
      project,
      agent: actor,
      resource,
      expiresInMs: req.body.expiresInMs,
      metadata: req.body.metadata || {}
    });

    await trackActivity(database, {
      agent: actor,
      project,
      type: "decision",
      message: result.acquired
        ? `Lock acquired for ${resource}`
        : `Lock acquisition warning for ${resource}`,
      resource,
      metadata: {
        acquired: result.acquired
      }
    });

    await recordMetric(database, {
      agent: actor,
      project,
      metric_type: "collaboration",
      name: result.acquired ? "resource_lock_acquired" : "resource_lock_contended",
      data: {
        resource,
        warnings: result.warnings
      }
    });

    return {
      success: true,
      acquired: result.acquired,
      lock: result.lock,
      warnings: result.warnings
    };
  })
);

app.post(
  "/lock/release",
  routeHandler("resource_locks", async ({ req, db: database }) => {
    const { resource } = req.body;
    const actor = req.body.agent || req.body.locked_by || "system";
    const project = req.body.project || "default";

    if (!hasText(resource)) {
      return { error: "Missing resource" };
    }

    const result = await releaseResourceLock(database, {
      project,
      resource,
      agent: actor
    });

    await trackActivity(database, {
      agent: actor,
      project,
      type: "decision",
      message: result.released
        ? `Lock released for ${resource}`
        : `No lock released for ${resource}`,
      resource
    });

    return {
      success: true,
      released: result.released
    };
  })
);

app.get(
  "/lock/list",
  routeHandler("resource_locks", async ({ req, db: database }) => {
    const locks = await listResourceLocks(database, {
      project: req.query.project,
      resource: req.query.resource
    });

    return locks;
  })
);

app.post("/log", async (req, res) => {
  try {
    const { type, message, context } = req.body;

    if (type === "error") {
      await logError(new Error(message), context);
    } else {
      await logInfo(message, context);
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post(
  "/agent/register",
  routeHandler("agents", async ({ req, collection, db: database }) => {
    const existing = await collection.findOne({ agent_id: req.body.agent_id });
    const draftAgent = new AgentModel({
      ...existing,
      ...req.body,
      capabilities:
        req.body.capabilities ?? existing?.capabilities ?? [],
      last_seen: new Date()
    });
    const status = deriveAgentStatus(draftAgent);

    await collection.updateOne(
      { agent_id: draftAgent.agent_id },
      {
        $set: normalizeMemory({
          ...draftAgent,
          createdAt: existing?.createdAt || draftAgent.createdAt,
          status
        })
      },
      { upsert: true }
    );

    const agent = await collection.findOne({ agent_id: draftAgent.agent_id });

    await recordMetric(database, {
      agent: agent.agent_id,
      project: agent.project,
      metric_type: "agent_registry",
      name: "agent_registered",
      data: { status: agent.status }
    });

    await trackActivity(database, {
      agent: agent.agent_id,
      project: agent.project,
      type: "decision",
      message: `Agent ${agent.agent_id} registered with status ${agent.status}`,
      resource: `agent:${agent.agent_id}`
    });

    return { success: true, agent };
  })
);

app.post(
  "/agent/heartbeat",
  routeHandler("agents", async ({ req, collection, db: database }) => {
    const { agent_id, current_task, status } = req.body;

    if (!agent_id) {
      return { error: "Missing agent_id" };
    }

    const existing = await collection.findOne({ agent_id });

    if (!existing) {
      return { error: "Agent not found" };
    }

    const draftAgent = {
      ...existing,
      current_task: current_task !== undefined ? current_task : existing.current_task,
      last_seen: new Date(),
      status: status || existing.status
    };

    const nextStatus = deriveAgentStatus(draftAgent);

    await collection.updateOne(
      { agent_id },
      {
        $set: {
          current_task: draftAgent.current_task,
          last_seen: draftAgent.last_seen,
          status: nextStatus,
          updatedAt: new Date()
        }
      }
    );

    const agent = await collection.findOne({ agent_id });

    await recordMetric(database, {
      agent: agent.agent_id,
      project: agent.project,
      metric_type: "agent_registry",
      name: "agent_heartbeat",
      data: { status: agent.status }
    });

    await trackActivity(database, {
      agent: agent.agent_id,
      project: agent.project,
      type: "decision",
      message: `Heartbeat received from ${agent.agent_id} (${agent.status})`,
      related_task: agent.current_task || null,
      resource: `agent:${agent.agent_id}`
    });

    return { success: true, agent };
  })
);

app.get(
  "/agent/list",
  routeHandler("agents", async ({ req, collection, db: database }) => {
    await refreshAgentStatuses(database, req.query.project);

    const filter = req.query.project ? { project: req.query.project } : {};
    return collection.find(filter).limit(50).toArray();
  })
);

app.post(
  "/task",
  routeHandler("tasks", async ({ req, collection, db: database }) => {
    const task = await buildDerivedTaskState(database, req.body);
    await collection.insertOne(normalizeMemory(task));

    await recordMetric(database, {
      agent: task.agent,
      project: task.project,
      metric_type: "task_completion",
      name: "task_created",
      data: {
        task_id: task.task_id,
        priority: task.priority,
        priorityScore: task.priorityScore
      }
    });

    await eventBus.emit("task_created", { db: database, task });

    const storedTask = await collection.findOne({ task_id: task.task_id });

    await trackActivity(database, {
      agent: task.agent,
      project: task.project,
      type: "task_update",
      message: `Task ${task.task_id} created`,
      related_task: task.task_id,
      resource: `task:${task.task_id}`
    });

    return { success: true, task: storedTask, warnings: [] };
  })
);

app.post(
  "/task/assign",
  routeHandler("tasks", async ({ req, collection, db: database }) => {
    const { task_id, agent_id } = req.body;
    const actor = req.body.agent || agent_id || "system";

    if (!task_id || !agent_id) {
      return { error: "Missing task_id or agent_id" };
    }

    const existingTask = await collection.findOne({ task_id });

    if (!existingTask) {
      return { error: "Task not found" };
    }

    const collaboration = await evaluateCollaborationRisk(database, {
      project: existingTask.project,
      actor,
      resource: `task:${task_id}`,
      relatedTaskId: task_id,
      currentDocument: existingTask,
      expectedUpdatedAt: req.body.expectedUpdatedAt,
      expectedVersion: req.body.expectedVersion
    });

    await collection.updateOne(
      { task_id },
      {
        $set: {
          assigned_to: agent_id,
          status:
            existingTask.status === "pending" ? "in_progress" : existingTask.status,
          updatedAt: new Date()
        }
      }
    );

    const task = await collection.findOne({ task_id });
    await syncAgentTaskState(database, existingTask, task);

    await trackActivity(database, {
      agent: actor,
      project: task.project,
      type: "task_update",
      message: `Task ${task_id} assigned to ${agent_id}`,
      related_task: task_id,
      resource: `task:${task_id}`
    });

    await trackCollaborationWarnings(database, {
      actor,
      project: task.project,
      resource: `task:${task_id}`,
      warnings: collaboration.warnings,
      relatedTaskId: task_id,
      collectionName: "tasks",
      filter: { task_id }
    });

    return { success: true, task, warnings: collaboration.warnings };
  })
);

app.post(
  "/task/update",
  routeHandler("tasks", async ({ req, collection, db: database }) => {
    const { task_id, updates = {} } = req.body;
    const actor = req.body.agent || "system";

    if (!task_id) {
      return { error: "Missing task_id" };
    }

    const existingTask = await collection.findOne({ task_id });

    if (!existingTask) {
      return { error: "Task not found" };
    }

    const nextValues = {};
    const scalarFields = [
      "title",
      "description",
      "assigned_to",
      "status",
      "priority",
      "result",
      "blocker"
    ];

    for (const field of scalarFields) {
      if (updates[field] !== undefined) {
        nextValues[field] = updates[field];
      }
    }

    for (const field of [
      "dependencies",
      "required_capabilities",
      "relatedContexts",
      "relatedIssues"
    ]) {
      if (updates[field] !== undefined) {
        nextValues[field] = toStringArray(updates[field]);
      }
    }

    if (!Object.keys(nextValues).length) {
      return { error: "No valid updates provided" };
    }

    const collaboration = await evaluateCollaborationRisk(database, {
      project: existingTask.project,
      actor,
      resource: `task:${task_id}`,
      relatedTaskId: task_id,
      currentDocument: existingTask,
      expectedUpdatedAt: req.body.expectedUpdatedAt,
      expectedVersion: req.body.expectedVersion
    });

    const derivedTask = await buildDerivedTaskState(database, {
      ...existingTask,
      ...nextValues,
      id: existingTask.id,
      task_id: existingTask.task_id,
      createdAt: existingTask.createdAt
    });
    const { _id, ...existingTaskData } = existingTask;

    await collection.updateOne(
      { task_id },
      {
        $set: normalizeMemory({
          ...existingTaskData,
          ...derivedTask,
          id: existingTask.id,
          task_id: existingTask.task_id,
          createdAt: existingTask.createdAt
        })
      }
    );

    const task = await collection.findOne({ task_id });
    await syncAgentTaskState(database, existingTask, task);

    if (existingTask.status !== "completed" && task.status === "completed") {
      await recordMetric(database, {
        agent: task.agent,
        project: task.project,
        metric_type: "task_completion",
        name: "task_completed",
        data: {
          task_id: task.task_id,
          assigned_to: task.assigned_to
        }
      });
    }

    await trackActivity(database, {
      agent: actor,
      project: task.project,
      type: "task_update",
      message: `Task ${task_id} updated`,
      related_task: task_id,
      resource: `task:${task_id}`,
      metadata: {
        status: task.status
      }
    });

    await trackCollaborationWarnings(database, {
      actor,
      project: task.project,
      resource: `task:${task_id}`,
      warnings: collaboration.warnings,
      relatedTaskId: task_id,
      collectionName: "tasks",
      filter: { task_id }
    });

    return { success: true, task, warnings: collaboration.warnings };
  })
);

app.get(
  "/task/list",
  routeHandler("tasks", async ({ req, collection }) => {
    const {
      project,
      assigned_to,
      created_by,
      status,
      include_completed,
      limit
    } = req.query;

    const filter = {};

    if (project) {
      filter.project = project;
    }

    if (assigned_to) {
      filter.assigned_to = assigned_to;
    }

    if (created_by) {
      filter.created_by = created_by;
    }

    if (status) {
      filter.status = status;
    } else if (!parseBoolean(include_completed, true)) {
      filter.status = { $ne: "completed" };
    }

    return collection
      .find(filter)
      .sort({ priorityScore: -1, priority: -1, updatedAt: -1, createdAt: -1 })
      .limit(parsePositiveInt(limit, 50))
      .toArray();
  })
);

app.post(
  "/issue",
  routeHandler("issues", async ({ req, collection, db: database }) => {
    const { title, type } = req.body;
    const allowedTypes = new Set(["bug", "note", "blocker", "insight"]);

    if (!hasText(title)) {
      return { error: "Missing issue title" };
    }

    if (!allowedTypes.has(type)) {
      return { error: "Invalid issue type" };
    }

    const issue = new IssueModel(req.body);
    await collection.insertOne(normalizeMemory(issue));

    await recordMetric(database, {
      agent: issue.agent,
      project: issue.project,
      metric_type: "issue_tracking",
      name: "issue_created",
      data: { issue_id: issue.issue_id, type: issue.type }
    });

    await trackActivity(database, {
      agent: issue.agent,
      project: issue.project,
      type: "action",
      message: `Issue ${issue.issue_id} created (${issue.type})`,
      related_task: issue.relatedTasks?.[0] || null,
      resource: `issue:${issue.issue_id}`
    });

    return { success: true, issue, warnings: [] };
  })
);

app.post(
  "/issue/resolve",
  routeHandler("issues", async ({ req, collection, db: database }) => {
    const { issue_id, resolution, resolvedBy } = req.body;
    const actor = req.body.agent || resolvedBy || "system";

    if (!issue_id) {
      return { error: "Missing issue_id" };
    }

    const existingIssue = await collection.findOne({ issue_id });

    if (!existingIssue) {
      return { error: "Issue not found" };
    }

    const collaboration = await evaluateCollaborationRisk(database, {
      project: existingIssue.project,
      actor,
      resource: `issue:${issue_id}`,
      relatedTaskId: firstNonEmptyString(
        req.body.related_task,
        existingIssue.relatedTasks?.[0]
      ),
      currentDocument: existingIssue,
      expectedUpdatedAt: req.body.expectedUpdatedAt,
      expectedVersion: req.body.expectedVersion
    });

    const updateResult = await collection.updateOne(
      { issue_id },
      {
        $set: {
          status: "resolved",
          resolution: resolution || "Resolved",
          resolvedBy: resolvedBy || req.body.agent || "system",
          resolvedAt: new Date(),
          updatedAt: new Date()
        }
      }
    );

    const issue = await collection.findOne({ issue_id });

    await recordMetric(database, {
      agent: issue.agent,
      project: issue.project,
      metric_type: "issue_tracking",
      name: "issue_resolved",
      data: { issue_id: issue.issue_id, resolvedBy: issue.resolvedBy }
    });

    await trackActivity(database, {
      agent: actor,
      project: issue.project,
      type: "action",
      message: `Issue ${issue.issue_id} resolved`,
      related_task: issue.relatedTasks?.[0] || null,
      resource: `issue:${issue.issue_id}`
    });

    await trackCollaborationWarnings(database, {
      actor,
      project: issue.project,
      resource: `issue:${issue.issue_id}`,
      warnings: collaboration.warnings,
      relatedTaskId: issue.relatedTasks?.[0],
      collectionName: "issues",
      filter: { issue_id }
    });

    return { success: true, issue, warnings: collaboration.warnings };
  })
);

app.get(
  "/issue/list",
  routeHandler("issues", async ({ req, collection }) => {
    const filter = {};

    if (req.query.project) {
      filter.project = req.query.project;
    }

    if (req.query.status) {
      filter.status = req.query.status;
    }

    if (req.query.type) {
      filter.type = req.query.type;
    }

    if (req.query.related_task) {
      filter.relatedTasks = req.query.related_task;
    }

    if (req.query.related_context) {
      filter.relatedContexts = req.query.related_context;
    }

    return collection
      .find(filter)
      .sort({ updatedAt: -1, createdAt: -1 })
      .limit(parsePositiveInt(req.query.limit, 50))
      .toArray();
  })
);

app.post(
  "/message",
  routeHandler("messages", async ({ req, collection, db: database }) => {
    const message = new MessageModel(req.body);
    await collection.insertOne(normalizeMemory(message));

    await trackActivity(database, {
      agent: message.from_agent,
      project: message.project,
      type: "decision",
      message: `Message sent to ${message.to_agent || "broadcast"}`,
      related_task: message.related_task || null,
      resource: message.to_agent ? `agent:${message.to_agent}` : "message:broadcast"
    });

    return { success: true, message };
  })
);

app.get(
  "/message/:agent_id",
  routeHandler("messages", async ({ req, collection }) => {
    const { project, limit } = req.query;
    const filter = {
      $or: [{ to_agent: req.params.agent_id }, { to_agent: null }]
    };

    if (project) {
      filter.project = project;
    }

    return collection
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(parsePositiveInt(limit, 50))
      .toArray();
  })
);

app.post(
  "/project-map",
  routeHandler("project_map", async ({ req, collection, db: database }) => {
    const entry = new ProjectMapModel(req.body);
    const actor = req.body.agent || "system";

    if (!entry.file_path) {
      return { error: "Missing file_path" };
    }

    const filter = {
      project: entry.project,
      file_path: entry.file_path
    };
    const existingEntry = await collection.findOne(filter);
    const collaboration = await evaluateCollaborationRisk(database, {
      project: entry.project,
      actor,
      resource: `project-map:${entry.file_path}`,
      relatedTaskId: firstNonEmptyString(
        req.body.related_task,
        entry.related_tasks?.[0],
        existingEntry?.related_tasks?.[0]
      ),
      currentDocument: existingEntry,
      expectedUpdatedAt: req.body.expectedUpdatedAt,
      expectedVersion: req.body.expectedVersion
    });

    await collection.updateOne(
      filter,
      { $set: normalizeMemory(entry) },
      { upsert: true }
    );

    const storedEntry = await collection.findOne(filter);

    await trackActivity(database, {
      agent: actor,
      project: entry.project,
      type: "action",
      message: `Project map entry updated for ${entry.file_path}`,
      related_task: storedEntry.related_tasks?.[0] || null,
      resource: `project-map:${entry.file_path}`
    });

    await trackCollaborationWarnings(database, {
      actor,
      project: entry.project,
      resource: `project-map:${entry.file_path}`,
      warnings: collaboration.warnings,
      relatedTaskId: storedEntry.related_tasks?.[0],
      collectionName: "project_map",
      filter
    });

    return { success: true, entry: storedEntry, warnings: collaboration.warnings };
  })
);

app.get(
  "/project-map",
  routeHandler("project_map", async ({ req, collection }) => {
    const { project, file_path, type, query = "", limit } = req.query;
    const filter = {};

    if (project) {
      filter.project = project;
    }

    if (file_path) {
      filter.file_path = file_path;
    }

    if (type) {
      filter.type = type;
    }

    if (query.trim()) {
      filter.$text = { $search: query.trim() };

      return collection
        .find(filter, { projection: { score: { $meta: "textScore" } } })
        .sort({ score: { $meta: "textScore" }, updatedAt: -1 })
        .limit(parsePositiveInt(limit, 100))
        .toArray();
    }

    return collection
      .find(filter)
      .sort({ updatedAt: -1, createdAt: -1 })
      .limit(parsePositiveInt(limit, 100))
      .toArray();
  })
);

app.get(
  "/metrics",
  routeHandler("metrics", async ({ req, collection }) => {
    const filter = {};

    if (req.query.project) {
      filter.project = req.query.project;
    }

    if (req.query.metric_type) {
      filter.metric_type = req.query.metric_type;
    }

    if (req.query.name) {
      filter.name = req.query.name;
    }

    return collection
      .find(filter)
      .sort({ recordedAt: -1 })
      .limit(parsePositiveInt(req.query.limit, 100))
      .toArray();
  })
);

app.get("/", (_req, res) => {
  res.send("MCP Memory Server Running");
});

export async function startServer({ port = DEFAULT_PORT, silent = false } = {}) {
  if (server) {
    return { app, db: getDb(), server, port };
  }

  if (!startupPromise) {
    startupPromise = (async () => {
      client = new MongoClient(process.env.MONGO_URI);
      await client.connect();

      db = client.db(DB_NAME);
      initLogger(db);

      await ensureIndexes(db);
      await cleanupExpiredLocks(db);

      app.locals.db = db;
      app.locals.logError = logError;

      await logInfo("MongoDB connected", { dbName: DB_NAME });

      server = await new Promise((resolve, reject) => {
        const listener = app.listen(port, () => resolve(listener));
        listener.on("error", reject);
      });

      if (!silent) {
        console.log(`MCP Server running on port ${port}`);
      }

      return { app, db, server, port };
    })().catch(async (error) => {
      startupPromise = null;
      db = null;
      server = null;

      if (client) {
        await client.close();
      }

      throw error;
    });
  }

  return startupPromise;
}

export async function stopServer() {
  if (server?.listening) {
    await new Promise((resolve) => server.close(resolve));
  }

  if (client) {
    await client.close();
  }

  client = null;
  db = null;
  server = null;
  startupPromise = null;
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  startServer().catch((error) => {
    console.error("Failed to start MCP Server:", error);
    process.exit(1);
  });
}
