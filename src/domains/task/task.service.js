import { v4 as uuidv4 } from 'uuid';
import {
  TaskModel,
  MEMORY_SCOPE,
  normalizeMemory,
  toStringArray,
  clampNumber,
} from '../../../core/mcp/models.js';

export { TaskModel };

function safeDate(value, fallback = new Date(0)) {
  const date = value ? new Date(value) : fallback;
  return Number.isNaN(date.getTime()) ? fallback : date;
}

export async function computeTaskPriorityScore(db, task) {
  const dependencies = Array.isArray(task.dependencies) ? task.dependencies : [];
  let dependencyPenalty = 0;

  if (dependencies.length) {
    const completedDependencies = await db.collection('tasks').countDocuments({
      task_id: { $in: dependencies },
      status: 'completed',
    });

    dependencyPenalty = (dependencies.length - completedDependencies) * 20;
  }

  const createdAt = safeDate(task.createdAt, new Date());
  const ageDays = Math.max(0, Math.floor((Date.now() - createdAt.getTime()) / 86400000));
  const urgencyBoost = Math.min(ageDays, 14);
  const blockerPenalty = task.blocker ? 25 : 0;
  const requiredCapabilityBoost = (task.required_capabilities || []).length * 3;

  return Math.max(
    0,
    task.priority * 20 + urgencyBoost + requiredCapabilityBoost - dependencyPenalty - blockerPenalty
  );
}

export async function buildTaskSchedule(db, task) {
  const dependencies = Array.isArray(task.dependencies) ? task.dependencies : [];

  if (!dependencies.length) {
    return {
      status: task.blocker ? 'blocked' : task.status,
      scheduledFor: new Date(),
      schedulingNotes: task.blocker ? `Waiting on blocker: ${task.blocker}` : 'Ready for execution',
    };
  }

  const dependencyTasks = await db
    .collection('tasks')
    .find({ task_id: { $in: dependencies } })
    .toArray();

  const completedDependencyIds = new Set(
    dependencyTasks
      .filter((dependency) => dependency.status === 'completed')
      .map((dependency) => dependency.task_id)
  );
  const incompleteDependencies = dependencies.filter(
    (dependencyId) => !completedDependencyIds.has(dependencyId)
  );

  if (incompleteDependencies.length) {
    return {
      status: 'blocked',
      scheduledFor: null,
      schedulingNotes: `Waiting on dependencies: ${incompleteDependencies.join(', ')}`,
    };
  }

  return {
    status: task.blocker ? 'blocked' : task.status,
    scheduledFor: new Date(),
    schedulingNotes: task.blocker
      ? `Waiting on blocker: ${task.blocker}`
      : 'Dependencies satisfied',
  };
}

async function refreshAgentStatuses(db, project) {
  const filter = project ? { project } : {};
  const agents = await db.collection('agents').find(filter).toArray();
  const now = new Date();
  const OFFLINE_AFTER_MS = 120000;
  const IDLE_AFTER_MS = 45000;

  await Promise.all(
    agents.map(async (agent) => {
      const lastSeen = safeDate(agent?.last_seen, new Date(0));
      const ageMs = now.getTime() - lastSeen.getTime();
      let status = 'idle';
      if (ageMs > OFFLINE_AFTER_MS) {
        status = 'offline';
      } else if (agent?.current_task) {
        status = 'active';
      } else if (ageMs > IDLE_AFTER_MS) {
        status = 'idle';
      } else {
        status = agent?.status === 'active' ? 'active' : 'idle';
      }

      if (status !== agent.status) {
        await db.collection('agents').updateOne(
          { agent_id: agent.agent_id },
          {
            $set: {
              status,
              updatedAt: now,
            },
          }
        );
      }
    })
  );
}

