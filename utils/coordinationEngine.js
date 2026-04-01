const OFFLINE_AFTER_MS = 120000;
const IDLE_AFTER_MS = 45000;

function safeDate(value, fallback = new Date(0)) {
  const date = value ? new Date(value) : fallback;
  return Number.isNaN(date.getTime()) ? fallback : date;
}

export function deriveAgentStatus(agent, now = new Date()) {
  const lastSeen = safeDate(agent?.last_seen, new Date(0));
  const ageMs = now.getTime() - lastSeen.getTime();

  if (ageMs > OFFLINE_AFTER_MS) {
    return "offline";
  }

  if (agent?.current_task) {
    return "active";
  }

  if (ageMs > IDLE_AFTER_MS) {
    return "idle";
  }

  return agent?.status === "active" ? "active" : "idle";
}

export async function refreshAgentStatuses(db, project) {
  const filter = project ? { project } : {};
  const agents = await db.collection("agents").find(filter).toArray();
  const now = new Date();

  await Promise.all(
    agents.map(async (agent) => {
      const status = deriveAgentStatus(agent, now);

      if (status !== agent.status) {
        await db.collection("agents").updateOne(
          { agent_id: agent.agent_id },
          {
            $set: {
              status,
              updatedAt: now
            }
          }
        );
      }
    })
  );
}

export async function computeTaskPriorityScore(db, task) {
  const dependencies = Array.isArray(task.dependencies) ? task.dependencies : [];
  let dependencyPenalty = 0;

  if (dependencies.length) {
    const completedDependencies = await db.collection("tasks").countDocuments({
      task_id: { $in: dependencies },
      status: "completed"
    });

    dependencyPenalty = (dependencies.length - completedDependencies) * 20;
  }

  const createdAt = safeDate(task.createdAt, new Date());
  const ageDays = Math.max(
    0,
    Math.floor((Date.now() - createdAt.getTime()) / 86400000)
  );
  const urgencyBoost = Math.min(ageDays, 14);
  const blockerPenalty = task.blocker ? 25 : 0;
  const requiredCapabilityBoost = (task.required_capabilities || []).length * 3;

  return Math.max(
    0,
    task.priority * 20 +
      urgencyBoost +
      requiredCapabilityBoost -
      dependencyPenalty -
      blockerPenalty
  );
}

export async function buildTaskSchedule(db, task) {
  const dependencies = Array.isArray(task.dependencies) ? task.dependencies : [];

  if (!dependencies.length) {
    return {
      status: task.blocker ? "blocked" : task.status,
      scheduledFor: new Date(),
      schedulingNotes: task.blocker
        ? `Waiting on blocker: ${task.blocker}`
        : "Ready for execution"
    };
  }

  const dependencyTasks = await db
    .collection("tasks")
    .find({ task_id: { $in: dependencies } })
    .toArray();

  const completedDependencyIds = new Set(
    dependencyTasks
      .filter((dependency) => dependency.status === "completed")
      .map((dependency) => dependency.task_id)
  );
  const incompleteDependencies = dependencies.filter(
    (dependencyId) => !completedDependencyIds.has(dependencyId)
  );

  if (incompleteDependencies.length) {
    return {
      status: "blocked",
      scheduledFor: null,
      schedulingNotes: `Waiting on dependencies: ${incompleteDependencies.join(", ")}`
    };
  }

  return {
    status: task.blocker ? "blocked" : task.status,
    scheduledFor: new Date(),
    schedulingNotes: task.blocker
      ? `Waiting on blocker: ${task.blocker}`
      : "Dependencies satisfied"
  };
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
    .collection("agents")
    .find({
      project: task.project,
      status: { $in: ["active", "idle"] }
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

      const statusBoost = agent.status === "idle" ? 5 : 2;
      const availabilityBoost = agent.current_task ? 0 : 4;
      const recencyBoost = Math.max(
        0,
        6 - Math.floor((Date.now() - safeDate(agent.last_seen).getTime()) / 10000)
      );

      return {
        agent,
        score: capabilityOverlap * 10 + statusBoost + availabilityBoost + recencyBoost
      };
    })
    .filter(Boolean)
    .sort((left, right) => right.score - left.score);

  return ranked[0]?.agent || null;
}
