const { v4: uuidv4 } = require("uuid");

/**
 * Memory Scope Types
 * Controls visibility across agents/projects
 */
const MEMORY_SCOPE = {
  PRIVATE: "private",   // only same agent
  PROJECT: "project",   // all agents in same project
  GLOBAL: "global"      // all agents everywhere
};

/**
 * Base Model
 */
class BaseModel {
  constructor(data = {}) {
    this.id = data.id || uuidv4();

    this.agent = data.agent || "unknown";
    this.project = data.project || "default";
    this.sessionId = data.sessionId || null;

    this.scope = data.scope || MEMORY_SCOPE.PRIVATE;

    this.createdAt = data.createdAt || new Date();
    this.updatedAt = new Date();

    this.tags = data.tags || [];
    this.metadata = data.metadata || {};

    this.version = 1;
  }
}

/**
 * Context Memory (Knowledge)
 */
class ContextModel extends BaseModel {
  constructor(data = {}) {
    super(data);

    this.type = data.type || "general";
    this.content = data.content || "";
    this.summary = data.summary || null;

    this.embedding = data.embedding || null;

    this.relatedContexts = data.relatedContexts || [];
    this.relatedActions = data.relatedActions || [];

    this.score = data.score || {
      importance: 0.5,
      recency: 0.5,
      usage: 0
    };
  }
}

/**
 * Action Memory (Experience)
 */
class ActionModel extends BaseModel {
  constructor(data = {}) {
    super(data);

    this.actionType = data.actionType || "unknown";
    this.target = data.target || null;

    this.before = data.before || null;
    this.after = data.after || null;
    this.diff = data.diff || null;

    this.summary = data.summary || null;

    this.contextRefs = data.contextRefs || [];

    this.outcome = data.outcome || {
      success: true,
      error: null
    };
  }
}

/**
 * Session Memory
 */
class SessionModel extends BaseModel {
  constructor(data = {}) {
    super(data);

    this.sessionId = data.sessionId || uuidv4();

    this.status = data.status || "active";

    this.startedAt = data.startedAt || new Date();
    this.endedAt = data.endedAt || null;

    this.contextIds = data.contextIds || [];
    this.actionIds = data.actionIds || [];
  }
}

/**
 * Query Builder (VERY IMPORTANT 🔥)
 * This enables cross-agent + scoped memory access
 */
class MemoryQueryBuilder {
  static build({ agent, project, query, scope = "project", includeGlobal = true }) {
    const conditions = [];

    // PRIVATE
    conditions.push({
      agent,
      scope: MEMORY_SCOPE.PRIVATE
    });

    // PROJECT
    if (scope === "project" || scope === "global") {
      conditions.push({
        project,
        scope: MEMORY_SCOPE.PROJECT
      });
    }

    // GLOBAL
    if (includeGlobal) {
      conditions.push({
        scope: MEMORY_SCOPE.GLOBAL
      });
    }

    return {
      $and: [
        { $or: conditions },
        {
          content: { $regex: query, $options: "i" }
        }
      ]
    };
  }
}

/**
 * Normalizer
 */
function normalizeMemory(memory) {
  return JSON.parse(JSON.stringify(memory));
}

module.exports = {
  MEMORY_SCOPE,
  BaseModel,
  ContextModel,
  ActionModel,
  SessionModel,
  MemoryQueryBuilder,
  normalizeMemory
};