const { v4: uuidv4 } = require("uuid");
const { ContextModel, normalizeMemory } = require("./mcp.model");

let dbInstance = null;

function initLogger(db) {
  dbInstance = db;
}

async function logToDB(log) {
  if (!dbInstance) return;

  try {
    await dbInstance.collection("logs").insertOne({
      id: uuidv4(),
      ...log,
      createdAt: new Date()
    });
  } catch {}
}

async function logError(error, context = {}) {
  await logToDB({
    type: "error",
    message: error.message,
    stack: error.stack,
    context
  });

  // 🔥 convert important errors → memory
  try {
    const memory = new ContextModel({
      agent: context.agent || "system",
      project: context.project || "global",
      scope: "global",
      type: "error",
      content: error.message,
      metadata: context,
      tags: ["error", "debug"]
    });

    await dbInstance
      .collection("contexts")
      .insertOne(normalizeMemory(memory));
  } catch {}
}

async function logInfo(message, context = {}) {
  await logToDB({
    type: "info",
    message,
    context
  });
}

module.exports = {
  initLogger,
  logError,
  logInfo
};