export async function autoAssignTask(db, task) {
  const requiredCapabilities = Array.isArray(task.required_capabilities)
    ? task.required_capabilities
    : [];

  if (!requiredCapabilities.length) {
    return null;
  }

  await refreshAgentStatuses(db, task.project);

  const candidateAgents = await db
    .collection('agents')
    .find({
      project: task.project,
      status: { $in: ['active', 'idle'] },
    })
    .toArray();

  const ranked = candidateAgents
    .map((agent) => {
      const capabilityOverlap = requiredCapabilities.filter((capability) =>
        (agent.capabilities || []).includes(capability)
      ).length;

      if (!capabilityOverlap) {
        return null;
      }

      const statusBoost = agent.status === 'idle' ? 5 : 2;
      const availabilityBoost = agent.current_task ? 0 : 4;
      const recencyBoost = Math.max(
        0,
        6 - Math.floor((Date.now() - safeDate(agent.last_seen).getTime()) / 10000)
      );

      return {
        agent,
        score: capabilityOverlap * 10 + statusBoost + availabilityBoost + recencyBoost,
      };
    })
    .filter(Boolean)
    .sort((left, right) => right.score - left.score);

  return ranked[0]?.agent || null;
}

export function buildDerivedTaskState(task, schedule) {
  return {
    status: schedule.status,
    scheduledFor: schedule.scheduledFor,
    schedulingNotes: schedule.schedulingNotes,
  };
}

export async function createTask(
  db,
  {
    title,
    description = '',
    assigned_to = null,
    created_by = 'system',
    priority = 3,
    status = 'pending',
    dependencies = [],
    required_capabilities = [],
    agent = 'system',
    project = 'default',
    relatedContexts = [],
    relatedIssues = [],
    expectedUpdatedAt,
    expectedVersion,
    idempotencyKey = null,
  }
) {
  if (idempotencyKey) {
    const existing = await db.collection('tasks').findOne({ idempotencyKey });
    if (existing) {
      return { success: true, task: existing, idempotent: true };
    }
  }

  const taskId = uuidv4();
  const dependenciesArray = toStringArray(dependencies);
  const capabilitiesArray = toStringArray(required_capabilities);

  const task = new TaskModel({
    task_id: taskId,
    title,
    description,
    assigned_to,
    created_by,
    priority: clampNumber(priority, 1, 5, 3),
    status,
    dependencies: dependenciesArray,
    required_capabilities: capabilitiesArray,
    agent,
    project,
    scope: MEMORY_SCOPE.PROJECT,
    relatedContexts: toStringArray(relatedContexts),
    relatedIssues: toStringArray(relatedIssues),
    idempotencyKey: idempotencyKey || null,
  });

  const schedule = await buildTaskSchedule(db, task);
  task.status = schedule.status;
  task.scheduledFor = schedule.scheduledFor;
  task.schedulingNotes = schedule.schedulingNotes;

  const priorityScore = await computeTaskPriorityScore(db, task);
  task.priorityScore = priorityScore;

  try {
    await db.collection('tasks').insertOne(normalizeMemory(task));
  } catch (error) {
    if (error.code === 11000) {
      const existing = await db.collection('tasks').findOne({ idempotencyKey });
      if (existing) {
        return { success: true, task: existing, idempotent: true };
      }
    }
    throw error;
  }

  const warnings = [];

  if (dependenciesArray.length) {
    const missingDependencies = dependenciesArray.filter((depId) => !taskId.includes(depId));
    for (const depId of dependenciesArray) {
      const depTask = await db.collection('tasks').findOne({ task_id: depId });
      if (!depTask) {
        warnings.push(`Dependency not found: ${depId}`);
      }
    }
  }

  if (capabilitiesArray.length && !assigned_to) {
    const autoAssigned = await autoAssignTask(db, task);
    if (autoAssigned) {
      await db
        .collection('tasks')
        .updateOne(
          { task_id: taskId },
          { $set: { assigned_to: autoAssigned.agent_id, updatedAt: new Date() } }
        );
      task.assigned_to = autoAssigned.agent_id;
      warnings.push(`Auto-assigned to: ${autoAssigned.agent_id}`);
    }
  }

  const storedTask = await db.collection('tasks').findOne({ task_id: taskId });
  return { task: storedTask, warnings };
}

