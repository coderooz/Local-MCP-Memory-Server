import { v4 as uuidv4 } from 'uuid';
import { getDb } from './connection.js';

export const MEMORY_SCOPE = {
  PRIVATE: 'private',
  PROJECT: 'project',
  GLOBAL: 'global'
};

export const MEMORY_LIFECYCLE = {
  DRAFT: 'draft',
  ACTIVE: 'active',
  DEPRECATED: 'deprecated',
  ARCHIVED: 'archived'
};

export const PROJECT_CATEGORY = {
  BACKEND: 'backend',
  FRONTEND: 'frontend',
  AI_SYSTEM: 'ai-system',
  INFRA: 'infra'
};

export function toStringArray(value) {
  return Array.isArray(value)
    ? value.filter((item) => typeof item === 'string' && item.trim())
    : [];
}

function toPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

export function clampNumber(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, parsed));
}

function normalizeRelationships(value = {}) {
  return {
    parent: typeof value.parent === 'string' && value.parent.trim() ? value.parent : null,
    children: toStringArray(value.children)
  };
}

function normalizeProjectDescriptor(descriptor = {}) {
  const value = toPlainObject(descriptor);
  const allowedCategories = new Set(Object.values(PROJECT_CATEGORY));

  return {
    name:
      typeof value.name === 'string' && value.name.trim() ? value.name.trim() : 'Unnamed Project',
    category: allowedCategories.has(value.category) ? value.category : PROJECT_CATEGORY.AI_SYSTEM,
    description:
      typeof value.description === 'string' && value.description.trim()
        ? value.description.trim()
        : '',
    tech_stack: toStringArray(value.tech_stack),
    goals: toStringArray(value.goals),
    constraints: toStringArray(value.constraints),
    rules: toStringArray(value.rules)
  };
}

export function buildProjectDescriptorContent(descriptorInput = {}) {
  const descriptor = normalizeProjectDescriptor(descriptorInput);
  const sections = [
    `Project: ${descriptor.name}`,
    `Category: ${descriptor.category}`,
    descriptor.description ? `Description: ${descriptor.description}` : null,
    descriptor.tech_stack.length ? `Tech Stack: ${descriptor.tech_stack.join(', ')}` : null,
    descriptor.goals.length ? `Goals: ${descriptor.goals.join(' | ')}` : null,
    descriptor.constraints.length ? `Constraints: ${descriptor.constraints.join(' | ')}` : null,
    descriptor.rules.length ? `Rules: ${descriptor.rules.join(' | ')}` : null
  ];

  return sections.filter(Boolean).join('\n');
}

export class BaseModel {
  constructor(data = {}) {
    this.id = data.id || uuidv4();

    this.agent = data.agent || 'unknown';
    this.project = data.project || 'default';
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

    this.type = data.type || 'general';
    this.content = data.content || '';
    this.summary = data.summary || null;

    this.embedding = data.embedding || null;

    this.relatedContexts = toStringArray(data.relatedContexts);
    this.relatedActions = toStringArray(data.relatedActions);
    this.relatedTasks = toStringArray(data.relatedTasks);
    this.relatedIssues = toStringArray(data.relatedIssues);
    this.relatedAgents = toStringArray(data.relatedAgents);

    this.importance = clampNumber(data.importance, 1, 5, 3);
    this.accessCount = data.accessCount || 0;
    this.lastAccessedAt = data.lastAccessedAt || null;
    this.lifecycle = data.lifecycle || MEMORY_LIFECYCLE.ACTIVE;
    this.conflictsWith = toStringArray(data.conflictsWith);
    this.projectDescriptor = data.projectDescriptor
      ? normalizeProjectDescriptor(data.projectDescriptor)
      : null;
    this.updateReason = data.updateReason || null;
  }
}

export class ProjectDescriptorModel extends ContextModel {
  constructor(data = {}) {
    const descriptor = normalizeProjectDescriptor(data.projectDescriptor || data);
    const tags = Array.from(new Set(['project', descriptor.category, ...toStringArray(data.tags)]));

    super({
      ...data,
      type: 'project',
      scope: MEMORY_SCOPE.PROJECT,
      importance: 5,
      lifecycle: MEMORY_LIFECYCLE.ACTIVE,
      summary: data.summary || `${descriptor.name} project descriptor for ${descriptor.category}`,
      content: data.content || buildProjectDescriptorContent(descriptor),
      tags,
      projectDescriptor: descriptor
    });
  }
}

export class MemoryVersionModel extends BaseModel {
  constructor(data = {}) {
    super(data);

    this.version_id = data.version_id || this.id;
    this.context_id = data.context_id || null;
    this.context_version = data.context_version || 1;
    this.change_type = data.change_type || 'update';
    this.reason = data.reason || 'No reason provided';
    this.snapshot = toPlainObject(data.snapshot);
    this.changedBy = data.changedBy || data.agent || 'system';
    this.changedAt = data.changedAt || new Date();
  }
}

