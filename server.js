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
  normalizeMemory
} from "./mcp.model.js";

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

function getDb() {
  if (!db) {
    throw new Error("Database connection is not ready.");
  }

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
    database.collection("logs").createIndex({ createdAt: -1 })
  ]);
}

function rankSearchResults(results, query) {
  const now = new Date();
  const queryWords = String(query || "")
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  return results
    .map((item) => {
      let score = 0;
      const content = item.content?.toLowerCase() || "";

      if (queryWords.length) {
        const matches = queryWords.filter((word) => content.includes(word)).length;
        score += matches * 2;
      }

      score += (item.importance || 3) * 2;

      const ageHours = (now - new Date(item.createdAt)) / (1000 * 60 * 60);
      score += Math.max(0, 5 - ageHours / 24);

      score += Math.log((item.accessCount || 0) + 1);

      return { ...item, score };
    })
    .sort((a, b) => b.score - a.score);
}

app.post("/context", async (req, res) => {
  try {
    const context = new ContextModel(req.body);

    await getDb().collection("contexts").insertOne(normalizeMemory(context));

    await logInfo("Context stored", {
      agent: context.agent,
      project: context.project,
      scope: context.scope
    });

    res.json({ success: true, context });
  } catch (error) {
    await logError(error, {
      route: "/context",
      agent: req.body?.agent,
      project: req.body?.project
    });

    res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/context/search", async (req, res) => {
  try {
    const {
      agent,
      project,
      query = "",
      scope = "project",
      includeGlobal = true,
      limit = 10
    } = req.body;

    const baseQuery = MemoryQueryBuilder.build({
      agent,
      project,
      query,
      scope,
      includeGlobal
    });

    let results = await getDb()
      .collection("contexts")
      .find(baseQuery)
      .limit(50)
      .toArray();

    const finalResults = rankSearchResults(results, query).slice(0, limit);
    const ids = finalResults.map((result) => result.id);

    if (ids.length) {
      await getDb().collection("contexts").updateMany(
        { id: { $in: ids } },
        {
          $inc: { accessCount: 1 },
          $set: { lastAccessedAt: new Date() }
        }
      );
    }

    res.json(finalResults);
  } catch (error) {
    await logError(error, {
      route: "/context/search",
      agent: req.body?.agent,
      project: req.body?.project
    });

    res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/context/:id/full", async (req, res) => {
  try {
    const context = await getDb()
      .collection("contexts")
      .findOne({ id: req.params.id });

    if (!context) {
      return res.status(404).json({
        success: false,
        error: "Context not found"
      });
    }

    const actions = await getDb()
      .collection("actions")
      .find({ contextRefs: context.id })
      .toArray();

    res.json({ context, actions });
  } catch (error) {
    await logError(error, {
      route: "/context/:id/full",
      contextId: req.params.id
    });

    res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/action", async (req, res) => {
  try {
    const action = new ActionModel(req.body);

    await getDb().collection("actions").insertOne(normalizeMemory(action));

    res.json({ success: true, action });
  } catch (error) {
    await logError(error, {
      route: "/action",
      agent: req.body?.agent,
      project: req.body?.project
    });

    res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/session", async (req, res) => {
  try {
    const session = new SessionModel(req.body);

    await getDb().collection("sessions").insertOne(normalizeMemory(session));

    res.json({ success: true, session });
  } catch (error) {
    await logError(error, {
      route: "/session",
      agent: req.body?.agent,
      project: req.body?.project
    });

    res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/logs", async (req, res) => {
  try {
    const { query = {}, limit = 20 } = req.body;

    const logs = await getDb()
      .collection("logs")
      .find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();

    res.json(logs);
  } catch (error) {
    await logError(error, { route: "/logs" });
    res.status(500).json({ error: error.message });
  }
});

app.post("/log", async (req, res) => {
  try {
    const { type, message, stack, context } = req.body;

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
      await logInfo("MongoDB connected", { dbName: DB_NAME });

      server = await new Promise((resolve, reject) => {
        const listener = app.listen(port, () => resolve(listener));
        listener.on("error", reject);
      });

      if (!silent) {
        process.stderr.write(`MCP Memory Server running on port ${port}\n`);
      }

      return { app, db, server, port };
    })().catch(async (error) => {
      startupPromise = null;
      db = null;
      server = null;

      if (client) {
        try {
          await client.close();
        } catch {}
      }

      client = null;
      throw error;
    });
  }

  return startupPromise;
}

export async function stopServer() {
  if (server?.listening) {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
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
    console.error("Failed to start MCP Memory Server:", error);
    process.exit(1);
  });
}
