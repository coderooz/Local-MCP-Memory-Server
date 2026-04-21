#!/usr/bin/env node

import dotenv from 'dotenv';
import express from 'express';
import { MongoClient } from 'mongodb';
import path from 'path';
import { fileURLToPath } from 'url';

import { initLogger, logError, logInfo } from './shared/utils/logger.js';
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
  normalizeMemory,
} from './core/mcp/models.js';
import {
  buildTaskSchedule,
  autoAssignTask,
  computeTaskPriorityScore,
  deriveAgentStatus,
  refreshAgentStatuses,
} from './utils/coordinationEngine.js';
import {
  acquireResourceLock,
  cleanupExpiredLocks,
  evaluateCollaborationRisk,
  listResourceLocks,
  releaseResourceLock,
} from './utils/collaborationEngine.js';
import { createEventBus } from './utils/eventBus.js';
import { recordMetric } from './utils/metrics.js';
import {
  buildProjectDescriptorFilter,
  detectAndResolveMemoryConflicts,
  evaluateMemoryState,
  getConnectedContextData,
  optimizeMemories,
  upsertProjectDescriptor,
  updateContextWithVersioning,
} from './utils/memoryEngine.js';
import {
  resetMCP,
  estimateResetImpact,
  RESET_LEVELS,
  RESET_CONFIRMATION_CODE,
} from './utils/resetEngine.js';
import { recordActivity } from './utils/activityTracker.js';
import { routeHandler } from './utils/routeHandler.js';
import { validateInput, sanitizeSearchQuery, validateProjectName, validateAgentId, createErrorResponse } from './utils/security-validators.js';
import { resolveProjectIdentity } from './utils/projectIdentity.js';
import { getEmulatorPlugin } from './plugins/emulator/index.js';
import { getPortRegistry, MCPLogger } from './utils/mcp-port-registry.js';
import {
  setMcpStopped,
  setCurrentProject,
  setProjectRoot,
  readRuntimeFile,
  validateRuntime,
  recoverRuntimeFromActiveServers,
  withProjectLock
} from './core/config/runtime-state.js';
import { PROJECT_NAME } from './core/config/project-config-loader.js';
import { getPortManager } from './core/config/portManager.js';
import {
  createFeedback,
  getFeedbackById,
  listFeedbacks,
  updateFeedback,
  voteFeedback,
  resolveFeedback,
  updateFeedbackSeverity,
  linkFeedbackToContext,
  linkFeedbackToTask,
  createFeedbackFromTestFailure,
  createImprovementFromPattern,
  FEEDBACK_TYPE,
} from './src/domains/feedback/index.js';
import {
  createRoom,
  getRoomById,
  listRooms,
  updateRoom,
  deleteRoom,
  joinRoom,
  leaveRoom,
  sendMessage,
  getMessages,
  getRecentMessages,
  editMessage,
  deleteMessage,
  pinMessage,
  getPinnedMessages,
  broadcastToRoom,
  announceTaskTakeover,
  requestHelpInRoom,
  shareFindingInRoom,
  getOrCreateDefaultRoom,
  CHAT_MESSAGE_TYPE,
} from './src/domains/chat/index.js';
import {
  getSessionManager,
  getConnectionManager,
  extractSessionContext,
  sessionAwareMiddleware,
  createSessionScope,
  filterBySession,
  SESSION_EVENTS,
  CONNECTION_EVENTS,
  SESSION_STATUS,
} from './src/core/session/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({
  path: path.join(__dirname, '.env'),
  quiet: true,
});

const DB_NAME = process.env.MONGO_DB_NAME || 'mcp_memory';
const DEFAULT_PORT = Number(process.env.PORT || 0);
const eventBus = createEventBus();

const app = express();
app.use(express.json());

import { rateLimiter, agentRateLimiter } from './utils/rate-limiter.js';

app.use(rateLimiter);
app.use(agentRateLimiter);

app.use(sessionAwareMiddleware({ autoCreate: true }));

const sessionManager = getSessionManager();
const connectionManager = getConnectionManager();

sessionManager.on(SESSION_EVENTS.DISCONNECTED, async (data) => {
  const { session, reason } = data;
  try {
    await logError(new Error(`Session disconnected: ${reason}`), {
      sessionId: session.sessionId,
      agent: session.agent,
      project: session.project,
    });
  } catch {}
});

sessionManager.on(SESSION_EVENTS.EXPIRED, async (data) => {
  const { session, reason } = data;
  try {
    await logError(new Error(`Session expired: ${reason}`), {
      sessionId: session.sessionId,
      agent: session.agent,
      project: session.project,
    });
  } catch {}
});

connectionManager.on(CONNECTION_EVENTS.DROPPED, async (data) => {
  const { connection, reason } = data;
  try {
    await logError(new Error(`Connection dropped: ${reason}`), {
      connectionId: connection.connectionId,
      sessionId: connection.sessionId,
      agent: connection.agent,
      project: connection.project,
    });
  } catch {}
});

let client = null;
let db = null;
let server = null;
let startupPromise = null;
let activeServerPort = null;
let activeRuntimeSignature = process.env.MCP_RUNTIME_SIGNATURE || null;
let activeProjectName = process.env.MCP_PROJECT || PROJECT_NAME || 'local-mcp-memory';

function getDb() {
  if (!db) {
    throw new Error('Database not ready');
  }

  return db;
}

export function getDbInstance() {
  return getDb();
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

  if (typeof value === 'boolean') {
    return value;
  }

  return String(value).toLowerCase() === 'true';
}

function toStringArray(value) {
  return Array.isArray(value)
    ? value.filter((item) => typeof item === 'string' && item.trim())
    : [];
}

function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function sanitizeIdentifier(value) {
  if (typeof value !== 'string') {
    return String(value);
  }
  return value
    .replace(/[<>]/g, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+=/gi, '')
    .trim()
    .substring(0, 128);
}

function sanitizeHtml(input) {
  if (typeof input !== 'string') {
    return input;
  }
  return input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+=/gi, '');
}

async function waitForListenerReady(listener) {
  return new Promise((resolve, reject) => {
    const onListening = () => {
      cleanup();
      resolve();
    };
    const onError = (error) => {
      cleanup();
      reject(error);
    };
    const cleanup = () => {
      listener.off('listening', onListening);
      listener.off('error', onError);
    };

    listener.on('listening', onListening);
    listener.on('error', onError);
  });
}

async function closeListener(listener) {
  if (!listener || typeof listener.close !== 'function') {
    return;
  }

  await new Promise((resolve) => {
    try {
      listener.close(() => resolve());
    } catch {
      resolve();
    }
  });
}

