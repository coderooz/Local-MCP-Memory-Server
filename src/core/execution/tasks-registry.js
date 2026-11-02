/**
 * Execution Sandbox — Approved Task Registry (Mode A)
 *
 * Versioned, explicitly approved task definitions. These are server-side
 * constants: a generated script or client request can never write to or
 * mutate this registry. Each definition declares its runtime allow-list,
 * permissions, resource limits, approval classification, and idempotency
 * behaviour.
 *
 * Phase 1 ships read-only tasks only. Write-capable tasks are added only
 * after the sandbox and workspace boundaries pass their security tests
 * (Phase 3).
 */

import { ExecutionError, EXECUTION_ERRORS } from './errors.js';

/** Read-only approved tasks (Level 0 — pre-approved). */
const TASKS = {
  'repo.inventory': {
    id: 'repo.inventory',
    version: 1,
    description: 'Produce a structured inventory of repository files and directories.',
    allowedRuntimes: ['python', 'node'],
    permissions: ['fs:read', 'artifact:write'],
    network: false,
    process: false,
    limits: { timeoutMs: 60000, memoryMb: 512, outputBytes: 65536 },
    requiresApproval: false, // Level 0 pre-approved
    idempotency: 'safe',
    artifacts: ['inventory.json'],
    enabled: true,
  },
  'repo.config-audit': {
    id: 'repo.config-audit',
    version: 1,
    description: 'Audit project configuration files for structural issues.',
    allowedRuntimes: ['python', 'node'],
    permissions: ['fs:read', 'artifact:write'],
    network: false,
    process: false,
    limits: { timeoutMs: 60000, memoryMb: 512, outputBytes: 65536 },
    requiresApproval: false,
    idempotency: 'safe',
    artifacts: ['audit.json'],
    enabled: true,
  },
  'repo.test-run': {
    id: 'repo.test-run',
    version: 1,
    description: 'Execute the permitted test suite inside the sandbox and summarize results.',
    allowedRuntimes: ['node'],
    permissions: ['fs:read', 'process:spawn', 'artifact:write'],
    network: false,
    process: true,
    limits: { timeoutMs: 300000, memoryMb: 1024, outputBytes: 262144 },
    requiresApproval: false,
    idempotency: 'safe',
    artifacts: ['test-results.json'],
    enabled: true,
  },
};

/** List approved task ids. */
export function listTasks() {
  return Object.keys(TASKS);
}

/**
 * Resolve an approved task definition. Throws UNKNOWN_TASK when the id is
 * not registered. Optionally require a specific version.
 */
export function resolveTask(taskId, version = null) {
  const task = TASKS[taskId];
  if (!task) {
    throw new ExecutionError(
      EXECUTION_ERRORS.UNKNOWN_TASK,
      `Approved task "${taskId}" is not registered`,
      { taskId, available: listTasks() }
    );
  }
  if (version !== null && task.version !== version) {
    throw new ExecutionError(
      EXECUTION_ERRORS.UNKNOWN_TASK,
      `Approved task "${taskId}" version ${version} is not registered (current: ${task.version})`,
      { taskId, requestedVersion: version, currentVersion: task.version }
    );
  }
  if (!task.enabled) {
    throw new ExecutionError(
      EXECUTION_ERRORS.POLICY_DENIED,
      `Approved task "${taskId}" is disabled`,
      { taskId }
    );
  }
  return { ...task };
}

/** True if the task id is registered and enabled. */
export function isTaskRegistered(taskId) {
  return Boolean(TASKS[taskId]?.enabled);
}