export class ActionModel extends BaseModel {
  constructor(data = {}) {
    super(data);

    this.actionType = data.actionType || 'unknown';
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
    this.status = data.status || 'active';

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
    this.name = data.name || 'Unnamed Agent';
    this.role = data.role || 'worker';

    this.capabilities = data.capabilities || [];
    this.status = data.status || 'idle';

    this.current_task = data.current_task || null;
    this.last_seen = data.last_seen || new Date();
    this.heartbeat_interval_ms = clampNumber(data.heartbeat_interval_ms, 1000, 3600000, 30000);
  }
}

export class TaskModel extends BaseModel {
  constructor(data = {}) {
    super(data);

    this.task_id = data.task_id || this.id;

    this.title = data.title || '';
    this.description = data.description || '';

    this.assigned_to = data.assigned_to || null;
    this.created_by = data.created_by || 'system';

    this.status = data.status || 'pending';

    this.priority = clampNumber(data.priority, 1, 5, 3);
    this.priorityScore = Number.isFinite(Number(data.priorityScore))
      ? Number(data.priorityScore)
      : this.priority;
    this.dependencies = toStringArray(data.dependencies);
    this.required_capabilities = toStringArray(
      data.required_capabilities || data.requiredCapabilities
    );
    this.result = data.result || null;
    this.blocker = data.blocker || null;
    this.scheduledFor = data.scheduledFor || null;
    this.schedulingNotes = data.schedulingNotes || null;
    this.relatedContexts = toStringArray(data.relatedContexts);
    this.relatedIssues = toStringArray(data.relatedIssues);
    this.relatedAgents = toStringArray(data.relatedAgents);
    this.conflictsWith = toStringArray(data.conflictsWith);
  }
}

export class IssueModel extends BaseModel {
  constructor(data = {}) {
    super(data);

    this.issue_id = data.issue_id || this.id;
    this.title = data.title || '';
    this.description = data.description || '';
    this.type = data.type || 'note';
    this.status = data.status || 'open';
    this.relatedContexts = toStringArray(data.relatedContexts);
    this.relatedTasks = toStringArray(data.relatedTasks);
    this.relatedIssues = toStringArray(data.relatedIssues);
    this.relatedAgents = toStringArray(data.relatedAgents);
    this.resolution = data.resolution || null;
    this.resolvedBy = data.resolvedBy || null;
    this.resolvedAt = data.resolvedAt || null;
    this.conflictsWith = toStringArray(data.conflictsWith);
  }
}

export class ActivityModel extends BaseModel {
  constructor(data = {}) {
    super(data);

    this.activity_id = data.activity_id || this.id;
    this.type = data.type || 'action';
    this.message = data.message || '';
    this.related_task = data.related_task || null;
    this.resource = data.resource || null;
    this.timestamp = data.timestamp || new Date();
    this.metadata = toPlainObject(data.metadata);
  }
}

export class ResourceLockModel extends BaseModel {
  constructor(data = {}) {
    super(data);

    this.lock_id = data.lock_id || this.id;
    this.resource = data.resource || '';
    this.locked_by = data.locked_by || data.agent || 'unknown';
    this.expiresAt = data.expiresAt || new Date(Date.now() + 300000);
    this.metadata = toPlainObject(data.metadata);
  }
}

export class LogModel extends BaseModel {
  constructor(data = {}) {
    super(data);

    this.type = data.type || 'info';
    this.message = data.message || '';
    this.stack = data.stack || null;
    this.context = toPlainObject(data.context || {});
  }
}

export function normalizeMemory(memory) {
  return {
    ...JSON.parse(JSON.stringify(memory)),
    importance: clampNumber(memory.importance, 1, 5, 3),
    accessCount: memory.accessCount || 0,
    lastAccessedAt: memory.lastAccessedAt || null,
    lifecycle: memory.lifecycle || MEMORY_LIFECYCLE.ACTIVE,
    createdAt: memory.createdAt || new Date(),
    updatedAt: new Date()
  };
}

