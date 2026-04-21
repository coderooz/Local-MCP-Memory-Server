import { ResourceLockModel, normalizeMemory } from '../core/mcp/models.js';

function toDate(value, fallback = null) {
  if (!value) {
    return fallback;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
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

  const existingLockByAgent = existingLocks.find((lock) => lock.locked_by === agent);

  if (existingLockByAgent) {
    return {
      acquired: true,
      lock: existingLockByAgent,
      warnings: [`Lock already held by ${agent} for ${resource}`],
    };
  }

  const nextLock = new ResourceLockModel({
    agent,
    project,
    scope: 'project',
    resource,
    locked_by: agent,
    expiresAt: new Date(Date.now() + Number(expiresInMs || 300000)),
    metadata,
  });

  try {
    await db.collection('resource_locks').insertOne(normalizeMemory(nextLock));
  } catch (error) {
    if (error.code === 11000) {
      return {
        acquired: false,
        lock: null,
        warnings: [`Failed to acquire lock: ${resource} may be locked by another agent`],
      };
    }
    throw error;
  }

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

  const existingLock = await db.collection('resource_locks').findOne({ project, resource });

  if (!existingLock) {
    return { released: false };
  }

  if (existingLock.locked_by !== agent) {
    return {
      released: false,
      error: `Lock held by ${existingLock.locked_by}, cannot be released by ${agent}`,
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
