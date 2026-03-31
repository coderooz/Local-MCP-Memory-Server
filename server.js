#!/usr/bin/env node

import dotenv from "dotenv";
import express from "express";
import { MongoClient } from "mongodb";
import path from "path";
import { fileURLToPath } from "url";

import { initLogger, logError, logInfo } from "./logger.js";
import {
  ActionModel,
  ContextModel,
  MemoryQueryBuilder,
  SessionModel,
  normalizeMemory,
  AgentModel,
  TaskModel,
  MessageModel,
  ProjectMapModel
} from "./mcp.model.js";

import { routeHandler } from "./utils/routeHandler.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({
  path: path.join(__dirname, ".env"),
  quiet: true
});

const DB_NAME = process.env.MONGO_DB_NAME || "mcp_memory";
const DEFAULT_PORT = Number(process.env.PORT || 4000);

const app = express();
app.use(express.json());

let client = null;
let db = null;
let server = null;
let startupPromise = null;

// ========================
// DB HELPER
// ========================
function getDb() {
  if (!db) throw new Error("Database not ready");
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

async function ensureIndexes(database) {
  await Promise.all([
    database.collection("contexts").createIndex({ id: 1 }, { unique: true }),
    database.collection("contexts").createIndex({
      content: "text",
      summary: "text",
      tags: "text"
    }),
    database.collection("actions").createIndex({ id: 1 }, { unique: true }),
    database.collection("actions").createIndex({ contextRefs: 1 }),
    database.collection("sessions").createIndex({ sessionId: 1 }, { unique: true }),
    database.collection("logs").createIndex({ createdAt: -1 }),

    database.collection("agents").createIndex({ agent_id: 1 }, { unique: true }),
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
    })
  ]);
}

function rankSearchResults(results, query) {
  const now = new Date();
  const words = query.toLowerCase().split(" ").filter(Boolean);

  return results
    .map((item) => {
      let score = 0;
      const content = item.content?.toLowerCase() || "";

      const matches = words.filter((w) => content.includes(w)).length;
      score += matches * 2;

      score += (item.importance || 3) * 2;

      const ageHours = (now - new Date(item.createdAt)) / 3600000;
      score += Math.max(0, 5 - ageHours / 24);

      score += Math.log((item.accessCount || 0) + 1);

      return { ...item, score };
    })
    .sort((a, b) => b.score - a.score);
}

// ========================
// ROUTES
// ========================

app.post(
  "/context",
  routeHandler("contexts", async ({ req, collection }) => {
    const context = new ContextModel(req.body);
    await collection.insertOne(normalizeMemory(context));

    await logInfo("Context stored", {
      agent: context.agent,
      project: context.project
    });

    return { success: true, context };
  })
);

app.post(
  "/context/search",
  routeHandler("contexts", async ({ req, collection }) => {
    const { agent, project, query = "", limit = 10 } = req.body;

    const baseQuery = MemoryQueryBuilder.build({ agent, project, query });

    let results = await collection.find(baseQuery).limit(50).toArray();

    const ranked = rankSearchResults(results, query).slice(0, limit);

    const ids = ranked.map((r) => r.id);

    if (ids.length) {
      await collection.updateMany(
        { id: { $in: ids } },
        {
          $inc: { accessCount: 1 },
          $set: { lastAccessedAt: new Date() }
        }
      );
    }

    return ranked;
  })
);

app.get(
  "/context/:id/full",
  routeHandler("contexts", async ({ req, db }) => {
    const context = await db
      .collection("contexts")
      .findOne({ id: req.params.id });

    if (!context) {
      return { error: "Context not found" };
    }

    const actions = await db
      .collection("actions")
      .find({ contextRefs: context.id })
      .toArray();

    return { context, actions };
  })
);

