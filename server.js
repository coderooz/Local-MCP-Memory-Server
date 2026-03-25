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
    database.collection("messages").createIndex({ message_id: 1 }, { unique: true }),
    database.collection("messages").createIndex({ to_agent: 1 }),
    database.collection("project_map").createIndex({ file_path: 1 })
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

    await collection.updateOne(
      { task_id },
      { $set: { assigned_to: agent_id, status: "in_progress" } }
    );

    return { success: true };
  })
);

app.get(
  "/task/list",
  routeHandler("tasks", async ({ collection }) => {
    return collection.find().limit(50).toArray();
  })
);


// messages

app.post("/message", async (req, res) => {
  const message = new MessageModel(req.body);

  await getDb().collection("messages").insertOne(normalizeMemory(message));

  res.json({ success: true, message });
});

app.get("/message/:agent_id", async (req, res) => {
  const messages = await getDb()
    .collection("messages")
    .find({
      $or: [
        { to_agent: req.params.agent_id },
        { to_agent: null }
      ]
    })
    .toArray();

  res.json(messages);
});

// ========================
// PROJECT MAP
// ========================
app.post(
  "/project-map",
  routeHandler("project_map", async ({ req, collection }) => {
    const entry = new ProjectMapModel(req.body);

    await collection.insertOne(normalizeMemory(entry));

    return { success: true, entry };
  })
);

app.get(
  "/project-map",
  routeHandler("project_map", async ({ collection }) => {
    return collection.find().limit(100).toArray();
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