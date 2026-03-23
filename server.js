require("dotenv").config();
const express = require("express");
const { MongoClient } = require("mongodb");

const { initLogger, logError, logInfo } = require("./logger");

const {
  ContextModel,
  ActionModel,
  SessionModel,
  MemoryQueryBuilder,
  normalizeMemory
} = require("./mcp.model");

const app = express();
app.use(express.json());

const client = new MongoClient(process.env.MONGO_URI);
let db;

/**
 * ============================
 * INIT DB
 * ============================
 */
async function init() {
  try {
    await client.connect();
    db = client.db("mcp_memory");

    initLogger(db);
    await logInfo("MongoDB connected");

    console.log("MongoDB connected");
  } catch (err) {
    console.error("MongoDB connection error:", err);
    process.exit(1);
  }
}
init();

/**
 * ============================
 * 🧠 CONTEXT
 * ============================
 */
app.post("/context", async (req, res) => {
  try {
    const context = new ContextModel(req.body);

    await db.collection("contexts").insertOne(normalizeMemory(context));

    await logInfo("Context stored", {
      agent: context.agent,
      project: context.project,
      scope: context.scope
    });

    res.json({ success: true, context });
  } catch (err) {
    await logError(err, { route: "/context", body: req.body });

    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

/**
 * 🔍 SEARCH
 */
app.post("/context/search", async (req, res) => {
  try {
    const {
      agent,
      project,
      query,
      scope = "project",
      includeGlobal = true,
      limit = 10
    } = req.body;

    const mongoQuery = MemoryQueryBuilder.build({
      agent,
      project,
      query,
      scope,
      includeGlobal
    });

    const results = await db
      .collection("contexts")
      .find(mongoQuery)
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();

    res.json(results);
  } catch (err) {
    await logError(err, { route: "/context/search" });

    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

/**
 * FULL CONTEXT
 */
app.get("/context/:id/full", async (req, res) => {
  try {
    const context = await db
      .collection("contexts")
      .findOne({ id: req.params.id });

    if (!context) {
      return res.status(404).json({
        success: false,
        error: "Context not found"
      });
    }

    const actions = await db
      .collection("actions")
      .find({ contextRefs: context.id })
      .toArray();

    res.json({ context, actions });
  } catch (err) {
    await logError(err, { route: "/context/:id/full" });

    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

/**
 * ============================
 * ⚡ ACTION
 * ============================
 */
app.post("/action", async (req, res) => {
  try {
    const action = new ActionModel(req.body);

    await db.collection("actions").insertOne(normalizeMemory(action));

    await logInfo("Action stored", {
      agent: action.agent,
      project: action.project,
      type: action.actionType
    });

    res.json({ success: true, action });
  } catch (err) {
    await logError(err, { route: "/action" });

    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

/**
 * ============================
 * 🧭 SESSION
 * ============================
 */
app.post("/session", async (req, res) => {
  try {
    const session = new SessionModel(req.body);

    await db.collection("sessions").insertOne(normalizeMemory(session));

    res.json({ success: true, session });
  } catch (err) {
    await logError(err, { route: "/session" });

    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

app.get("/session/:id", async (req, res) => {
  try {
    const session = await db
      .collection("sessions")
      .findOne({ sessionId: req.params.id });

    if (!session) {
      return res.status(404).json({
        success: false,
        error: "Session not found"
      });
    }

    res.json(session);
  } catch (err) {
    await logError(err, { route: "/session/:id" });

    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

/**
 * ============================
 * 🪵 LOGS
 * ============================
 */
app.post("/log", async (req, res) => {
  try {
    await db.collection("logs").insertOne({
      ...req.body,
      createdAt: new Date()
    });

    res.json({ success: true });
  } catch {
    res.json({ success: false });
  }
});

/**
 * ============================
 * ❤️ HEALTH
 * ============================
 */
app.get("/", (req, res) => {
  res.send("MCP Memory Server Running 🚀");
});

/**
 * GLOBAL ERROR HANDLER
 */
app.use(async (err, req, res, next) => {
  await logError(err, {
    route: req.path,
    method: req.method
  });

  res.status(500).json({
    success: false,
    error: "Internal Server Error"
  });
});

/**
 * ============================
 * 🚀 START
 * ============================
 */
const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`MCP Memory Server running on port ${PORT}`);
});