function rankSearchResults(results, query) {
  const now = new Date();
  const words = query.toLowerCase().split(' ').filter(Boolean);

  return results
    .map((item) => {
      let score = 0;
      const content = item.content?.toLowerCase() || '';
      const summary = item.summary?.toLowerCase() || '';

      const matches = words.filter(
        (word) => content.includes(word) || summary.includes(word)
      ).length;

      score += matches * 2;
      score += (item.importance || 3) * 2;

      const ageHours = (now - new Date(item.createdAt || now)) / 3600000;
      score += Math.max(0, 5 - ageHours / 24);
      score += Math.log((item.accessCount || 0) + 1);

      if (item.type === 'project') {
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
    'type',
    'content',
    'summary',
    'importance',
    'lifecycle',
    'scope',
    'updateReason',
  ];

  for (const field of scalarFields) {
    if (updates[field] !== undefined) {
      payload[field] = updates[field];
    }
  }

  if (updates.metadata && typeof updates.metadata === 'object') {
    payload.metadata = updates.metadata;
  }

  if (updates.projectDescriptor && typeof updates.projectDescriptor === 'object') {
    payload.projectDescriptor = updates.projectDescriptor;
  }

  for (const field of [
    'tags',
    'relatedContexts',
    'relatedActions',
    'relatedTasks',
    'relatedIssues',
    'conflictsWith',
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
  { actor, project, resource, warnings, relatedTaskId, collectionName, filter }
) {
  if (!warnings?.length) {
    return [];
  }

  const activityIds = [];

  for (const warning of warnings) {
    const activity = await trackActivity(database, {
      agent: actor || 'system',
      project,
      type: 'decision',
      message: warning,
      related_task: relatedTaskId || null,
      resource,
      metadata: {
        category: 'collaboration_warning',
      },
    });

    if (activity?.activity_id) {
      activityIds.push(activity.activity_id);
    }
  }

  if (collectionName && filter && activityIds.length) {
    await database.collection(collectionName).updateOne(filter, {
      $addToSet: {
        conflictsWith: { $each: activityIds },
      },
    });
  }

  await recordMetric(database, {
    agent: actor || 'system',
    project: project || 'default',
    metric_type: 'collaboration',
    name: 'collaboration_warning',
    value: warnings.length,
    data: {
      resource,
      relatedTaskId,
      warnings,
    },
  });

  return activityIds;
}

async function ensureIndexes(database) {
  await Promise.all([
    database.collection('contexts').createIndex({ id: 1 }, { unique: true }),
    database.collection('contexts').createIndex({
      content: 'text',
      summary: 'text',
      tags: 'text',
    }),
    database.collection('contexts').createIndex({
      project: 1,
      type: 1,
      lifecycle: 1,
      updatedAt: -1,
    }),
    database.collection('contexts').createIndex({ project: 1, conflictsWith: 1 }),
    database.collection('actions').createIndex({ id: 1 }, { unique: true }),
    database.collection('actions').createIndex({ contextRefs: 1 }),
    database.collection('sessions').createIndex({ sessionId: 1 }, { unique: true }),
    database.collection('logs').createIndex({ createdAt: -1 }),
    database.collection('agents').createIndex({ agent_id: 1 }, { unique: true }),
    database.collection('agents').createIndex({ project: 1, status: 1, last_seen: -1 }),
    database.collection('tasks').createIndex({ task_id: 1 }, { unique: true }),
    database.collection('tasks').createIndex({ project: 1, status: 1, priority: -1 }),
    database.collection('tasks').createIndex({ project: 1, assigned_to: 1, updatedAt: -1 }),
    database.collection('messages').createIndex({ message_id: 1 }, { unique: true }),
    database.collection('messages').createIndex({ project: 1, to_agent: 1, createdAt: -1 }),
    database.collection('project_map').createIndex({ project: 1, file_path: 1 }),
    database.collection('project_map').createIndex({ project: 1, type: 1, updatedAt: -1 }),
    database.collection('project_map').createIndex({
      file_path: 'text',
      summary: 'text',
      key_details: 'text',
      dependencies: 'text',
      exports: 'text',
      tags: 'text',
    }),
    database
      .collection('memory_versions')
      .createIndex({ context_id: 1, context_version: -1 }, { unique: true }),
    database.collection('memory_versions').createIndex({ project: 1, changedAt: -1 }),
    database.collection('issues').createIndex({ issue_id: 1 }, { unique: true }),
    database.collection('issues').createIndex({ project: 1, status: 1, type: 1, updatedAt: -1 }),
    database.collection('issues').createIndex({ relatedTasks: 1 }),
    database.collection('issues').createIndex({ relatedContexts: 1 }),
    database.collection('activity').createIndex({ activity_id: 1 }, { unique: true }),
    database.collection('activity').createIndex({ project: 1, timestamp: -1 }),
    database.collection('activity').createIndex({ project: 1, related_task: 1, timestamp: -1 }),
    database.collection('resource_locks').createIndex({ lock_id: 1 }, { unique: true }),
    database
      .collection('resource_locks')
      .createIndex({ project: 1, resource: 1, locked_by: 1 }, { unique: true }),
    database.collection('resource_locks').createIndex({ expiresAt: 1 }),
    database.collection('metrics').createIndex({ metric_id: 1 }, { unique: true }),
    database.collection('metrics').createIndex({
      project: 1,
      metric_type: 1,
      name: 1,
      recordedAt: -1,
    }),
    database.collection('feedbacks').createIndex({ feedback_id: 1 }, { unique: true }),
    database.collection('feedbacks').createIndex({
      project: 1,
      status: 1,
      type: 1,
      severity: 1,
      createdAt: -1,
    }),
    database.collection('feedbacks').createIndex({ related_contexts: 1 }),
    database.collection('feedbacks').createIndex({ related_tasks: 1 }),
    database.collection('feedbacks').createIndex({ voters: 1 }),
    database.collection('chat_rooms').createIndex({ room_id: 1 }, { unique: true }),
    database.collection('chat_rooms').createIndex({ project: 1, scope: 1 }),
    database.collection('chat_rooms').createIndex({ participants: 1 }),
    database.collection('chat_messages').createIndex({ message_id: 1 }, { unique: true }),
    database.collection('chat_messages').createIndex({ room_id: 1, createdAt: -1 }),
    database.collection('chat_messages').createIndex({ from_agent: 1, createdAt: -1 }),
  ]);
}

async function buildDerivedTaskState(database, taskInput) {
  const task = new TaskModel(taskInput);
  const priorityScore = await computeTaskPriorityScore(database, task);
  const schedule = await buildTaskSchedule(database, task);
  let status = task.status;

  if (task.status !== 'completed') {
    status = schedule.status === 'blocked' ? 'blocked' : task.status;
  }

  return new TaskModel({
    ...task,
    priorityScore,
    status,
    scheduledFor: schedule.scheduledFor,
    schedulingNotes: schedule.schedulingNotes,
  });
}

async function syncAgentTaskState(database, previousTask, nextTask) {
  const previousAgent = previousTask?.assigned_to;
  const nextAgent = nextTask?.assigned_to;

  if (previousAgent && previousAgent !== nextAgent) {
    await database.collection('agents').updateOne(
      { agent_id: previousAgent },
      {
        $set: {
          current_task: null,
          status: 'idle',
          updatedAt: new Date(),
        },
      }
    );
  }

  if (nextAgent) {
    await database.collection('agents').updateOne(
      { agent_id: nextAgent },
      {
        $set: {
          current_task:
            nextTask.status === 'completed' || nextTask.status === 'blocked'
              ? null
              : nextTask.task_id,
          status: nextTask.status === 'in_progress' ? 'active' : 'idle',
          last_seen: new Date(),
          updatedAt: new Date(),
        },
      }
    );
  }
}

eventBus.on('task_created', async ({ db: database, task }) => {
  const storedTask = await database.collection('tasks').findOne({ task_id: task.task_id });

  if (!storedTask || storedTask.assigned_to) {
    return;
  }

  const selectedAgent = await autoAssignTask(database, storedTask);

  if (!selectedAgent) {
    return;
  }

  const nextStatus = storedTask.status === 'pending' ? 'in_progress' : storedTask.status;

  await database.collection('tasks').updateOne(
    { task_id: storedTask.task_id },
    {
      $set: {
        assigned_to: selectedAgent.agent_id,
        status: nextStatus,
        updatedAt: new Date(),
      },
    }
  );

  await database.collection('agents').updateOne(
    { agent_id: selectedAgent.agent_id },
    {
      $set: {
        current_task: nextStatus === 'in_progress' ? storedTask.task_id : null,
        status: nextStatus === 'in_progress' ? 'active' : 'idle',
        last_seen: new Date(),
        updatedAt: new Date(),
      },
    }
  );

  await recordMetric(database, {
    agent: task.agent,
    project: task.project,
    metric_type: 'task_orchestration',
    name: 'task_auto_assigned',
    data: {
      task_id: storedTask.task_id,
      assigned_to: selectedAgent.agent_id,
    },
  });

  await trackActivity(database, {
    agent: task.agent,
    project: task.project,
    type: 'task_update',
    message: `Task ${storedTask.task_id} auto-assigned to ${selectedAgent.agent_id}`,
    related_task: storedTask.task_id,
    resource: `task:${storedTask.task_id}`,
  });
});

eventBus.on('memory_updated', async ({ db: database, context, agent }) => {
  const storedContext = await database.collection('contexts').findOne({ id: context.id });

  if (!storedContext) {
    return;
  }

  const evaluatedContext = await evaluateMemoryState(database, storedContext, {
    reason: 'Event-driven memory evaluation',
    changedBy: agent || storedContext.agent || 'system',
  });

  await detectAndResolveMemoryConflicts(database, evaluatedContext || storedContext);

  await trackActivity(database, {
    agent: agent || storedContext.agent || 'system',
    project: storedContext.project,
    type: 'decision',
    message: `Memory ${storedContext.id} re-evaluated after update`,
    resource: `context:${storedContext.id}`,
  });
});

async function insertContextWithRetry(collection, contextData, maxRetries = 3) {
  if (!contextData.content && !contextData.summary) {
    throw new Error('content or summary is required');
  }

  const sanitizedContent =
    typeof contextData.content === 'string'
      ? contextData.content.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      : contextData.content;

  const sanitizedSummary = sanitizeHtml(contextData.summary || '');

  const sanitizedData = {
    ...contextData,
    content: sanitizedContent,
    summary: sanitizedSummary,
  };

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const context = new ContextModel(sanitizedData);
      await collection.insertOne(normalizeMemory(context));
      return context;
    } catch (error) {
      if (error.code === 11000 && attempt < maxRetries - 1) {
        continue;
      }
      throw error;
    }
  }
}

app.post(
  '/context',
  routeHandler('contexts', async ({ req, collection, db: database }) => {
    const isProjectDescriptor = req.body.type === 'project' || Boolean(req.body.projectDescriptor);
    const actor = req.body.agent || 'system';

    if (req.body.project) {
      const projectValidation = validateProjectName(req.body.project);
      if (!projectValidation.valid) {
        throw new Error(projectValidation.error);
      }
    }

    if (req.body.agent) {
      const agentValidation = validateAgentId(req.body.agent);
      if (!agentValidation.valid) {
        throw new Error(agentValidation.error);
      }
    }

    if (isProjectDescriptor) {
      const existingDescriptor = await database
        .collection('contexts')
        .findOne(buildProjectDescriptorFilter(req.body.project));
      const collaboration = await evaluateCollaborationRisk(database, {
        project: req.body.project,
        actor,
        resource: 'project:descriptor',
        currentDocument: existingDescriptor,
        expectedUpdatedAt: req.body.expectedUpdatedAt,
        expectedVersion: req.body.expectedVersion,
      });
      const context = await upsertProjectDescriptor(database, req.body);

      await recordMetric(database, {
        agent: context.agent,
        project: context.project,
        metric_type: 'memory_usage',
        name: 'project_descriptor_upserted',
        data: { context_id: context.id },
      });

      await eventBus.emit('memory_updated', {
        db: database,
        context,
        agent: context.agent,
      });

      await trackActivity(database, {
        agent: actor,
        project: context.project,
        type: 'decision',
        message: `Project descriptor stored for ${context.project}`,
        resource: 'project:descriptor',
      });

      await trackCollaborationWarnings(database, {
        actor,
        project: context.project,
        resource: 'project:descriptor',
        warnings: collaboration.warnings,
        collectionName: 'contexts',
        filter: { id: context.id },
      });

      return { success: true, context, warnings: collaboration.warnings };
    }

    const context = await insertContextWithRetry(collection, req.body);

    await recordMetric(database, {
      agent: context.agent,
      project: context.project,
      metric_type: 'memory_usage',
      name: 'context_created',
      data: { context_id: context.id, type: context.type },
    });

    await eventBus.emit('memory_updated', {
      db: database,
      context,
      agent: context.agent,
    });

    const storedContext = await collection.findOne({ id: context.id });

    await logInfo('Context stored', {
      agent: context.agent,
      project: context.project,
    });

    await trackActivity(database, {
      agent: context.agent,
      project: context.project,
      type: 'decision',
      message: `Context ${context.id} stored`,
      resource: `context:${context.id}`,
      metadata: { context_type: context.type },
    });

    return { success: true, context: storedContext, warnings: [] };
  })
);

app.post(
  '/project/descriptor',
  routeHandler('contexts', async ({ req, db: database }) => {
    const { name, category, description } = req.body;
    const actor = req.body.agent || 'system';

    if (!hasText(name)) {
      return { error: 'Missing project descriptor name' };
    }

    if (!hasText(category)) {
      return { error: 'Missing project descriptor category' };
    }

    if (!hasText(description)) {
      return { error: 'Missing project descriptor description' };
    }

    const existingDescriptor = await database
      .collection('contexts')
      .findOne(buildProjectDescriptorFilter(req.body.project));
    const collaboration = await evaluateCollaborationRisk(database, {
      project: req.body.project,
      actor,
      resource: 'project:descriptor',
      currentDocument: existingDescriptor,
      expectedUpdatedAt: req.body.expectedUpdatedAt,
      expectedVersion: req.body.expectedVersion,
    });
    const context = await upsertProjectDescriptor(database, req.body);

    await recordMetric(database, {
      agent: context.agent,
      project: context.project,
      metric_type: 'memory_usage',
      name: 'project_descriptor_upserted',
      data: { context_id: context.id },
    });

    await eventBus.emit('memory_updated', {
      db: database,
      context,
      agent: context.agent,
    });

    await trackActivity(database, {
      agent: actor,
      project: context.project,
      type: 'decision',
      message: `Project descriptor updated for ${context.project}`,
      resource: 'project:descriptor',
    });

    await trackCollaborationWarnings(database, {
      actor,
      project: context.project,
      resource: 'project:descriptor',
      warnings: collaboration.warnings,
      collectionName: 'contexts',
      filter: { id: context.id },
    });

    return { success: true, context, warnings: collaboration.warnings };
  })
);

app.get(
  '/project/descriptor',
  routeHandler('contexts', async ({ req, collection }) => {
    const project = req.query.project;

    if (!project) {
      return { error: 'Missing project' };
    }

    const context = await collection.findOne(buildProjectDescriptorFilter(project));
    return context || { error: 'Project descriptor not found' };
  })
);

app.post(
  '/context/search',
  routeHandler('contexts', async ({ req, collection, db: database }) => {
    const { agent, project, query = '', limit = 10, lifecycle } = req.body;

    if (project) {
      const projectValidation = validateProjectName(project);
      if (!projectValidation.valid) {
        throw new Error(projectValidation.error);
      }
    }

    if (agent) {
      const agentValidation = validateAgentId(agent);
      if (!agentValidation.valid) {
        throw new Error(agentValidation.error);
      }
    }

    const sanitizedQuery = sanitizeSearchQuery(query);
    const safeLimit = Math.min(Math.max(parseInt(limit) || 10, 1), 100);
    let ranked = [];
    let ids = [];

    try {
      const baseQuery = MemoryQueryBuilder.build({
        agent,
        project,
        query: sanitizedQuery,
        lifecycle,
      });

      const results = await collection.find(baseQuery).limit(50).toArray();
      ranked = rankSearchResults(results, sanitizedQuery).slice(0, safeLimit);
      ids = ranked.map((item) => item.id);

      if (ids.length) {
        await collection.updateMany(
          { id: { $in: ids } },
          {
            $inc: { accessCount: 1 },
            $set: { lastAccessedAt: new Date() },
          }
        );

        const touchedEntries = await collection.find({ id: { $in: ids } }).toArray();

        await Promise.all(
          touchedEntries.map((entry) =>
            evaluateMemoryState(database, entry, {
              reason: 'Search access evaluation',
              changedBy: agent || 'system',
            })
          )
        );
      }
    } catch (searchError) {
      throw searchError;
    }

    await recordMetric(database, {
      agent: agent || 'system',
      project: project || 'default',
      metric_type: 'memory_usage',
      name: 'context_search',
      value: ids.length,
      data: { query, limit },
    });

    const refreshed = ids.length ? await collection.find({ id: { $in: ids } }).toArray() : [];
    const refreshedMap = new Map(refreshed.map((entry) => [entry.id, entry]));

    return ranked.map((item) => refreshedMap.get(item.id) || item);
  })
);

app.post(
  '/context/update',
  routeHandler('contexts', async ({ req, db: database }) => {
    const { context_id, updates = {}, reason } = req.body;
    const actor = req.body.agent || 'system';

    if (!context_id) {
      return { error: 'Missing context_id' };
    }

    const existing = await database.collection('contexts').findOne({ id: context_id });

    if (!existing) {
      return { error: 'Context not found' };
    }

    const payload = buildContextUpdatePayload(updates);

    if (!Object.keys(payload).length) {
      return { error: 'No valid updates provided' };
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
      expectedVersion: req.body.expectedVersion,
    });

    const isProjectDescriptor =
      existing.type === 'project' ||
      payload.type === 'project' ||
      Boolean(payload.projectDescriptor);

    const context = isProjectDescriptor
      ? await upsertProjectDescriptor(database, {
          ...existing,
          ...payload,
          reason: reason || 'Project descriptor updated',
          agent: actor,
          project: existing.project,
        })
      : await updateContextWithVersioning(database, context_id, payload, {
          reason: reason || 'Context updated',
          changedBy: actor || existing.agent || 'system',
        });

    await recordMetric(database, {
      agent: actor || existing.agent || 'system',
      project: existing.project,
      metric_type: 'memory_usage',
      name: 'context_updated',
      data: { context_id, reason: reason || 'Context updated' },
    });

    await eventBus.emit('memory_updated', {
      db: database,
      context,
      agent: actor || existing.agent || 'system',
    });

    await trackActivity(database, {
      agent: actor,
      project: existing.project,
      type: 'decision',
      message: `Context ${context_id} updated`,
      related_task: collaboration.relatedTask?.task_id || null,
      resource: `context:${context_id}`,
      metadata: {
        reason: reason || 'Context updated',
      },
    });

    await trackCollaborationWarnings(database, {
      actor,
      project: existing.project,
      resource: `context:${context_id}`,
      warnings: collaboration.warnings,
      relatedTaskId: collaboration.relatedTask?.task_id,
      collectionName: 'contexts',
      filter: { id: context_id },
    });

    return { success: true, context, warnings: collaboration.warnings };
  })
);

app.get(
  '/context/:id/full',
  routeHandler('contexts', async ({ req, db: database }) => {
    const context = await database.collection('contexts').findOne({ id: req.params.id });

    if (!context) {
      return { error: 'Context not found' };
    }

    const [actions, versions] = await Promise.all([
      database.collection('actions').find({ contextRefs: context.id }).toArray(),
      database
        .collection('memory_versions')
        .find({ context_id: context.id })
        .sort({ changedAt: -1 })
        .limit(20)
        .toArray(),
    ]);

    return { context, actions, versions };
  })
);

app.get(
  '/context/:id/connected',
  routeHandler('contexts', async ({ req, db: database }) => {
    const connected = await getConnectedContextData(database, req.params.id);

    if (!connected) {
      return { error: 'Context not found' };
    }

    return connected;
  })
);

app.post(
  '/memory/optimize',
  routeHandler('contexts', async ({ req, db: database }) => {
    const summary = await optimizeMemories(database, {
      project: req.body.project,
      limit: parsePositiveInt(req.body.limit, 100),
    });

    await recordMetric(database, {
      agent: req.body.agent || 'system',
      project: req.body.project || 'default',
      metric_type: 'memory_usage',
      name: 'memory_optimization_run',
      value: summary.changed,
      data: summary,
    });

    return { success: true, summary };
  })
);

app.post(
  '/action',
  routeHandler('actions', async ({ req, collection, db: database }) => {
    const action = new ActionModel(req.body);
    await collection.insertOne(normalizeMemory(action));

    await trackActivity(database, {
      agent: action.agent,
      project: action.project,
      type: 'action',
      message: action.summary || `${action.actionType} on ${action.target || 'unknown target'}`,
      related_task: req.body.related_task || null,
      resource: action.target || null,
      metadata: {
        actionType: action.actionType,
      },
    });

    return { success: true, action };
  })
);

app.post(
  '/session',
  routeHandler('sessions', async ({ req, collection, db: database }) => {
    const existing = await database
      .collection('sessions')
      .findOne({ sessionId: req.body.sessionId });

    if (existing) {
      await database
        .collection('sessions')
        .updateOne(
          { sessionId: req.body.sessionId },
          { $set: { ...normalizeMemory(req.body), updatedAt: new Date() } }
        );
      return { success: true, session: { ...existing, ...req.body } };
    }

    const session = new SessionModel(req.body);
    await collection.insertOne(normalizeMemory(session));

    return { success: true, session };
  })
);

app.post(
  '/logs',
  routeHandler('logs', async ({ req, collection }) => {
    const { query = {}, limit = 20 } = req.body;

    return collection.find(query).sort({ createdAt: -1 }).limit(limit).toArray();
  })
);

app.post(
  '/activity',
  routeHandler('activity', async ({ req, db: database }) => {
    const { message, type = 'action' } = req.body;

    if (!hasText(message)) {
      return { error: 'Missing activity message' };
    }

    const activity = await trackActivity(database, {
      agent: req.body.agent || 'system',
      project: req.body.project || 'default',
      type,
      message,
      related_task: req.body.related_task || null,
      resource: req.body.resource || null,
      metadata: req.body.metadata || {},
    });

    return { success: true, activity };
  })
);

app.get(
  '/activity',
  routeHandler('activity', async ({ req, collection }) => {
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
  '/lock/acquire',
  routeHandler('resource_locks', async ({ req, db: database }) => {
    const { resource } = req.body;
    const actor = req.body.agent || req.body.locked_by || 'system';
    const project = req.body.project || 'default';

    if (!hasText(resource)) {
      return { error: 'Missing resource' };
    }

    const result = await acquireResourceLock(database, {
      project,
      agent: actor,
      resource,
      expiresInMs: req.body.expiresInMs,
      metadata: req.body.metadata || {},
    });

    await trackActivity(database, {
      agent: actor,
      project,
      type: 'decision',
      message: result.acquired
        ? `Lock acquired for ${resource}`
        : `Lock acquisition warning for ${resource}`,
      resource,
      metadata: {
        acquired: result.acquired,
      },
    });

    await recordMetric(database, {
      agent: actor,
      project,
      metric_type: 'collaboration',
      name: result.acquired ? 'resource_lock_acquired' : 'resource_lock_contended',
      data: {
        resource,
        warnings: result.warnings,
      },
    });

    return {
      success: true,
      acquired: result.acquired,
      lock: result.lock,
      warnings: result.warnings,
    };
  })
);

app.post(
  '/lock/release',
  routeHandler('resource_locks', async ({ req, db: database }) => {
    const { resource } = req.body;
    const actor = req.body.agent || req.body.locked_by || 'system';
    const project = req.body.project || 'default';

    if (!hasText(resource)) {
      return { error: 'Missing resource' };
    }

    const result = await releaseResourceLock(database, {
      project,
      resource,
      agent: actor,
    });

    await trackActivity(database, {
      agent: actor,
      project,
      type: 'decision',
      message: result.released
        ? `Lock released for ${resource}`
        : `No lock released for ${resource}`,
      resource,
    });

    return {
      success: true,
      released: result.released,
    };
  })
);

app.get(
  '/lock/list',
  routeHandler('resource_locks', async ({ req, db: database }) => {
    const locks = await listResourceLocks(database, {
      project: req.query.project,
      resource: req.query.resource,
    });

    return locks;
  })
);

app.post('/log', async (req, res) => {
  try {
    const { type, message, context } = req.body;

    if (req.body.project) {
      const projectValidation = validateProjectName(req.body.project);
      if (!projectValidation.valid) {
        return res.status(400).json(createErrorResponse(400, projectValidation.error));
      }
    }

    if (context?.agent) {
      const agentValidation = validateAgentId(context.agent);
      if (!agentValidation.valid) {
        return res.status(400).json(createErrorResponse(400, agentValidation.error));
      }
    }

    if (type === 'error') {
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
  '/agent/register',
  routeHandler('agents', async ({ req, collection, db: database }) => {
    const identity = resolveProjectIdentity();
    const sanitizedAgentId = sanitizeIdentifier(req.body.agent_id);
    const existing = await collection.findOne({ agent_id: sanitizedAgentId });
    const draftAgent = new AgentModel({
      ...existing,
      ...req.body,
      agent: sanitizeIdentifier(req.body.agent) || sanitizedAgentId || identity.agent,
      agent_id: sanitizedAgentId || identity.agent,
      project: req.body.project || identity.project,
      capabilities: req.body.capabilities ?? existing?.capabilities ?? [],
      last_seen: new Date(),
    });
    const status = deriveAgentStatus(draftAgent);

    await collection.updateOne(
      { agent_id: draftAgent.agent_id },
      {
        $set: normalizeMemory({
          ...draftAgent,
          createdAt: existing?.createdAt || draftAgent.createdAt,
          status,
        }),
      },
      { upsert: true }
    );

    const agent = await collection.findOne({ agent_id: draftAgent.agent_id });

    await recordMetric(database, {
      agent: agent.agent_id,
      project: agent.project,
      metric_type: 'agent_registry',
      name: 'agent_registered',
      data: { status: agent.status },
    });

    await trackActivity(database, {
      agent: agent.agent_id,
      project: agent.project,
      type: 'decision',
      message: `Agent ${agent.agent_id} registered with status ${agent.status}`,
      resource: `agent:${agent.agent_id}`,
    });

    return { success: true, agent };
  })
);

app.post(
  '/agent/heartbeat',
  routeHandler('agents', async ({ req, collection, db: database }) => {
    const { agent_id, current_task, status } = req.body;

    if (!agent_id) {
      return { error: 'Missing agent_id' };
    }

    const existing = await collection.findOne({ agent_id });

    if (!existing) {
      return { error: 'Agent not found' };
    }

    const draftAgent = {
      ...existing,
      current_task: current_task !== undefined ? current_task : existing.current_task,
      last_seen: new Date(),
      status: status || existing.status,
    };

    const nextStatus = deriveAgentStatus(draftAgent);

    await collection.updateOne(
      { agent_id },
      {
        $set: {
          current_task: draftAgent.current_task,
          last_seen: draftAgent.last_seen,
          status: nextStatus,
          updatedAt: new Date(),
        },
      }
    );

    const agent = await collection.findOne({ agent_id });

    await recordMetric(database, {
      agent: agent.agent_id,
      project: agent.project,
      metric_type: 'agent_registry',
      name: 'agent_heartbeat',
      data: { status: agent.status },
    });

    await trackActivity(database, {
      agent: agent.agent_id,
      project: agent.project,
      type: 'decision',
      message: `Heartbeat received from ${agent.agent_id} (${agent.status})`,
      related_task: agent.current_task || null,
      resource: `agent:${agent.agent_id}`,
    });

    return { success: true, agent };
  })
);

app.get(
  '/agent/list',
  routeHandler('agents', async ({ req, collection, db: database }) => {
    await refreshAgentStatuses(database, req.query.project);

    const filter = req.query.project ? { project: req.query.project } : {};
    return collection.find(filter).limit(50).toArray();
  })
);

app.post(
  '/task',
  routeHandler('tasks', async ({ req, collection, db: database }) => {
    if (req.body.project) {
      const projectValidation = validateProjectName(req.body.project);
      if (!projectValidation.valid) {
        throw new Error(projectValidation.error);
      }
    }

    if (req.body.agent) {
      const agentValidation = validateAgentId(req.body.agent);
      if (!agentValidation.valid) {
        throw new Error(agentValidation.error);
      }
    }

    const task = await buildDerivedTaskState(database, req.body);
    await collection.insertOne(normalizeMemory(task));

    await recordMetric(database, {
      agent: task.agent,
      project: task.project,
      metric_type: 'task_completion',
      name: 'task_created',
      data: {
        task_id: task.task_id,
        priority: task.priority,
        priorityScore: task.priorityScore,
      },
    });

    await eventBus.emit('task_created', { db: database, task });

    const storedTask = await collection.findOne({ task_id: task.task_id });

    await trackActivity(database, {
      agent: task.agent,
      project: task.project,
      type: 'task_update',
      message: `Task ${task.task_id} created`,
      related_task: task.task_id,
      resource: `task:${task.task_id}`,
    });

    return { success: true, task: storedTask, warnings: [] };
  })
);

app.post(
  '/task/assign',
  routeHandler('tasks', async ({ req, collection, db: database }) => {
    const { task_id, agent_id } = req.body;
    const actor = req.body.agent || agent_id || 'system';

    if (!task_id || !agent_id) {
      return { error: 'Missing task_id or agent_id' };
    }

    const existingTask = await collection.findOne({ task_id });

    if (!existingTask) {
      return { error: 'Task not found' };
    }

    const collaboration = await evaluateCollaborationRisk(database, {
      project: existingTask.project,
      actor,
      resource: `task:${task_id}`,
      relatedTaskId: task_id,
      currentDocument: existingTask,
      expectedUpdatedAt: req.body.expectedUpdatedAt,
      expectedVersion: req.body.expectedVersion,
    });

    const newStatus = existingTask.status === 'pending' ? 'in_progress' : existingTask.status;
    const now = new Date();

    let updateResult;

    if (!existingTask.assigned_to) {
      updateResult = await collection.findOneAndUpdate(
        { task_id, assigned_to: null },
        {
          $set: {
            assigned_to: agent_id,
            status: newStatus,
            updatedAt: now,
          },
        },
        { returnDocument: 'after' }
      );

      if (!updateResult) {
        return {
          success: false,
          error: 'Task was already claimed by another agent',
        };
      }
    } else if (existingTask.assigned_to === agent_id) {
      await collection.updateOne({ task_id }, { $set: { status: newStatus, updatedAt: now } });
      updateResult = await collection.findOne({ task_id });
    } else {
      return {
        success: false,
        error: `Task already assigned to ${existingTask.assigned_to}`,
      };
    }

    const task = updateResult;
    await syncAgentTaskState(database, existingTask, task);

    await trackActivity(database, {
      agent: actor,
      project: task.project,
      type: 'task_update',
      message: `Task ${task_id} assigned to ${agent_id}`,
      related_task: task_id,
      resource: `task:${task_id}`,
    });

    await trackCollaborationWarnings(database, {
      actor,
      project: task.project,
      resource: `task:${task_id}`,
      warnings: collaboration.warnings,
      relatedTaskId: task_id,
      collectionName: 'tasks',
      filter: { task_id },
    });

    return { success: true, task, warnings: collaboration.warnings };
  })
);

app.post(
  '/task/update',
  routeHandler('tasks', async ({ req, collection, db: database }) => {
    const { task_id, updates = {} } = req.body;
    const actor = req.body.agent || 'system';

    if (!task_id) {
      return { error: 'Missing task_id' };
    }

    const existingTask = await collection.findOne({ task_id });

    if (!existingTask) {
      return { error: 'Task not found' };
    }

    const nextValues = {};
    const scalarFields = [
      'title',
      'description',
      'assigned_to',
      'status',
      'priority',
      'result',
      'blocker',
    ];

    for (const field of scalarFields) {
      if (updates[field] !== undefined) {
        nextValues[field] = updates[field];
      }
    }

    for (const field of [
      'dependencies',
      'required_capabilities',
      'relatedContexts',
      'relatedIssues',
    ]) {
      if (updates[field] !== undefined) {
        nextValues[field] = toStringArray(updates[field]);
      }
    }

    if (!Object.keys(nextValues).length) {
      return { error: 'No valid updates provided' };
    }

    const collaboration = await evaluateCollaborationRisk(database, {
      project: existingTask.project,
      actor,
      resource: `task:${task_id}`,
      relatedTaskId: task_id,
      currentDocument: existingTask,
      expectedUpdatedAt: req.body.expectedUpdatedAt,
      expectedVersion: req.body.expectedVersion,
    });

    const derivedTask = await buildDerivedTaskState(database, {
      ...existingTask,
      ...nextValues,
      id: existingTask.id,
      task_id: existingTask.task_id,
      createdAt: existingTask.createdAt,
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
          createdAt: existingTask.createdAt,
        }),
      }
    );

    const task = await collection.findOne({ task_id });
    await syncAgentTaskState(database, existingTask, task);

    if (existingTask.status !== 'completed' && task.status === 'completed') {
      await recordMetric(database, {
        agent: task.agent,
        project: task.project,
        metric_type: 'task_completion',
        name: 'task_completed',
        data: {
          task_id: task.task_id,
          assigned_to: task.assigned_to,
        },
      });
    }

    await trackActivity(database, {
      agent: actor,
      project: task.project,
      type: 'task_update',
      message: `Task ${task_id} updated`,
      related_task: task_id,
      resource: `task:${task_id}`,
      metadata: {
        status: task.status,
      },
    });

    await trackCollaborationWarnings(database, {
      actor,
      project: task.project,
      resource: `task:${task_id}`,
      warnings: collaboration.warnings,
      relatedTaskId: task_id,
      collectionName: 'tasks',
      filter: { task_id },
    });

    return { success: true, task, warnings: collaboration.warnings };
  })
);

app.get(
  '/task/list',
  routeHandler('tasks', async ({ req, collection }) => {
    const { project, assigned_to, created_by, status, include_completed, limit } = req.query;

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
      filter.status = { $ne: 'completed' };
    }

    return collection
      .find(filter)
      .sort({ priorityScore: -1, priority: -1, updatedAt: -1, createdAt: -1 })
      .limit(parsePositiveInt(limit, 50))
      .toArray();
  })
);

app.post(
  '/issue',
  routeHandler('issues', async ({ req, collection, db: database }) => {
    const { title, type } = req.body;
    const allowedTypes = new Set(['bug', 'note', 'blocker', 'insight']);

    if (!hasText(title)) {
      return { error: 'Missing issue title' };
    }

    if (!allowedTypes.has(type)) {
      return { error: 'Invalid issue type' };
    }

    const issue = new IssueModel(req.body);
    await collection.insertOne(normalizeMemory(issue));

    await recordMetric(database, {
      agent: issue.agent,
      project: issue.project,
      metric_type: 'issue_tracking',
      name: 'issue_created',
      data: { issue_id: issue.issue_id, type: issue.type },
    });

    await trackActivity(database, {
      agent: issue.agent,
      project: issue.project,
      type: 'action',
      message: `Issue ${issue.issue_id} created (${issue.type})`,
      related_task: issue.relatedTasks?.[0] || null,
      resource: `issue:${issue.issue_id}`,
    });

    return { success: true, issue, warnings: [] };
  })
);

app.post(
  '/issue/resolve',
  routeHandler('issues', async ({ req, collection, db: database }) => {
    const { issue_id, resolution, resolvedBy } = req.body;
    const actor = req.body.agent || resolvedBy || 'system';

    if (!issue_id) {
      return { error: 'Missing issue_id' };
    }

    const existingIssue = await collection.findOne({ issue_id });

    if (!existingIssue) {
      return { error: 'Issue not found' };
    }

    const collaboration = await evaluateCollaborationRisk(database, {
      project: existingIssue.project,
      actor,
      resource: `issue:${issue_id}`,
      relatedTaskId: firstNonEmptyString(req.body.related_task, existingIssue.relatedTasks?.[0]),
      currentDocument: existingIssue,
      expectedUpdatedAt: req.body.expectedUpdatedAt,
      expectedVersion: req.body.expectedVersion,
    });

    const updateResult = await collection.updateOne(
      { issue_id },
      {
        $set: {
          status: 'resolved',
          resolution: resolution || 'Resolved',
          resolvedBy: resolvedBy || req.body.agent || 'system',
          resolvedAt: new Date(),
          updatedAt: new Date(),
        },
      }
    );

    const issue = await collection.findOne({ issue_id });

    await recordMetric(database, {
      agent: issue.agent,
      project: issue.project,
      metric_type: 'issue_tracking',
      name: 'issue_resolved',
      data: { issue_id: issue.issue_id, resolvedBy: issue.resolvedBy },
    });

    await trackActivity(database, {
      agent: actor,
      project: issue.project,
      type: 'action',
      message: `Issue ${issue.issue_id} resolved`,
      related_task: issue.relatedTasks?.[0] || null,
      resource: `issue:${issue.issue_id}`,
    });

    await trackCollaborationWarnings(database, {
      actor,
      project: issue.project,
      resource: `issue:${issue.issue_id}`,
      warnings: collaboration.warnings,
      relatedTaskId: issue.relatedTasks?.[0],
      collectionName: 'issues',
      filter: { issue_id },
    });

    return { success: true, issue, warnings: collaboration.warnings };
  })
);

app.get(
  '/issue/list',
  routeHandler('issues', async ({ req, collection }) => {
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
  '/message',
  routeHandler('messages', async ({ req, collection, db: database }) => {
    const message = new MessageModel(req.body);
    await collection.insertOne(normalizeMemory(message));

    await trackActivity(database, {
      agent: message.from_agent,
      project: message.project,
      type: 'decision',
      message: `Message sent to ${message.to_agent || 'broadcast'}`,
      related_task: message.related_task || null,
      resource: message.to_agent ? `agent:${message.to_agent}` : 'message:broadcast',
    });

    return { success: true, message };
  })
);

app.get(
  '/message/:agent_id',
  routeHandler('messages', async ({ req, collection }) => {
    const { project, limit } = req.query;
    const filter = {
      $or: [{ to_agent: req.params.agent_id }, { to_agent: null }],
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
  '/project-map',
  routeHandler('project_map', async ({ req, collection, db: database }) => {
    const entry = new ProjectMapModel(req.body);
    const actor = req.body.agent || 'system';

    if (!entry.file_path) {
      return { error: 'Missing file_path' };
    }

    const filter = {
      project: entry.project,
      file_path: entry.file_path,
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
      expectedVersion: req.body.expectedVersion,
    });

    await collection.updateOne(filter, { $set: normalizeMemory(entry) }, { upsert: true });

    const storedEntry = await collection.findOne(filter);

    await trackActivity(database, {
      agent: actor,
      project: entry.project,
      type: 'action',
      message: `Project map entry updated for ${entry.file_path}`,
      related_task: storedEntry.related_tasks?.[0] || null,
      resource: `project-map:${entry.file_path}`,
    });

    await trackCollaborationWarnings(database, {
      actor,
      project: entry.project,
      resource: `project-map:${entry.file_path}`,
      warnings: collaboration.warnings,
      relatedTaskId: storedEntry.related_tasks?.[0],
      collectionName: 'project_map',
      filter,
    });

    return { success: true, entry: storedEntry, warnings: collaboration.warnings };
  })
);

app.get(
  '/project-map',
  routeHandler('project_map', async ({ req, collection }) => {
    const { project, file_path, type, query = '', limit } = req.query;
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
        .find(filter, { projection: { score: { $meta: 'textScore' } } })
        .sort({ score: { $meta: 'textScore' }, updatedAt: -1 })
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
  '/metrics',
  routeHandler('metrics', async ({ req, collection }) => {
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

app.get('/', (_req, res) => {
  res.send('MCP Memory Server Running');
});

const SERVER_START_TIME = Date.now();

app.get('/health', async (req, res) => {
  const isHealthCheck = req.headers['x-mcp-health-check'] === 'true';
  const requestedFields = req.query.fields?.split(',') || [];

  const healthData = {
    service: 'MCP',
    status: 'ok',
    uptime: Math.floor((Date.now() - SERVER_START_TIME) / 1000),
    uptimeFormatted: formatUptime((Date.now() - SERVER_START_TIME) / 1000),
    timestamp: new Date().toISOString(),
    version: '2.5.0',
    server: 'local-mcp-memory',
    project: activeProjectName || process.env.MCP_PROJECT || 'local-mcp-memory',
    pid: process.pid,
    signature: activeRuntimeSignature || process.env.MCP_RUNTIME_SIGNATURE || null,
    port: activeServerPort || Number(process.env.PORT || 0) || null,
    database: null,
    connections: null,
    sessions: null,
    memory: null,
  };

  try {
    if (db) {
      const pingResult = await db.command({ ping: 1 }).catch(() => null);
      healthData.database = {
        connected: pingResult ? true : false,
        name: DB_NAME,
      };
    }
  } catch {
    healthData.database = { connected: false };
  }

  try {
    healthData.connections = {
      active: connectionManager?.getActiveConnections()?.length || 0,
      total: connectionManager?.getAllConnections()?.length || 0,
      ready: connectionManager?.getReadyConnections()?.length || 0,
    };
  } catch {
    healthData.connections = { error: 'unavailable' };
  }

  try {
    const sessionStats = sessionManager?.getSessionStats?.() || {};
    healthData.sessions = {
      active: sessionStats.activeSessions || 0,
      idle: sessionStats.idleSessions || 0,
      total: sessionStats.totalSessions || 0
    };
  } catch {
    healthData.sessions = { error: 'unavailable' };
  }

  try {
    const memUsage = process.memoryUsage();
    healthData.memory = {
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
      rss: Math.round(memUsage.rss / 1024 / 1024),
    };
  } catch {
    healthData.memory = { error: 'unavailable' };
  }

  if (isHealthCheck) {
    res.setHeader('X-MCP-Health', 'ok');
    res.setHeader('X-MCP-Version', healthData.version);
  }

  if (requestedFields.length > 0) {
    const filtered = {};
    for (const field of requestedFields) {
      if (field in healthData) {
        filtered[field] = healthData[field];
      }
    }
    return res.json(filtered);
  }

  res.json(healthData);
});

app.get('/health/detailed', async (_req, res) => {
  const detailed = {
    ...(await import('./utils/mcp-port-registry.js'))
      .then((m) => ({ portRegistry: m.getPortRegistry().getStatus() }))
      .catch(() => ({})),
    server: {
      version: '2.5.0',
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      startedAt: new Date(SERVER_START_TIME).toISOString(),
      pid: process.pid,
    },
    session: sessionManager?.getSessionStats() || {},
    connection: connectionManager?.getConnectionStats() || {},
    routes: {
      total: app._router ? app._router.stack.filter((r) => r.route).length : 0,
    },
  };

  res.json(detailed);
});

function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);

  return parts.join(' ');
}

app.post(
  '/emulator/scan',
  routeHandler('activity', async () => {
    const emulatorPlugin = getEmulatorPlugin();
    const emulators = await emulatorPlugin.scan();
    return { success: true, emulators };
  })
);

app.post(
  '/emulator/select',
  routeHandler('activity', async ({ req }) => {
    const emulatorPlugin = getEmulatorPlugin();
    const { emulator_id, requirements } = req.body;

    if (emulator_id) {
      const result = await emulatorPlugin.select(emulator_id);
      return { success: true, ...result };
    }

    const result = await emulatorPlugin.autoSelect(requirements || {});
    return { success: true, ...result };
  })
);

app.post(
  '/emulator/start',
  routeHandler('activity', async ({ req }) => {
    const emulatorPlugin = getEmulatorPlugin();
    const { emulator_id } = req.body;

    if (!emulator_id) {
      return { error: 'Missing emulator_id' };
    }

    const emulator = await emulatorPlugin.startEmulator(emulator_id);
    return { success: true, emulator };
  })
);

app.post(
  '/emulator/stop',
  routeHandler('activity', async ({ req }) => {
    const emulatorPlugin = getEmulatorPlugin();
    const { emulator_id } = req.body;

    if (!emulator_id) {
      return { error: 'Missing emulator_id' };
    }

    const emulator = await emulatorPlugin.stopEmulator(emulator_id);
    return { success: true, emulator };
  })
);

app.post(
  '/emulator/install',
  routeHandler('activity', async ({ req }) => {
    const emulatorPlugin = getEmulatorPlugin();
    const { session_id, apk_path, package_name } = req.body;

    if (!session_id || !apk_path) {
      return { error: 'Missing session_id or apk_path' };
    }

    const result = await emulatorPlugin.installApp(session_id, apk_path, package_name);
    return { success: true, ...result };
  })
);

app.post(
  '/emulator/test',
  routeHandler('activity', async ({ req }) => {
    const emulatorPlugin = getEmulatorPlugin();
    const { session_id, test_package, test_class, options } = req.body;

    if (!session_id || !test_package || !test_class) {
      return { error: 'Missing required parameters' };
    }

    const result = await emulatorPlugin.runTest(session_id, test_package, test_class, options);
    return { success: true, ...result };
  })
);

app.post(
  '/emulator/logs',
  routeHandler('activity', async ({ req }) => {
    const emulatorPlugin = getEmulatorPlugin();
    const { session_id, filter, path } = req.body;

    if (!session_id) {
      return { error: 'Missing session_id' };
    }

    const result = await emulatorPlugin.captureLogs(session_id, { filter, path });
    return { success: true, ...result };
  })
);

app.post(
  '/emulator/screenshot',
  routeHandler('activity', async ({ req }) => {
    const emulatorPlugin = getEmulatorPlugin();
    const { session_id, path } = req.body;

    if (!session_id) {
      return { error: 'Missing session_id' };
    }

    const result = await emulatorPlugin.takeScreenshot(session_id, path);
    return { success: true, ...result };
  })
);

app.post(
  '/emulator/input',
  routeHandler('activity', async ({ req }) => {
    const emulatorPlugin = getEmulatorPlugin();
    const { session_id, action, params } = req.body;

    if (!session_id || !action) {
      return { error: 'Missing session_id or action' };
    }

    const result = await emulatorPlugin.simulateInput(session_id, action, params || {});
    return { success: true, ...result };
  })
);

app.post(
  '/feedback',
  routeHandler('feedbacks', async ({ req, db: database }) => {
    const identity = resolveProjectIdentity();
    const { title, type, description } = req.body;

    if (!hasText(title)) {
      return { error: 'Missing feedback title' };
    }

    const feedbackData = {
      ...req.body,
      project: req.body.project || identity.project,
      agent: req.body.agent || identity.agent,
      created_by: req.body.created_by || identity.agent,
    };
    const result = await createFeedback(database, feedbackData);

    if (!result?.insertedId) {
      return { error: 'Feedback creation failed - insert returned no ID' };
    }

    const feedback = await getFeedbackById(database, result.insertedId);

    await recordMetric(database, {
      agent: feedbackData.agent,
      project: feedbackData.project,
      metric_type: 'feedback',
      name: 'feedback_created',
      data: { feedback_id: feedback.feedback_id, type: feedback.type },
    });

    await trackActivity(database, {
      agent: feedbackData.agent,
      project: feedbackData.project,
      type: 'action',
      message: `Feedback created: ${feedback.title}`,
      resource: `feedback:${feedback.feedback_id}`,
    });

    return { success: true, feedback };
  })
);

app.get(
  '/feedback/list',
  routeHandler('feedbacks', async ({ req, db: database }) => {
    const feedbacks = await listFeedbacks(database, {
      project: req.query.project,
      type: req.query.type,
      status: req.query.status,
      severity: req.query.severity ? parseInt(req.query.severity, 10) : undefined,
      created_by: req.query.created_by,
      related_task: req.query.related_task,
      related_context: req.query.related_context,
      query: req.query.query,
      limit: parsePositiveInt(req.query.limit, 50),
    });

    return feedbacks;
  })
);

app.post(
  '/feedback/vote',
  routeHandler('feedbacks', async ({ req, db: database }) => {
    const { feedback_id, voter_id } = req.body;
    const identity = resolveProjectIdentity();
    const voter = voter_id || identity.agent;

    if (!feedback_id) {
      return { error: 'Missing feedback_id' };
    }

    const feedback = await voteFeedback(database, feedback_id, voter);

    if (!feedback) {
      return { error: 'Feedback not found' };
    }

    await trackActivity(database, {
      agent: voter,
      project: feedback.project,
      type: 'action',
      message: `Voted on feedback: ${feedback.title}`,
      resource: `feedback:${feedback.feedback_id}`,
    });

    return { success: true, feedback };
  })
);

app.post(
  '/feedback/resolve',
  routeHandler('feedbacks', async ({ req, db: database }) => {
    const { feedback_id, resolution } = req.body;
    const identity = resolveProjectIdentity();
    const resolvedBy = req.body.resolved_by || identity.agent;

    if (!feedback_id) {
      return { error: 'Missing feedback_id' };
    }

    const feedback = await resolveFeedback(database, feedback_id, resolvedBy, resolution);

    if (!feedback) {
      return { error: 'Feedback not found' };
    }

    await trackActivity(database, {
      agent: resolvedBy,
      project: feedback.project,
      type: 'action',
      message: `Feedback resolved: ${feedback.title}`,
      resource: `feedback:${feedback.feedback_id}`,
    });

    return { success: true, feedback };
  })
);

app.post(
  '/feedback/severity',
  routeHandler('feedbacks', async ({ req, db: database }) => {
    const { feedback_id, severity } = req.body;

    if (!feedback_id) {
      return { error: 'Missing feedback_id' };
    }

    const feedback = await updateFeedbackSeverity(database, feedback_id, severity);

    if (!feedback) {
      return { error: 'Feedback not found' };
    }

    return { success: true, feedback };
  })
);

app.get(
  '/feedback/:id',
  routeHandler('feedbacks', async ({ req, db: database }) => {
    const feedback = await getFeedbackById(database, req.params.id);

    if (!feedback) {
      return { error: 'Feedback not found' };
    }

    return feedback;
  })
);

app.post(
  '/feedback/test-failure',
  routeHandler('feedbacks', async ({ req, db: database }) => {
    const identity = resolveProjectIdentity();
    const testData = {
      ...req.body,
      project: req.body.project || identity.project,
      agent: req.body.agent || identity.agent,
    };

    const result = await createFeedbackFromTestFailure(database, testData);
    const feedback = await getFeedbackById(database, result.insertedId);

    return { success: true, feedback };
  })
);

app.post(
  '/feedback/pattern',
  routeHandler('feedbacks', async ({ req, db: database }) => {
    const identity = resolveProjectIdentity();
    const patternData = {
      ...req.body,
      project: req.body.project || identity.project,
      agent: req.body.agent || identity.agent,
    };

    const result = await createImprovementFromPattern(database, patternData);
    const feedback = await getFeedbackById(database, result.insertedId);

    return { success: true, feedback };
  })
);

app.post(
  '/chat/room',
  routeHandler('chat_rooms', async ({ req, db: database }) => {
    const identity = resolveProjectIdentity();
    const roomData = {
      ...req.body,
      project: req.body.project || identity.project,
      created_by: req.body.created_by || identity.agent,
    };

    const result = await createRoom(database, roomData);
    const room = await getRoomById(database, result.insertedId);

    await trackActivity(database, {
      agent: roomData.created_by,
      project: roomData.project,
      type: 'action',
      message: `Chat room created: ${room.name}`,
      resource: `room:${room.room_id}`,
    });

    return { success: true, room };
  })
);

app.get(
  '/chat/room/list',
  routeHandler('chat_rooms', async ({ req, db: database }) => {
    const rooms = await listRooms(database, {
      project: req.query.project,
      scope: req.query.scope,
      is_active: req.query.is_active,
      participant: req.query.participant,
      limit: parsePositiveInt(req.query.limit, 50),
    });

    return rooms;
  })
);

app.get(
  '/chat/room/:room_id',
  routeHandler('chat_rooms', async ({ req, db: database }) => {
    const room = await getRoomById(database, req.params.room_id);

    if (!room) {
      return { error: 'Room not found' };
    }

    return room;
  })
);

app.post(
  '/chat/room/:room_id/join',
  routeHandler('chat_rooms', async ({ req, db: database }) => {
    const { agent_id } = req.body;
    const identity = resolveProjectIdentity();
    const agent = agent_id || identity.agent;

    if (!agent) {
      return { error: 'Missing agent_id' };
    }

    try {
      const room = await joinRoom(database, req.params.room_id, agent);

      await trackActivity(database, {
        agent,
        project: room.project,
        type: 'action',
        message: `Joined chat room: ${room.name}`,
        resource: `room:${room.room_id}`,
      });

      return { success: true, room };
    } catch (error) {
      return { error: error.message };
    }
  })
);

app.post(
  '/chat/room/:room_id/leave',
  routeHandler('chat_rooms', async ({ req, db: database }) => {
    const { agent_id } = req.body;
    const identity = resolveProjectIdentity();
    const agent = agent_id || identity.agent;

    if (!agent) {
      return { error: 'Missing agent_id' };
    }

    const room = await leaveRoom(database, req.params.room_id, agent);

    return { success: true, room };
  })
);

app.post(
  '/chat/message',
  routeHandler('chat_messages', async ({ req, db: database }) => {
    const identity = resolveProjectIdentity();
    const messageData = {
      ...req.body,
      project: req.body.project || identity.project,
      from_agent: req.body.from_agent || identity.agent,
    };

    if (!messageData.room_id) {
      return { error: 'Missing room_id' };
    }

    if (!hasText(messageData.content)) {
      return { error: 'Missing message content' };
    }

    await sendMessage(database, messageData);

    const room = await getRoomById(database, messageData.room_id);

    await trackActivity(database, {
      agent: messageData.from_agent,
      project: messageData.project,
      type: 'decision',
      message: `Message sent in ${room?.name || messageData.room_id}`,
      resource: `room:${messageData.room_id}`,
    });

    return { success: true };
  })
);

app.get(
  '/chat/room/:room_id/messages',
  routeHandler('chat_messages', async ({ req, db: database }) => {
    const messages = await getMessages(database, {
      room_id: req.params.room_id,
      from_agent: req.query.from_agent,
      type: req.query.type,
      related_task: req.query.related_task,
      since: req.query.since,
      limit: parsePositiveInt(req.query.limit, 100),
    });

    return messages;
  })
);

app.get(
  '/chat/room/:room_id/recent',
  routeHandler('chat_messages', async ({ req, db: database }) => {
    const messages = await getRecentMessages(
      database,
      req.params.room_id,
      parsePositiveInt(req.query.limit, 50)
    );

    return messages;
  })
);

app.post(
  '/chat/room/:room_id/broadcast',
  routeHandler('chat_messages', async ({ req, db: database }) => {
    const identity = resolveProjectIdentity();
    const { content, type } = req.body;

    if (!hasText(content)) {
      return { error: 'Missing content' };
    }

    await broadcastToRoom(
      database,
      req.params.room_id,
      req.body.from_agent || identity.agent,
      content,
      type || CHAT_MESSAGE_TYPE.BROADCAST
    );

    return { success: true };
  })
);

app.post(
  '/chat/room/:room_id/task-announce',
  routeHandler('chat_messages', async ({ req, db: database }) => {
    const identity = resolveProjectIdentity();
    const { task_id } = req.body;

    if (!task_id) {
      return { error: 'Missing task_id' };
    }

    await announceTaskTakeover(
      database,
      req.params.room_id,
      req.body.from_agent || identity.agent,
      task_id
    );

    return { success: true };
  })
);

app.post(
  '/chat/room/:room_id/help-request',
  routeHandler('chat_messages', async ({ req, db: database }) => {
    const identity = resolveProjectIdentity();
    const { help_request } = req.body;

    if (!hasText(help_request)) {
      return { error: 'Missing help_request' };
    }

    await requestHelpInRoom(
      database,
      req.params.room_id,
      req.body.from_agent || identity.agent,
      help_request
    );

    return { success: true };
  })
);

app.post(
  '/chat/room/:room_id/share-finding',
  routeHandler('chat_messages', async ({ req, db: database }) => {
    const identity = resolveProjectIdentity();
    const { finding } = req.body;

    if (!hasText(finding)) {
      return { error: 'Missing finding' };
    }

    await shareFindingInRoom(
      database,
      req.params.room_id,
      req.body.from_agent || identity.agent,
      finding
    );

    return { success: true };
  })
);

app.get(
  '/chat/room/:room_id/default',
  routeHandler('chat_rooms', async ({ req, db: database }) => {
    const identity = resolveProjectIdentity();
    const room = await getOrCreateDefaultRoom(database, req.query.project || identity.project);

    return room;
  })
);

/**
 * POST /reset
 * Execute MCP reset operation with safety checks.
 *
 * Body parameters:
 * - level: "minor" | "moderate" | "major" | "severe"
 * - project: Project name (optional for minor/moderate)
 * - agent: Agent performing reset (optional)
 * - confirmation: Required for "severe" level (must be "MCP_RESET_CONFIRM")
 *
 * @example
 * // Minor reset
 * POST /reset { "level": "minor", "project": "my-project" }
 *
 * @example
 * // Severe reset (requires confirmation)
 * POST /reset {
 *   "level": "severe",
 *   "project": "old-project",
 *   "confirmation": "MCP_RESET_CONFIRM"
 * }
 */
app.post(
  '/reset',
  routeHandler('logs', async ({ req, db: database }) => {
    const { level, project, agent, confirmation } = req.body;

    // Validate level
    const validLevels = Object.values(RESET_LEVELS);
    if (!level || !validLevels.includes(level)) {
      return {
        error: `Invalid reset level. Valid levels: ${validLevels.join(', ')}`,
      };
    }

    // Severe reset requires confirmation
    if (level === RESET_LEVELS.SEVERE) {
      if (confirmation !== RESET_CONFIRMATION_CODE) {
        return {
          error: "SEVERE reset requires confirmation code 'MCP_RESET_CONFIRM'",
          required: true,
        };
      }
      if (!project) {
        return {
          error: 'SEVERE reset requires a specific project target',
        };
      }
    }

    try {
      const result = await resetMCP(database, {
        level,
        project,
        agent: agent || req.body.agent || 'system',
        confirmation,
      });

      return {
        success: true,
        ...result,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  })
);

/**
 * GET /reset/estimate
 * Preview reset impact before executing.
 *
 * Query parameters:
 * - level: "minor" | "moderate" | "major" | "severe"
 * - project: Project name (optional)
 *
 * @example
 * GET /reset/estimate?level=moderate&project=my-project
 */
app.get(
  '/reset/estimate',
  routeHandler('logs', async ({ req, db: database }) => {
    const { level, project } = req.query;

    if (!level) {
      return { error: 'Missing required parameter: level' };
    }

    const validLevels = Object.values(RESET_LEVELS);
    if (!validLevels.includes(level)) {
      return {
        error: `Invalid reset level. Valid levels: ${validLevels.join(', ')}`,
      };
    }

    const impact = await estimateResetImpact(database, level, project || null);

    return {
      success: true,
      impact,
    };
  })
);

app.post('/session', async (req, res) => {
  try {
    const { sessionId, clientId, agent, project, scope, status, metadata } = req.body;
    const sessionContext = req.sessionContext;

    const finalSessionId = sessionId || sessionContext.sessionId;
    const finalClientId = clientId || sessionContext.clientId;
    const finalAgent = agent || sessionContext.agent;
    const finalProject = project || sessionContext.project;

    let session = sessionManager.getSession(finalSessionId);

    if (session) {
      session.updateHeartbeat();
    } else {
      session = sessionManager.createSession({
        sessionId: finalSessionId,
        clientId: finalClientId,
        agent: finalAgent,
        project: finalProject,
        scope: scope || sessionContext.scope,
        status: status || 'active',
        metadata: {
          ...metadata,
          createdVia: 'api',
          userAgent: req.headers['user-agent'],
          remoteAddr: req.ip || req.connection?.remoteAddress,
        },
      });
    }

    const sessionData = {
      ...session.toDatabaseFormat(),
    };

    const db = getDb();
    await db.collection('sessions').updateOne(
      { sessionId: finalSessionId },
      {
        $set: {
          ...sessionData,
          updatedAt: new Date(),
        },
      },
      { upsert: true }
    );

    res.json({ success: true, session: session.toJSON() });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/session/current', async (req, res) => {
  try {
    const sessionContext = req.sessionContext;

    if (!sessionContext.sessionId) {
      res.json({ session: null, message: 'No active session' });
      return;
    }

    const session = sessionManager.getSession(sessionContext.sessionId);

    if (session) {
      res.json({ session: session.toJSON() });
    } else {
      res.json({ session: null, message: 'Session not found' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/session/heartbeat', async (req, res) => {
  try {
    const sessionContext = req.sessionContext;

    if (!sessionContext.sessionId) {
      res.status(400).json({ error: 'No sessionId provided' });
      return;
    }

    const success = sessionManager.heartbeat(sessionContext.sessionId);

    if (success) {
      const session = sessionManager.getSession(sessionContext.sessionId);
      const db = getDb();
      await db.collection('sessions').updateOne(
        { sessionId: sessionContext.sessionId },
        {
          $set: {
            lastHeartbeat: new Date(),
            status: SESSION_STATUS.ACTIVE,
            updatedAt: new Date(),
          },
        }
      );
      res.json({ success: true, session: session.toJSON() });
    } else {
      res.json({ success: false, message: 'Session not found or inactive' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/session/end', async (req, res) => {
  try {
    const sessionContext = req.sessionContext;
    const { reason } = req.body;

    if (!sessionContext.sessionId) {
      res.status(400).json({ error: 'No sessionId provided' });
      return;
    }

    sessionManager.disconnectSession(sessionContext.sessionId, reason || 'manual_end');

    const db = getDb();
    await db.collection('sessions').updateOne(
      { sessionId: sessionContext.sessionId },
      {
        $set: {
          status: SESSION_STATUS.DISCONNECTED,
          endedAt: new Date(),
          updatedAt: new Date(),
        },
      }
    );

    res.json({ success: true, message: 'Session ended' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/sessions', async (req, res) => {
  try {
    const { project, agent, status } = req.query;

    let sessions = sessionManager.getAllSessions();

    if (project) {
      sessions = sessions.filter((s) => s.project === project);
    }

    if (agent) {
      sessions = sessions.filter((s) => s.agent === agent);
    }

    if (status) {
      sessions = sessions.filter((s) => s.status === status);
    }

    res.json({
      sessions: sessions.map((s) => s.toJSON()),
      stats: sessionManager.getSessionStats(),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/connections', async (req, res) => {
  try {
    const { project, agent, state } = req.query;

    let connections = connectionManager.getAllConnections();

    if (project) {
      connections = connections.filter((c) => c.project === project);
    }

    if (agent) {
      connections = connections.filter((c) => c.agent === agent);
    }

    if (state) {
      connections = connections.filter((c) => c.state === state);
    }

    res.json({
      connections: connections.map((c) => c.toJSON()),
      stats: connectionManager.getConnectionStats(),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/sessions/stats', async (req, res) => {
  try {
    const db = getDb();

    const [dbSessionCount, activeSessions, recentSessions] = await Promise.all([
      db.collection('sessions').countDocuments(),
      db.collection('sessions').countDocuments({
        status: { $in: [SESSION_STATUS.ACTIVE, SESSION_STATUS.IDLE] },
      }),
      db.collection('sessions').find({}).sort({ startedAt: -1 }).limit(10).toArray(),
    ]);

    res.json({
      inMemory: sessionManager.getSessionStats(),
      database: {
        totalSessions: dbSessionCount,
        activeSessions,
      },
      recentSessions,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/sessions/cleanup', async (req, res) => {
  try {
    const expired = sessionManager.cleanupExpiredSessions();

    for (const session of expired) {
      const db = getDb();
      await db.collection('sessions').updateOne(
        { sessionId: session.sessionId },
        {
          $set: {
            status: session.status,
            endedAt: session.endedAt,
            updatedAt: new Date(),
          },
        }
      );
    }

    res.json({
      success: true,
      cleanedUp: expired.length,
      sessions: expired.map((s) => s.toJSON()),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/debug/sessions', async (req, res) => {
  try {
    const db = getDb();

    const [memoryStats, dbStats, connectionStats] = await Promise.all([
      Promise.resolve(sessionManager.getSessionStats()),
      Promise.resolve(connectionManager.getConnectionStats()),
      db
        .collection('sessions')
        .aggregate([
          {
            $group: {
              _id: '$status',
              count: { $sum: 1 },
            },
          },
        ])
        .toArray(),
    ]);

    res.json({
      inMemory: {
        sessions: memoryStats,
        connections: dbStats,
      },
      database: {
        byStatus: dbStats,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /config/status
 * Check MCP configuration status.
 *
 * Returns configuration hierarchy and source information.
 *
 * @example
 * GET /config/status
 * Response: { exists: true, hierarchy: "project", source: ".mcp-project" }
 */
app.get(
  '/config/status',
  routeHandler('contexts', async ({ req }) => {
    const { checkConfigExists } = await import('./utils/projectIdentity.js');
    const status = checkConfigExists(req.query.directory || process.cwd());
    return status;
  })
);

export async function startServer({
  port = DEFAULT_PORT,
  silent = false,
  autoDiscoverPort = true,
  healthCheck = true,
  retryStrategy = null,
  connectionTimeout = 30000
} = {}) {
  if (server) {
    return { app, db: getDb(), server, port: activeServerPort };
  }

  if (!startupPromise) {
    startupPromise = withProjectLock('startup', async () => {
      const projectRoot = process.env.MCP_PROJECT_ROOT || process.cwd();
      const projectName = process.env.MCP_PROJECT || PROJECT_NAME || 'local-mcp-memory';

      setProjectRoot(projectRoot);
      setCurrentProject(projectName);
      activeProjectName = projectName;

      const runtimeFromFile = readRuntimeFile(projectName);
      if (runtimeFromFile) {
        const runtimeValidation = await validateRuntime(runtimeFromFile, {
          expectedProject: projectName,
          expectedSignature: runtimeFromFile.signature,
          requireSignature: true
        });

        if (runtimeValidation.valid && runtimeFromFile.pid !== process.pid) {
          activeServerPort = runtimeFromFile.port;
          activeRuntimeSignature = runtimeFromFile.signature;
          process.env.MCP_SERVER_URL = `http://localhost:${runtimeFromFile.port}`;
          process.env.PORT = String(runtimeFromFile.port);
          return {
            app: null,
            db: null,
            server: null,
            port: runtimeFromFile.port,
            reusedExisting: true
          };
        }

        await setMcpStopped({ projectName, force: true });
      }

      const recoveredRuntime = await recoverRuntimeFromActiveServers({ projectName });
      if (recoveredRuntime) {
        const recoveredValidation = await validateRuntime(recoveredRuntime, {
          expectedProject: projectName,
          expectedSignature: recoveredRuntime.signature,
          requireSignature: true
        });

        if (recoveredValidation.valid && recoveredRuntime.pid !== process.pid) {
          activeServerPort = recoveredRuntime.port;
          activeRuntimeSignature = recoveredRuntime.signature;
          process.env.MCP_SERVER_URL = `http://localhost:${recoveredRuntime.port}`;
          process.env.PORT = String(recoveredRuntime.port);
          return {
            app: null,
            db: null,
            server: null,
            port: recoveredRuntime.port,
            reusedExisting: true
          };
        }
      }

      client = new MongoClient(process.env.MONGO_URI);
      await client.connect();
      db = client.db(DB_NAME);
      initLogger(db);

      await ensureIndexes(db);
      await cleanupExpiredLocks(db);

      app.locals.db = db;
      app.locals.logError = logError;

      await logInfo('MongoDB connected', { dbName: DB_NAME });

      const portManager = getPortManager();
      const requestedPort = port > 0 ? port : null;
      let allocatedPort = await portManager.findAvailablePort(requestedPort);
      if (!allocatedPort) {
        throw new Error('No available ports in configured range');
      }

      let listenError = null;
      for (let attempt = 1; attempt <= 3; attempt++) {
        server = app.listen(allocatedPort);

        try {
          await waitForListenerReady(server);
          listenError = null;
          break;
        } catch (error) {
          listenError = error;
          const listener = server;
          server = null;
          await closeListener(listener);

          const isRetryable =
            error?.code === 'EADDRINUSE' || error?.code === 'EACCES' || error?.code === 'ERR_SERVER_ALREADY_LISTEN';
          if (!isRetryable || attempt === 3) {
            break;
          }

          allocatedPort = await portManager.findAvailablePort();
          if (!allocatedPort) {
            break;
          }
        }
      }

      if (listenError || !server) {
        throw listenError || new Error('Failed to bind MCP HTTP server');
      }

      const address = server.address();
      if (!address || typeof address === 'string' || !Number.isFinite(address.port)) {
        throw new Error('MCP server started without a valid TCP address');
      }

      const actualPort = Number(address.port);
      activeServerPort = actualPort;
      process.env.PORT = String(actualPort);
      process.env.MCP_SERVER_URL = `http://localhost:${actualPort}`;

      try {
        const portRegistry = getPortRegistry();
        await portRegistry.registerPort(actualPort, process.pid);
        const runtimeAfterRegister = readRuntimeFile(projectName);
        activeRuntimeSignature =
          runtimeAfterRegister?.signature || process.env.MCP_RUNTIME_SIGNATURE || null;
        MCPLogger.portRegistered(actualPort, process.pid);
      } catch (error) {
        MCPLogger.connectionError(error, { operation: 'registerPort' });
      }

      if (!silent) {
        process.stderr.write(`MCP Server running on port ${actualPort}\n`);
        process.stderr.write(
          `[MCP] Runtime file registered at: ${path.join(projectRoot, '.mcp-runtime.json')}\n`
        );
      }

      return { app, db, server, port: actualPort, reusedExisting: false };
    }).catch(async (error) => {
      startupPromise = null;
      db = null;
      const listener = server;
      server = null;
      activeServerPort = null;

      await closeListener(listener);

      if (client) {
        await client.close();
      }
      client = null;

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

  try {
    await setMcpStopped();
  } catch {}

  client = null;
  db = null;
  server = null;
  startupPromise = null;
  activeServerPort = null;
  activeRuntimeSignature = null;
}

function setupShutdownHooks() {
  const shutdown = async (signal) => {
    process.stderr.write(`\n[MCP] Received ${signal}, shutting down gracefully...\n`);
    try {
      await stopServer();
      process.stderr.write('[MCP] Server stopped, runtime cleaned up\n');
    } catch (error) {
      console.error('[MCP] Error during shutdown:', error);
    }
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('exit', async (code) => {
    if (code !== 0) {
      await setMcpStopped();
    }
  });
}

setupShutdownHooks();

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  startServer().catch((error) => {
    console.error('Failed to start MCP Server:', error);
    process.exit(1);
  });
}