// ========================
// ACTIONS / SESSION
// ========================
app.post(
  "/action",
  routeHandler("actions", async ({ req, collection }) => {
    const action = new ActionModel(req.body);
    await collection.insertOne(normalizeMemory(action));

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

// ========================
// LOGS
// ========================
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

app.post("/log", async (req, res) => {
  try {
    const { type, message, context } = req.body;

    if (type === "error") {
      await logError(new Error(message), context);
    } else {
      await logInfo(message, context);
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========================
// AGENTS
// ========================
app.post(
  "/agent/register",
  routeHandler("agents", async ({ req, collection }) => {
    const agent = new AgentModel(req.body);

    await collection.updateOne(
      { agent_id: agent.agent_id },
      { $set: normalizeMemory(agent) },
      { upsert: true }
    );

    return { success: true, agent };
  })
);

app.get(
  "/agent/list",
  routeHandler("agents", async ({ collection }) => {
    return collection.find().limit(50).toArray();
  })
);

// ========================
// TASKS
// ========================
app.post(
  "/task",
  routeHandler("tasks", async ({ req, collection }) => {
    const task = new TaskModel(req.body);
    await collection.insertOne(normalizeMemory(task));

    return { success: true, task };
  })
);

app.post(
  "/task/assign",
  routeHandler("tasks", async ({ req, collection }) => {
    const { task_id, agent_id } = req.body;

    if (!task_id || !agent_id) {
      return { error: "Missing task_id or agent_id" };
    }

    const updateResult = await collection.updateOne(
      { task_id },
      {
        $set: {
          assigned_to: agent_id,
          status: "in_progress",
          updatedAt: new Date()
        }
      }
    );

    if (!updateResult.matchedCount) {
      return { error: "Task not found" };
    }

    const task = await collection.findOne({ task_id });

    return { success: true, task };
  })
);

app.post(
  "/task/update",
  routeHandler("tasks", async ({ req, collection }) => {
    const { task_id, updates = {} } = req.body;

    if (!task_id) {
      return { error: "Missing task_id" };
    }

    const allowedUpdates = [
      "title",
      "description",
      "assigned_to",
      "status",
      "priority",
      "dependencies",
      "result",
      "blocker"
    ];

    const nextValues = {
      updatedAt: new Date()
    };

    for (const field of allowedUpdates) {
      if (updates[field] !== undefined) {
        nextValues[field] = updates[field];
      }
    }

    if (Object.keys(nextValues).length === 1) {
      return { error: "No valid updates provided" };
    }

    const updateResult = await collection.updateOne(
      { task_id },
      { $set: nextValues }
    );

    if (!updateResult.matchedCount) {
      return { error: "Task not found" };
    }

    const task = await collection.findOne({ task_id });

    return { success: true, task };
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
      .sort({ priority: -1, updatedAt: -1, createdAt: -1 })
      .limit(parsePositiveInt(limit, 50))
      .toArray();
  })
);


// messages

app.post(
  "/message",
  routeHandler("messages", async ({ req, collection }) => {
    const message = new MessageModel(req.body);

    await collection.insertOne(normalizeMemory(message));

    return { success: true, message };
  })
);

app.get(
  "/message/:agent_id",
  routeHandler("messages", async ({ req, collection }) => {
    const { project, limit } = req.query;
    const filter = {
      $or: [
        { to_agent: req.params.agent_id },
        { to_agent: null }
      ]
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

// ========================
// PROJECT MAP
// ========================
app.post(
  "/project-map",
  routeHandler("project_map", async ({ req, collection }) => {
    const entry = new ProjectMapModel(req.body);

    if (!entry.file_path) {
      return { error: "Missing file_path" };
    }

    const filter = {
      project: entry.project,
      file_path: entry.file_path
    };

    await collection.updateOne(
      filter,
      { $set: normalizeMemory(entry) },
      { upsert: true }
    );

    const storedEntry = await collection.findOne(filter);

    return { success: true, entry: storedEntry };
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


// ========================
// ROOT
// ========================
app.get("/", (_req, res) => {
  res.send("MCP Memory Server Running");
});

// ========================
// SERVER START
// ========================
export async function startServer({ port = DEFAULT_PORT, silent = false } = {}) {
  if (server) return { app, db: getDb(), server, port };

  if (!startupPromise) {
    startupPromise = (async () => {
      client = new MongoClient(process.env.MONGO_URI);
      await client.connect();

      db = client.db(DB_NAME);
      initLogger(db);

      await ensureIndexes(db);

      // 🔥 attach globals for routeHandler
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

      if (client) await client.close();

      throw error;
    });
  }

  return startupPromise;
}

// ========================
// STOP SERVER
// ========================
export async function stopServer() {
  if (server?.listening) {
    await new Promise((resolve) => server.close(resolve));
  }

  if (client) await client.close();

  client = null;
  db = null;
  server = null;
  startupPromise = null;
}

// ========================
// AUTO START
// ========================
if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  startServer().catch((error) => {
    console.error("Failed to start MCP Server:", error);
    process.exit(1);
  });
}