export async function updateTask(
  db,
  { task_id, updates = {}, agent = 'system', expectedUpdatedAt, expectedVersion }
) {
  const existingTask = await db.collection('tasks').findOne({ task_id });

  if (!existingTask) {
    return { success: false, error: 'Task not found' };
  }

  if (existingTask.assigned_to && existingTask.assigned_to !== agent) {
    return {
      success: false,
      error: `Task is assigned to ${existingTask.assigned_to}. Only the assigned agent can update it.`
    };
  }

  if (expectedUpdatedAt && expectedVersion) {
    const expectedDate = new Date(expectedUpdatedAt);
    const currentDate = new Date(existingTask.updatedAt);

    if (expectedDate.getTime() !== currentDate.getTime()) {
      return {
        success: false,
        error: 'Concurrent update detected: timestamps do not match',
      };
    }

    if (Number(expectedVersion) !== Number(existingTask.version)) {
      return {
        success: false,
        error: `Concurrent update detected: version mismatch (expected ${expectedVersion}, got ${existingTask.version})`,
      };
    }
  }

  const updateOps = {
    ...updates,
    updatedAt: new Date(),
  };

  if (updates.dependencies) {
    updateOps.dependencies = toStringArray(updates.dependencies);
  }

  if (updates.required_capabilities) {
    updateOps.required_capabilities = toStringArray(updates.required_capabilities);
  }

  if (updates.relatedContexts) {
    updateOps.relatedContexts = toStringArray(updates.relatedContexts);
  }

  if (updates.relatedIssues) {
    updateOps.relatedIssues = toStringArray(updates.relatedIssues);
  }

  if (updates.status === 'completed') {
    updateOps.result = updates.result || null;
  }

  if (updates.blocker !== undefined) {
    updateOps.blocker = updates.blocker;
  }

  await db.collection('tasks').updateOne({ task_id }, { $set: updateOps });

  const schedule = await buildTaskSchedule(db, {
    ...existingTask,
    ...updates,
    dependencies: updateOps.dependencies,
  });

  await db.collection('tasks').updateOne(
    { task_id },
    {
      $set: {
        status: schedule.status,
        scheduledFor: schedule.scheduledFor,
        schedulingNotes: schedule.schedulingNotes,
      },
    }
  );

  const priorityScore = await computeTaskPriorityScore(db, {
    ...existingTask,
    ...updates,
  });
  await db.collection('tasks').updateOne({ task_id }, { $set: { priorityScore } });

  const updatedTask = await db.collection('tasks').findOne({ task_id });
  return { success: true, task: updatedTask };
}

export async function assignTask(db, { task_id, agent_id, maxRetries = 3 }) {
  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const existingTask = await db.collection('tasks').findOne({ task_id });

    if (!existingTask) {
      return { success: false, error: 'Task not found' };
    }

    if (existingTask.assigned_to && existingTask.assigned_to !== agent_id) {
      return {
        success: false,
        error: `Task already assigned to ${existingTask.assigned_to}`,
      };
    }

    if (existingTask.assigned_to === agent_id) {
      return { success: true, task: existingTask };
    }

    const currentVersion = existingTask.version || 1;

    const updatedTask = await db.collection('tasks').findOneAndUpdate(
      {
        task_id,
        $or: [
          { assigned_to: null },
          { assigned_to: { $exists: false } }
        ],
        version: currentVersion
      },
      {
        $set: {
          assigned_to: agent_id,
          status: existingTask.status === 'pending' ? 'in_progress' : existingTask.status,
          updatedAt: new Date(),
        },
        $inc: { version: 1 }
      },
      { returnDocument: 'after' }
    );

    if (updatedTask) {
      return { success: true, task: updatedTask };
    }

    lastError = 'Task was claimed by another agent (version conflict)';

    if (attempt < maxRetries) {
      await new Promise(resolve => setTimeout(resolve, 50 * Math.pow(2, attempt)));
    }
  }

  return {
    success: false,
    error: `Failed after ${maxRetries} attempts: ${lastError}`
  };
}

export async function fetchTasks(
  db,
  {
    project,
    assigned_to = null,
    created_by = null,
    status = null,
    include_completed = true,
    limit = 50,
  }
) {
  const filter = {};

  if (project) {
    filter.project = project;
  }

  if (assigned_to) {
    filter.assigned_to = assigned_to;
  }

  if (created_by) {
    filter.created_by = created_by;
  }

  if (status) {
    filter.status = status;
  } else if (!include_completed) {
    filter.status = { $ne: 'completed' };
  }

  const tasks = await db
    .collection('tasks')
    .find(filter)
    .sort({ priorityScore: -1, createdAt: -1 })
    .limit(limit)
    .toArray();

  return tasks;
}

export async function getTaskById(db, taskId) {
  return db.collection('tasks').findOne({ task_id: taskId });
}
