/**
 * MCP Reset System
 * 
 * Provides controlled database cleanup with multiple safety levels.
 * Prevents accidental data loss through explicit confirmation requirements.
 */

import { normalizeMemory } from "../mcp.model.js";

/**
 * Reset levels defining the scope of data deletion.
 * @readonly
 * @enum {string}
 */
export const RESET_LEVELS = {
  MINOR: "minor",     // Logs, temp contexts, stale sessions
  MODERATE: "moderate", // Above + completed tasks
  MAJOR: "major",     // Above + failed tasks, old contexts
  SEVERE: "severe"    // Complete wipe - requires explicit confirmation
};

/**
 * Reset scope options defining what data to target.
 * @readonly
 * @enum {string}
 */
export const RESET_SCOPES = {
  LOGS: "logs",
  CONTEXTS: "contexts",
  TASKS: "tasks",
  AGENTS: "agents",
  PROJECT_MAP: "project_map",
  ACTIVITY: "activity",
  METRICS: "metrics",
  MESSAGES: "messages",
  ALL: "all"
};

/**
 * Safety confirmation constant required for severe resets.
 * @type {string}
 */
export const RESET_CONFIRMATION_CODE = "MCP_RESET_CONFIRM";

/**
 * Calculates the age of a document in milliseconds.
 *
 * @param {object} doc - Document with createdAt or timestamp field
 * @returns {number} Age in milliseconds
 *
 * @example
 * const age = getDocAge({ createdAt: new Date(Date.now() - 86400000) });
 * // Returns ~86400000 (1 day in ms)
 */
function getDocAge(doc) {
  const createdAt = doc?.createdAt || doc?.timestamp || doc?.startedAt;
  if (!createdAt) return 0;
  return Date.now() - new Date(createdAt).getTime();
}

/**
 * Checks if a document is stale based on age threshold.
 *
 * @param {object} doc - Document to check
 * @param {number} thresholdMs - Age threshold in milliseconds
 * @returns {boolean} True if document is older than threshold
 *
 * @example
 * isStale({ createdAt: new Date(Date.now() - 604800000) }, 86400000);
 * // Returns true (older than 1 day)
 */
function isStale(doc, thresholdMs = 604800000) {
  return getDocAge(doc) > thresholdMs;
}

/**
 * Logs a reset operation to the activity log.
 *
 * @param {object} db - MongoDB database instance
 * @param {object} params - Log parameters
 * @param {string} params.level - Reset level
 * @param {string} params.scope - Reset scope
 * @param {string} params.agent - Agent performing reset
 * @param {string} params.project - Project context
 * @param {object} params.summary - Summary of deleted items
 * @returns {Promise<object>} Created activity log entry
 *
 * @example
 * await logResetAction(db, {
 *   level: "minor",
 *   scope: "logs",
 *   agent: "admin-agent",
 *   project: "my-project",
 *   summary: { logsDeleted: 150, contextsDeleted: 0 }
 * });
 */
