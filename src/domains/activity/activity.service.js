import { v4 as uuidv4 } from 'uuid';
import {
  ActivityModel,
  ResourceLockModel,
  MEMORY_SCOPE,
  normalizeMemory,
  toStringArray,
} from '../../../core/mcp/models.js';

export { ActivityModel, ResourceLockModel };

function toPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function toDate(value, fallback = null) {
  if (!value) {
    return fallback;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

export async function recordActivity(
  db,
  {
    agent = 'system',
    project = 'default',
    type = 'action',
    message,
    related_task = null,
    resource = null,
    metadata = {},
  }
) {
  if (!message) {
    throw new Error('Activity message is required');
  }

  const activity = new ActivityModel({
    agent,
    project,
    scope: MEMORY_SCOPE.PROJECT,
    type,
    message,
    related_task,
    resource,
    metadata: toPlainObject(metadata),
  });

  await db.collection('activity').insertOne(normalizeMemory(activity));

  return { activity };
}

export async function fetchActivity(
  db,
  { project, agent = null, type = null, related_task = null, limit = 50 }
) {
  const filter = {};

  if (project) {
    filter.project = project;
  }

  if (agent) {
    filter.agent = agent;
  }

  if (type) {
    filter.type = type;
  }

  if (related_task) {
    filter.related_task = related_task;
  }

  const activities = await db
    .collection('activity')
    .find(filter)
    .sort({ timestamp: -1 })
    .limit(limit)
    .toArray();

  return activities;
}

export async function cleanupExpiredLocks(db, project) {
  const filter = {
    expiresAt: { $lte: new Date() },
  };

  if (project) {
    filter.project = project;
  }

  await db.collection('resource_locks').deleteMany(filter);
}

export async function listResourceLocks(db, { project, resource } = {}) {
  await cleanupExpiredLocks(db, project);

  const filter = {};

  if (project) {
    filter.project = project;
  }

  if (resource) {
    filter.resource = resource;
  }

  return db
    .collection('resource_locks')
    .find(filter)
    .sort({ expiresAt: 1, createdAt: -1 })
    .toArray();
}

export async function acquireResourceLock(
  db,
  { project, agent, resource, expiresInMs = 300000, metadata = {} }
) {
  if (!resource) {
    return {
      acquired: false,
      lock: null,
      warnings: ['Resource is required'],
    };
  }

  await cleanupExpiredLocks(db, project);

  const existingLocks = await db.collection('resource_locks').find({ project, resource }).toArray();

  const conflictingLocks = existingLocks.filter((lock) => lock.locked_by !== agent);

  if (conflictingLocks.length) {
    return {
      acquired: false,
      lock: conflictingLocks[0],
      warnings: conflictingLocks.map(
        (lock) =>
          `${resource} is already locked by ${lock.locked_by} until ${new Date(
            lock.expiresAt
          ).toISOString()}`
      ),
    };
  }

  const nextLock = new ResourceLockModel({
    agent,
    project,
    scope: MEMORY_SCOPE.PROJECT,
    resource,
    locked_by: agent,
    expiresAt: new Date(Date.now() + Number(expiresInMs || 300000)),
    metadata: toPlainObject(metadata),
  });

  await db
    .collection('resource_locks')
    .updateOne(
      { project, resource, locked_by: agent },
      { $set: normalizeMemory(nextLock) },
      { upsert: true }
    );

  const lock = await db.collection('resource_locks').findOne({
    project,
    resource,
    locked_by: agent,
  });

  return {
    acquired: true,
    lock,
    warnings: [],
  };
}

export async function releaseResourceLock(db, { project, resource, agent }) {
  await cleanupExpiredLocks(db, project);

  if (!resource) {
    return {
      released: false,
    };
  }

  const result = await db.collection('resource_locks').deleteOne({
    project,
    resource,
    locked_by: agent,
  });

  return {
    released: result.deletedCount > 0,
  };
}

export async function evaluateCollaborationRisk(
  db,
  { project, actor, resource, relatedTaskId, currentDocument, expectedUpdatedAt, expectedVersion }
) {
  const warnings = [];
  const activeLocks = resource ? await listResourceLocks(db, { project, resource }) : [];
  const foreignLocks = activeLocks.filter((lock) => lock.locked_by !== actor);

  for (const lock of foreignLocks) {
    warnings.push(
      `Concurrent collaboration warning: ${resource} is locked by ${lock.locked_by} until ${new Date(
        lock.expiresAt
      ).toISOString()}`
    );
  }

  let relatedTask = null;

  if (relatedTaskId) {
    relatedTask = await db.collection('tasks').findOne({
      project,
      task_id: relatedTaskId,
    });

    if (relatedTask?.assigned_to && relatedTask.assigned_to !== actor) {
      warnings.push(
        `Task ownership warning: task ${relatedTask.task_id} is assigned to ${relatedTask.assigned_to}`
      );
    }
  }

  const currentUpdatedAt = toDate(currentDocument?.updatedAt);
  const expectedUpdated = toDate(expectedUpdatedAt);

  if (
    expectedUpdated &&
    currentUpdatedAt &&
    currentUpdatedAt.getTime() !== expectedUpdated.getTime()
  ) {
    warnings.push(
      `Concurrent change warning: resource ${resource} changed since ${expectedUpdated.toISOString()}`
    );
  }

  if (
    expectedVersion !== undefined &&
    currentDocument?.version !== undefined &&
    Number(expectedVersion) !== Number(currentDocument.version)
  ) {
    warnings.push(
      `Concurrent change warning: resource ${resource} is now at version ${currentDocument.version}, expected ${expectedVersion}`
    );
  }

  return {
    warnings,
    activeLocks,
    relatedTask,
  };
}

export async function getActivityById(db, activityId) {
  return db.collection('activity').findOne({ activity_id: activityId });
}
