import { v4 as uuidv4 } from 'uuid';

export const MEMORY_SCOPE = {
  PRIVATE: 'private',
  PROJECT: 'project',
  GLOBAL: 'global',
};

export const MEMORY_LIFECYCLE = {
  DRAFT: 'draft',
  ACTIVE: 'active',
  DEPRECATED: 'deprecated',
  ARCHIVED: 'archived',
};

export const PROJECT_CATEGORY = {
  BACKEND: 'backend',
  FRONTEND: 'frontend',
  AI_SYSTEM: 'ai-system',
  INFRA: 'infra',
};

export function toStringArray(value) {
  return Array.isArray(value)
    ? value.filter((item) => typeof item === 'string' && item.trim())
    : [];
}

export function toPlainObject(value) {
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
    children: toStringArray(value.children),
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
    rules: toStringArray(value.rules),
  };
}

export { normalizeProjectDescriptor };

export function buildProjectDescriptorContent(descriptorInput = {}) {
  const descriptor = normalizeProjectDescriptor(descriptorInput);
  const sections = [
    `Project: ${descriptor.name}`,
    `Category: ${descriptor.category}`,
    descriptor.description ? `Description: ${descriptor.description}` : null,
    descriptor.tech_stack.length ? `Tech Stack: ${descriptor.tech_stack.join(', ')}` : null,
    descriptor.goals.length ? `Goals: ${descriptor.goals.join(' | ')}` : null,
    descriptor.constraints.length ? `Constraints: ${descriptor.constraints.join(' | ')}` : null,
    descriptor.rules.length ? `Rules: ${descriptor.rules.join(' | ')}` : null,
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
      projectDescriptor: descriptor,
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
      error: null,
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
    this.status = data.status || 'idle'; // active | idle | offline

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
    // pending | in_progress | blocked | completed

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

export class MessageModel extends BaseModel {
  constructor(data = {}) {
    super(data);

    this.message_id = data.message_id || this.id;

    this.from_agent = data.from_agent || 'system';
    this.to_agent = data.to_agent || null;

    this.type = data.type || 'info';
    // info | warning | handoff | status

    this.content = data.content || '';
    this.related_task = data.related_task || null;
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

export class ProjectMapModel extends BaseModel {
  constructor(data = {}) {
    super(data);

    this.map_id = data.map_id || this.id;
    this.file_path = data.file_path || '';
    this.type = data.type || 'unknown';

    this.summary = data.summary || '';

    this.dependencies = toStringArray(data.dependencies);
    this.exports = toStringArray(data.exports);
    this.key_details = toStringArray(data.key_details);
    this.related_tasks = toStringArray(data.related_tasks);
    this.related_agents = toStringArray(data.related_agents);
    this.conflictsWith = toStringArray(data.conflictsWith);

    this.relationships = normalizeRelationships(data.relationships);
    this.last_verified_at = data.last_verified_at || new Date();
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

export class MetricModel extends BaseModel {
  constructor(data = {}) {
    super(data);

    this.metric_id = data.metric_id || this.id;
    this.metric_type = data.metric_type || 'custom';
    this.name = data.name || 'unnamed_metric';
    this.value = Number.isFinite(Number(data.value)) ? Number(data.value) : 0;
    this.data = toPlainObject(data.data);
    this.recordedAt = data.recordedAt || new Date();
  }
}

export class MemoryQueryBuilder {
  static build({ agent, project, query, scope = 'project', includeGlobal = true, lifecycle } = {}) {
    const conditions = [];

    if (agent) {
      conditions.push({ agent, scope: MEMORY_SCOPE.PRIVATE });
    }

    if (project && (scope === 'project' || scope === 'global')) {
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

    if (lifecycle) {
      filters.push({ lifecycle });
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
    importance: clampNumber(memory.importance, 1, 5, 3),
    accessCount: memory.accessCount || 0,
    lastAccessedAt: memory.lastAccessedAt || null,
    lifecycle: memory.lifecycle || MEMORY_LIFECYCLE.ACTIVE,
    createdAt: memory.createdAt || new Date(),
    updatedAt: new Date(),
  };
}

export const EMULATOR_TYPE = {
  ANDROID: 'android',
  WEB: 'web',
  IOS_SIMULATOR: 'ios_simulator',
  CUSTOM: 'custom',
};

export const EMULATOR_STATUS = {
  RUNNING: 'running',
  STOPPED: 'stopped',
  UNAVAILABLE: 'unavailable',
  ERROR: 'error',
};

export const EMULATOR_CAPABILITIES = {
  TOUCH: 'touch',
  NETWORK: 'network',
  CAMERA: 'camera',
  GPS: 'gps',
  SMS: 'sms',
  CALL: 'call',
  STORAGE: 'storage',
  SENSORS: 'sensors',
  SCREENSHOT: 'screenshot',
  VIDEO: 'video',
};

export class EmulatorModel extends BaseModel {
  constructor(data = {}) {
    super(data);

    this.emulator_id = data.emulator_id || this.id;
    this.name = data.name || 'Unnamed Emulator';
    this.type = data.type || EMULATOR_TYPE.ANDROID;
    this.status = data.status || EMULATOR_STATUS.STOPPED;

    this.device_id = data.device_id || null;
    this.os_version = data.os_version || null;
    this.screen_resolution = data.screen_resolution || null;

    this.capabilities = toStringArray(
      data.capabilities || [
        EMULATOR_CAPABILITIES.TOUCH,
        EMULATOR_CAPABILITIES.NETWORK,
        EMULATOR_CAPABILITIES.SCREENSHOT,
      ]
    );

    this.score = Number.isFinite(Number(data.score)) ? Number(data.score) : 0;
    this.last_checked = data.last_checked || new Date();

    this.metadata = toPlainObject(data.metadata || {});
  }
}

export const FEEDBACK_TYPE = {
  ISSUE: 'issue',
  IMPROVEMENT: 'improvement',
  FEEDBACK: 'feedback',
};

export const FEEDBACK_STATUS = {
  OPEN: 'open',
  IN_PROGRESS: 'in_progress',
  RESOLVED: 'resolved',
};

export const FEEDBACK_SEVERITY = {
  CRITICAL: 1,
  HIGH: 2,
  MEDIUM: 3,
  LOW: 4,
  TRIVIAL: 5,
};

export class FeedbackModel extends BaseModel {
  constructor(data = {}) {
    super(data);

    this.feedback_id = data.feedback_id || this.id;
    this.type = data.type || FEEDBACK_TYPE.FEEDBACK;
    this.title = data.title || '';
    this.description = data.description || '';

    this.created_by = data.created_by || 'system';

    this.severity = clampNumber(data.severity, 1, 5, FEEDBACK_SEVERITY.MEDIUM);
    this.votes = Number.isFinite(Number(data.votes)) ? Number(data.votes) : 0;
    this.voters = toStringArray(data.voters);

    this.status = data.status || FEEDBACK_STATUS.OPEN;
    this.resolved_by = data.resolved_by || null;
    this.resolved_at = data.resolved_at || null;
    this.resolution = data.resolution || null;

    this.related_contexts = toStringArray(data.related_contexts);
    this.related_tasks = toStringArray(data.related_tasks);
    this.related_issues = toStringArray(data.related_issues);

    this.tags = toStringArray(data.tags);
    this.metadata = toPlainObject(data.metadata || {});
  }
}

export const CHAT_ROOM_SCOPE = {
  PROJECT: 'project',
  GLOBAL: 'global',
};

export const CHAT_MESSAGE_TYPE = {
  INFO: 'info',
  TASK: 'task',
  ALERT: 'alert',
  HANDOFF: 'handoff',
  BROADCAST: 'broadcast',
};

export class ChatRoomModel extends BaseModel {
  constructor(data = {}) {
    super(data);

    this.room_id = data.room_id || this.id;
    this.name = data.name || 'Unnamed Room';
    this.scope = data.scope || CHAT_ROOM_SCOPE.PROJECT;

    const participants = toStringArray(data.participants);
    const admins = toStringArray(data.admins);

    if (data.created_by && !participants.includes(data.created_by)) {
      participants.push(data.created_by);
    }
    if (data.created_by && !admins.includes(data.created_by)) {
      admins.push(data.created_by);
    }

    this.participants = participants;
    this.admins = admins;

    this.is_active = data.is_active !== undefined ? Boolean(data.is_active) : true;
    this.max_participants = clampNumber(data.max_participants, 2, 100, 50);

    this.metadata = toPlainObject(data.metadata || {});
  }
}

export class ChatMessageModel extends BaseModel {
  constructor(data = {}) {
    super(data);

    this.message_id = data.message_id || this.id;
    this.room_id = data.room_id || null;

    this.from_agent = data.from_agent || 'system';
    this.content = data.content || '';

    this.type = data.type || CHAT_MESSAGE_TYPE.INFO;

    this.related_task = data.related_task || null;
    this.related_context = data.related_context || null;

    this.is_edited = data.is_edited !== undefined ? Boolean(data.is_edited) : false;
    this.edited_at = data.edited_at || null;

    this.is_pinned = data.is_pinned !== undefined ? Boolean(data.is_pinned) : false;

    this.metadata = toPlainObject(data.metadata || {});
  }
}