async function logResetAction(db, { level, scope, agent, project, summary }) {
  const collection = db.collection("activity");

  const activity = {
    id: `reset-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    agent: agent || "system",
    project: project || "default",
    type: "system",
    message: `MCP Reset executed: ${level} level, scope: ${scope}`,
    resource: "system:reset",
    createdAt: new Date(),
    updatedAt: new Date(),
    version: 1,
    scope: "project",
    metadata: {
      action: "mcp_reset",
      level,
      scope,
      summary,
      confirmed: true
    }
  };

  await collection.insertOne(normalizeMemory(activity));
  return activity;
}

/**
 * Performs a MINOR reset - cleanup of noise data.
 * 
 * Deletes:
 * - Logs older than 7 days
 * - Temporary contexts with no importance
 * - Stale sessions (inactive > 1 hour)
 * 
 * Preserves:
 * - Tasks (all)
 * - Agents
 * - Project map
 * - Important contexts
 *
 * @param {object} db - MongoDB database instance
 * @param {object} params - Reset parameters
 * @param {string} params.project - Project to reset (optional, all if null)
 * @param {string} params.agent - Agent performing reset
 * @returns {Promise<object>} Summary of deleted items
 *
 * @example
 * const result = await minorReset(db, { project: "my-project", agent: "cleanup-agent" });
 * console.log(result.logsDeleted); // 42
 */
export async function minorReset(db, { project = null, agent = "system" } = {}) {
  const results = {
    level: RESET_LEVELS.MINOR,
    timestamp: new Date().toISOString(),
    agent,
    project: project || "all",
    deleted: {},
    preserved: [
      "tasks",
      "agents",
      "project_map",
      "important_contexts"
    ]
  };

  // Delete old logs (older than 7 days)
  const logsFilter = { createdAt: { $lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } };
  if (project) logsFilter.project = project;
  const logsResult = await db.collection("logs").deleteMany(logsFilter);
  results.deleted.logs = logsResult.deletedCount;

  // Delete stale sessions (inactive > 1 hour)
  const sessionThreshold = Date.now() - 60 * 60 * 1000;
  const sessionsFilter = { startedAt: { $lt: new Date(sessionThreshold) } };
  if (project) sessionsFilter.project = project;
  const sessionsResult = await db.collection("sessions").deleteMany(sessionsFilter);
  results.deleted.sessions = sessionsResult.deletedCount;

  // Delete unimportant temp contexts (importance 1, not accessed, older than 3 days)
  const contextThreshold = Date.now() - 3 * 24 * 60 * 60 * 1000;
  const tempContextFilter = {
    importance: 1,
    accessCount: { $lte: 1 },
    createdAt: { $lt: new Date(contextThreshold) },
    type: { $ne: "project" }
  };
  if (project) tempContextFilter.project = project;
  const contextsResult = await db.collection("contexts").deleteMany(tempContextFilter);
  results.deleted.tempContexts = contextsResult.deletedCount;

  // Clean up old activity logs (older than 14 days)
  const activityFilter = {
    createdAt: { $lt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) }
  };
  if (project) activityFilter.project = project;
  const activityResult = await db.collection("activity").deleteMany(activityFilter);
  results.deleted.activityLogs = activityResult.deletedCount;

  await logResetAction(db, {
    level: RESET_LEVELS.MINOR,
    scope: "noise_cleanup",
    agent,
    project: project || "all",
    summary: results.deleted
  });

  return results;
}

/**
 * Performs a MODERATE reset - cleanup of completed work.
 * 
 * Deletes:
 * - All logs
 * - Completed/failed tasks
 * - Archived contexts
 * - Old activity logs
 * 
 * Preserves:
 * - Active tasks (pending, in_progress)
 * - Agents
 * - Project config and map
 * - Important contexts
 *
 * @param {object} db - MongoDB database instance
 * @param {object} params - Reset parameters
 * @param {string} params.project - Project to reset
 * @param {string} params.agent - Agent performing reset
 * @param {string} params.keepDays - Days of history to keep (default: 7)
 * @returns {Promise<object>} Summary of deleted items
 *
 * @example
 * const result = await moderateReset(db, { project: "my-project", agent: "admin" });
 */
export async function moderateReset(db, { project, agent = "system", keepDays = 7 } = {}) {
  const results = {
    level: RESET_LEVELS.MODERATE,
    timestamp: new Date().toISOString(),
    agent,
    project: project || "all",
    deleted: {},
    preserved: [
      "active_tasks",
      "agents",
      "project_config",
      "project_map",
      "important_contexts"
    ]
  };

  const cutoff = new Date(Date.now() - keepDays * 24 * 60 * 60 * 1000);

  // Delete all logs
  const logsFilter = {};
  if (project) logsFilter.project = project;
  const logsResult = await db.collection("logs").deleteMany(logsFilter);
  results.deleted.logs = logsResult.deletedCount;

  // Delete completed and failed tasks
  const tasksFilter = { status: { $in: ["completed", "failed", "cancelled"] } };
  if (project) tasksFilter.project = project;
  const tasksResult = await db.collection("tasks").deleteMany(tasksFilter);
  results.deleted.tasks = tasksResult.deletedCount;

  // Delete archived and deprecated contexts
  const archivedFilter = {
    lifecycle: { $in: ["archived", "deprecated"] }
  };
  if (project) archivedFilter.project = project;
  const archivedResult = await db.collection("contexts").deleteMany(archivedFilter);
  results.deleted.archivedContexts = archivedResult.deletedCount;

  // Delete old unimportant contexts
  const oldContextFilter = {
    importance: { $lte: 2 },
    createdAt: { $lt: cutoff },
    type: { $ne: "project" }
  };
  if (project) oldContextFilter.project = project;
  const oldContextResult = await db.collection("contexts").deleteMany(oldContextFilter);
  results.deleted.oldContexts = oldContextResult.deletedCount;

  // Delete old activity logs
  const activityFilter = { createdAt: { $lt: cutoff } };
  if (project) activityFilter.project = project;
  const activityResult = await db.collection("activity").deleteMany(activityFilter);
  results.deleted.activityLogs = activityResult.deletedCount;

  // Delete old metrics
  const metricsFilter = { recordedAt: { $lt: cutoff } };
  if (project) metricsFilter.project = project;
  const metricsResult = await db.collection("metrics").deleteMany(metricsFilter);
  results.deleted.metrics = metricsResult.deletedCount;

  await logResetAction(db, {
    level: RESET_LEVELS.MODERATE,
    scope: "completed_cleanup",
    agent,
    project: project || "all",
    summary: results.deleted
  });

  return results;
}

/**
 * Performs a MAJOR reset - aggressive cleanup.
 * 
 * Deletes:
 * - Logs
 * - All tasks except active
 * - Most contexts except project descriptor
 * - Activity logs
 * - Metrics
 * 
 * Preserves:
 * - Active tasks only
 * - Agent registrations
 * - Project descriptor
 *
 * @param {object} db - MongoDB database instance
 * @param {object} params - Reset parameters
 * @param {string} params.project - Project to reset
 * @param {string} params.agent - Agent performing reset
 * @returns {Promise<object>} Summary of deleted items
 *
 * @example
 * const result = await majorReset(db, { project: "legacy-project", agent: "system" });
 */
export async function majorReset(db, { project, agent = "system" } = {}) {
  const results = {
    level: RESET_LEVELS.MAJOR,
    timestamp: new Date().toISOString(),
    agent,
    project: project || "all",
    deleted: {},
    preserved: [
      "active_tasks",
      "agent_registrations",
      "project_descriptor"
    ]
  };

  // Delete all logs
  const logsFilter = project ? { project } : {};
  const logsResult = await db.collection("logs").deleteMany(logsFilter);
  results.deleted.logs = logsResult.deletedCount;

  // Delete non-active tasks
  const tasksFilter = { status: { $nin: ["pending", "in_progress", "blocked"] } };
  if (project) tasksFilter.project = project;
  const tasksResult = await db.collection("tasks").deleteMany(tasksFilter);
  results.deleted.tasks = tasksResult.deletedCount;

  // Delete all contexts except project descriptor
  const contextFilter = { type: { $ne: "project" } };
  if (project) contextFilter.project = project;
  const contextResult = await db.collection("contexts").deleteMany(contextFilter);
  results.deleted.contexts = contextResult.deletedCount;

  // Delete all memory versions
  const versionsFilter = project ? { project } : {};
  const versionsResult = await db.collection("memory_versions").deleteMany(versionsFilter);
  results.deleted.memoryVersions = versionsResult.deletedCount;

  // Delete activity logs
  const activityFilter = project ? { project } : {};
  const activityResult = await db.collection("activity").deleteMany(activityFilter);
  results.deleted.activityLogs = activityResult.deletedCount;

  // Delete all metrics
  const metricsFilter = project ? { project } : {};
  const metricsResult = await db.collection("metrics").deleteMany(metricsFilter);
  results.deleted.metrics = metricsResult.deletedCount;

  // Delete old sessions
  const sessionsFilter = {};
  if (project) sessionsFilter.project = project;
  const sessionsResult = await db.collection("sessions").deleteMany(sessionsFilter);
  results.deleted.sessions = sessionsResult.deletedCount;

  await logResetAction(db, {
    level: RESET_LEVELS.MAJOR,
    scope: "aggressive_cleanup",
    agent,
    project: project || "all",
    summary: results.deleted
  });

  return results;
}

/**
 * Performs a SEVERE reset - complete database wipe.
 * 
 * WARNING: This deletes EVERYTHING and cannot be undone.
 * Requires explicit MCP_RESET_CONFIRM code.
 * 
 * Deletes:
 * - ALL collections
 * - ALL data
 * 
 * Resets to empty state.
 *
 * @param {object} db - MongoDB database instance
 * @param {object} params - Reset parameters
 * @param {string} params.project - Project to wipe (or null for entire DB)
 * @param {string} params.confirmation - Must equal "MCP_RESET_CONFIRM"
 * @param {string} params.agent - Agent performing reset
 * @returns {Promise<object>} Summary of deleted items or error
 * @throws {Error} If confirmation code is missing or incorrect
 *
 * @example
 * try {
 *   const result = await severeReset(db, {
 *     project: "my-project",
 *     confirmation: "MCP_RESET_CONFIRM",
 *     agent: "admin"
 *   });
 * } catch (error) {
 *   console.error("Reset blocked - confirmation required");
 * }
 */
export async function severeReset(db, { project, confirmation, agent = "system" } = {}) {
  // Safety check - MUST have explicit confirmation
  if (confirmation !== RESET_CONFIRMATION_CODE) {
    throw new Error(
      `SEVERE RESET BLOCKED\n\n` +
      `This operation will permanently delete ALL project data.\n\n` +
      `To proceed, you MUST provide the confirmation code:\n` +
      `  MCP_RESET_CONFIRM\n\n` +
      `Example:\n` +
      `  severeReset(db, { project: "my-project", confirmation: "MCP_RESET_CONFIRM" })`
    );
  }

  const results = {
    level: RESET_LEVELS.SEVERE,
    timestamp: new Date().toISOString(),
    agent,
    project: project || "ENTIRE_DATABASE",
    confirmation: "VERIFIED",
    deleted: {},
    warning: "This operation is IRREVERSIBLE"
  };

  const collections = [
    "logs",
    "contexts",
    "memory_versions",
    "actions",
    "sessions",
    "agents",
    "tasks",
    "messages",
    "issues",
    "project_map",
    "activity",
    "resource_locks",
    "metrics"
  ];

  for (const collectionName of collections) {
    const filter = project ? { project } : {};
    const result = await db.collection(collectionName).deleteMany(filter);
    results.deleted[collectionName] = result.deletedCount;
  }

  // Log the catastrophic event
  await logResetAction(db, {
    level: RESET_LEVELS.SEVERE,
    scope: "complete_wipe",
    agent,
    project: project || "all",
    summary: {
      ...results.deleted,
      WARNING: "Complete data wipe performed"
    }
  });

  return results;
}

/**
 * Main reset function that dispatches to appropriate level.
 *
 * @param {object} db - MongoDB database instance
 * @param {object} params - Reset parameters
 * @param {string} params.level - Reset level: "minor", "moderate", "major", or "severe"
 * @param {string} params.project - Project to reset (optional)
 * @param {string} params.agent - Agent performing reset
 * @param {string} params.confirmation - Required for severe resets
 * @param {string} params.scope - Specific scope to reset (optional)
 * @returns {Promise<object>} Summary of reset operation
 * @throws {Error} For invalid level or failed severe reset
 *
 * @example
 * // Minor cleanup
 * const result = await resetMCP(db, { level: "minor", project: "my-project" });
 *
 * @example
 * // Complete wipe (requires confirmation)
 * const result = await resetMCP(db, {
 *   level: "severe",
 *   project: "old-project",
 *   confirmation: "MCP_RESET_CONFIRM"
 * });
 */
export async function resetMCP(db, params) {
  const {
    level,
    project = null,
    agent = "system",
    confirmation = null,
    scope = null
  } = params;

  // Validate level
  const validLevels = Object.values(RESET_LEVELS);
  if (!validLevels.includes(level)) {
    throw new Error(
      `Invalid reset level: ${level}\n` +
      `Valid levels: ${validLevels.join(", ")}`
    );
  }

  // Validate project for severe resets
  if (level === RESET_LEVELS.SEVERE && !project) {
    throw new Error(
      "SEVERE reset requires a specific project target.\n" +
      "Cannot wipe entire database without explicit project."
    );
  }

  switch (level) {
    case RESET_LEVELS.MINOR:
      return minorReset(db, { project, agent });

    case RESET_LEVELS.MODERATE:
      return moderateReset(db, { project, agent });

    case RESET_LEVELS.MAJOR:
      return majorReset(db, { project, agent });

    case RESET_LEVELS.SEVERE:
      return severeReset(db, { project, confirmation, agent });

    default:
      throw new Error(`Unhandled reset level: ${level}`);
  }
}

/**
 * Estimates the impact of a reset operation.
 * Useful for preview before actual reset.
 *
 * @param {object} db - MongoDB database instance
 * @param {string} level - Reset level to estimate
 * @param {string} project - Project to estimate (optional)
 * @returns {Promise<object>} Estimated impact summary
 *
 * @example
 * const impact = await estimateResetImpact(db, "moderate", "my-project");
 * console.log(`Will delete approximately ${impact.estimatedCount} items`);
 */
export async function estimateResetImpact(db, level, project = null) {
  const filter = project ? { project } : {};

  const results = {
    level,
    project: project || "all",
    estimated: {}
  };

  switch (level) {
    case RESET_LEVELS.MINOR:
      results.estimated.logs = await db.collection("logs")
        .countDocuments({
          ...filter,
          createdAt: { $lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
        });
      results.estimated.tempContexts = await db.collection("contexts")
        .countDocuments({
          ...filter,
          importance: 1,
          accessCount: { $lte: 1 },
          createdAt: { $lt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) }
        });
      break;

    case RESET_LEVELS.MODERATE:
      results.estimated.logs = await db.collection("logs").countDocuments(filter);
      results.estimated.tasks = await db.collection("tasks")
        .countDocuments({ ...filter, status: { $in: ["completed", "failed"] } });
      results.estimated.contexts = await db.collection("contexts")
        .countDocuments({ ...filter, lifecycle: { $in: ["archived", "deprecated"] } });
      break;

    case RESET_LEVELS.MAJOR:
      results.estimated.tasks = await db.collection("tasks")
        .countDocuments({ ...filter, status: { $nin: ["pending", "in_progress", "blocked"] } });
      results.estimated.contexts = await db.collection("contexts")
        .countDocuments({ ...filter, type: { $ne: "project" } });
      results.estimated.activityLogs = await db.collection("activity").countDocuments(filter);
      break;

    case RESET_LEVELS.SEVERE:
      for (const coll of ["logs", "contexts", "tasks", "agents", "activity", "metrics"]) {
        results.estimated[coll] = await db.collection(coll).countDocuments(filter);
      }
      results.estimated.total = Object.values(results.estimated).reduce((a, b) => a + b, 0);
      break;
  }

  return results;
}
