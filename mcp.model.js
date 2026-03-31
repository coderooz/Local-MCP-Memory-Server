import { v4 as uuidv4 } from "uuid";

export const MEMORY_SCOPE = {
  PRIVATE: "private",
  PROJECT: "project",
  GLOBAL: "global"
};

function toStringArray(value) {
  return Array.isArray(value)
    ? value.filter((item) => typeof item === "string" && item.trim())
    : [];
}

function normalizeRelationships(value = {}) {
  return {
    parent:
      typeof value.parent === "string" && value.parent.trim()
        ? value.parent
        : null,
    children: toStringArray(value.children)
  };
}

export class BaseModel {
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

    this.version = data.version || 1;
  }
}

export class ContextModel extends BaseModel {
  constructor(data = {}) {
    super(data);

    this.type = data.type || "general";
    this.content = data.content || "";
    this.summary = data.summary || null;

    this.embedding = data.embedding || null;

    this.relatedContexts = data.relatedContexts || [];
    this.relatedActions = data.relatedActions || [];

    this.importance = data.importance ?? 3;
    this.accessCount = data.accessCount || 0;
    this.lastAccessedAt = data.lastAccessedAt || null;
  }
}

export class ActionModel extends BaseModel {
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

export class SessionModel extends BaseModel {
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


export class AgentModel extends BaseModel {
  constructor(data = {}) {
    super(data);

    this.agent_id = data.agent_id || this.id;
    this.name = data.name || "Unnamed Agent";
    this.role = data.role || "worker";

    this.capabilities = data.capabilities || [];
    this.status = data.status || "idle"; // active | idle | offline

    this.current_task = data.current_task || null;
    this.last_seen = new Date();
  }
}

export class TaskModel extends BaseModel {
  constructor(data = {}) {
    super(data);

    this.task_id = data.task_id || this.id;

    this.title = data.title || "";
    this.description = data.description || "";

    this.assigned_to = data.assigned_to || null;
    this.created_by = data.created_by || "system";

    this.status = data.status || "pending"; 
    // pending | in_progress | blocked | completed

    this.priority = data.priority || 3;
    this.dependencies = toStringArray(data.dependencies);
    this.result = data.result || null;
    this.blocker = data.blocker || null;
  }
}

export class MessageModel extends BaseModel {
  constructor(data = {}) {
    super(data);

    this.message_id = data.message_id || this.id;

    this.from_agent = data.from_agent || "system";
    this.to_agent = data.to_agent || null;

    this.type = data.type || "info"; 
    // info | warning | handoff | status

    this.content = data.content || "";
    this.related_task = data.related_task || null;
  }
}

export class ProjectMapModel extends BaseModel {
  constructor(data = {}) {
    super(data);

    this.map_id = data.map_id || this.id;
    this.file_path = data.file_path || "";
    this.type = data.type || "unknown";

    this.summary = data.summary || "";

    this.dependencies = toStringArray(data.dependencies);
    this.exports = toStringArray(data.exports);
    this.key_details = toStringArray(data.key_details);
    this.related_tasks = toStringArray(data.related_tasks);

    this.relationships = normalizeRelationships(data.relationships);
    this.last_verified_at = data.last_verified_at || new Date();
  }
}

export class MemoryQueryBuilder {
  static build({ agent, project, query, scope = "project", includeGlobal = true } = {}) {
    const conditions = [];

    if (agent) {
      conditions.push({ agent, scope: MEMORY_SCOPE.PRIVATE });
    }

    if (project && (scope === "project" || scope === "global")) {
      conditions.push({ project, scope: MEMORY_SCOPE.PROJECT });
    }

    if (includeGlobal) {
      conditions.push({ scope: MEMORY_SCOPE.GLOBAL });
    }

    const filters = [];

    if (conditions.length) {
      filters.push({ $or: conditions });
    }

    if (query?.trim()) {
      filters.push({ $text: { $search: query.trim() } });
    }

    if (!filters.length) {
      return {};
    }

    if (filters.length === 1) {
      return filters[0];
    }

    return { $and: filters };
  }
}

export function normalizeMemory(memory) {
  return {
    ...JSON.parse(JSON.stringify(memory)),
    importance: memory.importance ?? 3,
    accessCount: memory.accessCount || 0,
    lastAccessedAt: memory.lastAccessedAt || null,
    createdAt: memory.createdAt || new Date(),
    updatedAt: new Date()
  };
}