export async function ensureIndexes(database) {
  await Promise.all([
    database.collection('contexts').createIndex({ id: 1 }, { unique: true }),
    database.collection('contexts').createIndex({
      content: 'text',
      summary: 'text',
      tags: 'text'
    }),
    database.collection('contexts').createIndex({
      project: 1,
      type: 1,
      lifecycle: 1,
      updatedAt: -1
    }),
    database.collection('contexts').createIndex({ project: 1, conflictsWith: 1 }),
    database.collection('contexts').createIndex({ sessionId: 1 }),
    database.collection('contexts').createIndex({ agent: 1, project: 1 }),

    database.collection('actions').createIndex({ id: 1 }, { unique: true }),
    database.collection('actions').createIndex({ contextRefs: 1 }),
    database.collection('actions').createIndex({ sessionId: 1 }),
    database.collection('actions').createIndex({ agent: 1, project: 1 }),

    database.collection('sessions').createIndex({ sessionId: 1 }, { unique: true }),
    database.collection('sessions').createIndex({ status: 1, lastHeartbeat: -1 }),
    database.collection('sessions').createIndex({ agent: 1, project: 1 }),

    database.collection('logs').createIndex({ createdAt: -1 }),
    database.collection('logs').createIndex({ sessionId: 1 }),
    database.collection('logs').createIndex({ agent: 1, project: 1 }),
    database.collection('logs').createIndex({ type: 1, createdAt: -1 }),

    database.collection('agents').createIndex({ agent_id: 1 }, { unique: true }),
    database.collection('agents').createIndex({ project: 1, status: 1, last_seen: -1 }),
    database.collection('agents').createIndex({ sessionId: 1 }),

    database.collection('tasks').createIndex({ task_id: 1 }, { unique: true }),
    database.collection('tasks').createIndex({ project: 1, status: 1, priority: -1 }),
    database.collection('tasks').createIndex({ project: 1, assigned_to: 1, updatedAt: -1 }),
    database.collection('tasks').createIndex({ sessionId: 1 }),
    database.collection('tasks').createIndex({ agent: 1, project: 1 }),

    database.collection('messages').createIndex({ message_id: 1 }, { unique: true }),
    database.collection('messages').createIndex({ project: 1, to_agent: 1, createdAt: -1 }),
    database.collection('messages').createIndex({ sessionId: 1 }),

    database.collection('project_map').createIndex({ project: 1, file_path: 1 }),
    database.collection('project_map').createIndex({ project: 1, type: 1, updatedAt: -1 }),
    database.collection('project_map').createIndex({
      file_path: 'text',
      summary: 'text',
      key_details: 'text',
      dependencies: 'text',
      exports: 'text',
      tags: 'text'
    }),
    database.collection('project_map').createIndex({ sessionId: 1 }),
    database.collection('project_map').createIndex({ agent: 1, project: 1 }),

    database
      .collection('memory_versions')
      .createIndex({ context_id: 1, context_version: -1 }, { unique: true }),
    database.collection('memory_versions').createIndex({ project: 1, changedAt: -1 }),
    database.collection('memory_versions').createIndex({ sessionId: 1 }),

    database.collection('issues').createIndex({ issue_id: 1 }, { unique: true }),
    database.collection('issues').createIndex({ project: 1, status: 1, type: 1, updatedAt: -1 }),
    database.collection('issues').createIndex({ relatedTasks: 1 }),
    database.collection('issues').createIndex({ relatedContexts: 1 }),
    database.collection('issues').createIndex({ sessionId: 1 }),
    database.collection('issues').createIndex({ agent: 1, project: 1 }),

    database.collection('activity').createIndex({ activity_id: 1 }, { unique: true }),
    database.collection('activity').createIndex({ project: 1, timestamp: -1 }),
    database.collection('activity').createIndex({ project: 1, related_task: 1, timestamp: -1 }),
    database.collection('activity').createIndex({ sessionId: 1 }),
    database.collection('activity').createIndex({ agent: 1, timestamp: -1 }),

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
      recordedAt: -1
    }),
    database.collection('metrics').createIndex({ sessionId: 1 }),

    database.collection('feedbacks').createIndex({ feedback_id: 1 }, { unique: true }),
    database.collection('feedbacks').createIndex({
      project: 1,
      status: 1,
      type: 1,
      severity: 1,
      createdAt: -1
    }),
    database.collection('feedbacks').createIndex({ related_contexts: 1 }),
    database.collection('feedbacks').createIndex({ related_tasks: 1 }),
    database.collection('feedbacks').createIndex({ voters: 1 }),
    database.collection('feedbacks').createIndex({ sessionId: 1 }),

    database.collection('chat_rooms').createIndex({ room_id: 1 }, { unique: true }),
    database.collection('chat_rooms').createIndex({ project: 1, scope: 1 }),
    database.collection('chat_rooms').createIndex({ participants: 1 }),
    database.collection('chat_rooms').createIndex({ sessionId: 1 }),

    database.collection('chat_messages').createIndex({ message_id: 1 }, { unique: true }),
    database.collection('chat_messages').createIndex({ room_id: 1, createdAt: -1 }),
    database.collection('chat_messages').createIndex({ from_agent: 1, createdAt: -1 }),
    database.collection('chat_messages').createIndex({ sessionId: 1 }),

    database.collection('connections').createIndex({ connectionId: 1 }, { unique: true }),
    database.collection('connections').createIndex({ sessionId: 1 }),
    database.collection('connections').createIndex({ clientId: 1 }, { unique: true }),
    database.collection('connections').createIndex({ state: 1, lastActivityAt: -1 })
  ]);
}

export function parsePositiveInt(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

export function parseBoolean(value, fallback = false) {
  if (value === undefined) {
    return fallback;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  return String(value).toLowerCase() === 'true';
}

export function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

export function sanitizeIdentifier(value) {
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
