/**
 * Execution Sandbox — Policy Engine
 *
 * Deterministically computes the EFFECTIVE permission set for a job from
 * trusted inputs (server-injected identity/project, runtime registry, task
 * definition) plus the caller's REQUESTED permissions.
 *
 * Invariant (directive §9): requested permissions may only NARROW the
 * effective set. They can never grant authority the trusted inputs do not
 * already carry. This module is pure and side-effect free.
 */

import { ExecutionError, EXECUTION_ERRORS } from './errors.js';

/** Canonical permission vocabulary the policy engine reasons about. */
export const PERMISSIONS = ['fs:read', 'fs:write', 'net:access', 'process:spawn', 'artifact:write'];

/** Hard ceiling per runtime. Nothing may exceed these regardless of request. */
const RUNTIME_CEILING = {
  python: ['fs:read', 'fs:write', 'artifact:write'],
  node: ['fs:read', 'fs:write', 'artifact:write'],
};

/** Structural error codes raised by the policy engine. */
export { EXECUTION_ERRORS };

function dedupe(list) {
  return Array.from(new Set(list));
}

function intersect(a, b) {
  const setB = new Set(b);
  return a.filter((x) => setB.has(x));
}

/**
 * Resolve the trusted runtime ceiling for a runtime identifier.
 * Throws UNKNOWN_RUNTIME for anything not in the allow-list. Callers must
 * pass a runtime id, never an executable path or image reference.
 */
export function resolveRuntimeCeiling(runtime) {
  const ceiling = RUNTIME_CEILING[runtime];
  if (!ceiling) {
    throw new ExecutionError(
      EXECUTION_ERRORS.UNKNOWN_RUNTIME,
      `Runtime "${runtime}" is not in the trusted allow-list`,
      { runtime, allowed: Object.keys(RUNTIME_CEILING) }
    );
  }
  return [...ceiling];
}

/** Register an additional trusted runtime ceiling (Phase 2 wiring). */
export function registerRuntimeCeiling(runtime, permissions) {
  RUNTIME_CEILING[runtime] = dedupe(permissions);
}

/**
 * Compute the effective policy for a job.
 *
 * Inputs are all TRUSTED except `requested.permissions`, which may only
 * narrow. The result is deterministic: same inputs -> same policy.
 *
 * @param {object} input
 * @param {string} input.agent       Server-injected agent identity.
 * @param {string} input.project     Server-injected project scope.
 * @param {string} input.runtime     Runtime identifier (allow-listed).
 * @param {object} input.task        Task definition (optional).
 * @param {object} input.requested   Caller-requested permissions/limits.
 * @param {boolean} input.sandboxEnabled  Feature-flag state.
 * @returns {object} effective policy
 */
export function computeEffectivePolicy(input) {
  const { agent, project, runtime, task = null, requested = {}, sandboxEnabled = false } = input;

  if (!sandboxEnabled) {
    throw new ExecutionError(
      EXECUTION_ERRORS.SANDBOX_DISABLED,
      'Execution sandbox is disabled. Enable it in project config: features.executionSandbox = true',
      {}
    );
  }

  if (!agent) {
    throw new ExecutionError(
      EXECUTION_ERRORS.IDENTITY_REQUIRED,
      'Agent identity could not be resolved from trusted config',
      {}
    );
  }

  if (!project) {
    throw new ExecutionError(
      EXECUTION_ERRORS.PROJECT_SCOPE_DENIED,
      'Project scope could not be resolved from trusted config',
      {}
    );
  }

  const ceiling = resolveRuntimeCeiling(runtime);

  // Start from the runtime ceiling, intersect with the task's allowed
  // runtimes/permissions if a task is present.
  let base = [...ceiling];
  if (task) {
    if (Array.isArray(task.allowedRuntimes) && !task.allowedRuntimes.includes(runtime)) {
      throw new ExecutionError(
        EXECUTION_ERRORS.POLICY_DENIED,
        `Task "${task.id}" does not permit runtime "${runtime}"`,
        { taskId: task.id, runtime, allowedRuntimes: task.allowedRuntimes }
      );
    }
    if (Array.isArray(task.permissions)) {
      base = intersect(base, task.permissions);
    }
  }

  // Requested permissions may only narrow.
  const requestedPerms = Array.isArray(requested.permissions) ? requested.permissions : [];
  const effectivePermissions = intersect(base, requestedPerms.length ? requestedPerms : base);

  // Network and process are deny-by-default and are NEVER granted by the
  // runtime ceiling; they require an explicit task-level grant in a later
  // phase and remain off in Phase 1.
  const network = effectivePermissions.includes('net:access');
  const processSpawn = effectivePermissions.includes('process:spawn');

  // Resource limits: clamp requested values into safe maxima.
  const limits = normalizeLimits(requested.limits || {});

  return {
    agent,
    project,
    runtime,
    taskId: task ? task.id : null,
    taskVersion: task ? task.version : null,
    permissions: effectivePermissions,
    network,
    process: processSpawn,
    workspace: {
      isolation: 'per-job',
      readOnly: !effectivePermissions.includes('fs:write'),
    },
    limits,
    requiresApproval: task ? Boolean(task.requiresApproval) : true,
  };
}

/** Clamp requested resource limits into hard safe bounds. */
export function normalizeLimits(requested = {}) {
  const MAX_TIMEOUT_MS = 15 * 60 * 1000; // 15 min
  const MAX_MEMORY_MB = 2048;
  const MAX_CPUS = 4;
  const MAX_OUTPUT_BYTES = 1024 * 1024; // 1 MiB
  const MAX_PIDS = 64;

  const clampInt = (value, min, max, fallback) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, Math.floor(n)));
  };

  return {
    timeoutMs: clampInt(requested.timeoutMs, 1000, MAX_TIMEOUT_MS, 60000),
    memoryMb: clampInt(requested.memoryMb, 64, MAX_MEMORY_MB, 512),
    cpus: clampInt(requested.cpus, 1, MAX_CPUS, 1),
    outputBytes: clampInt(requested.outputBytes, 1024, MAX_OUTPUT_BYTES, 65536),
    pidsLimit: clampInt(requested.pidsLimit, 1, MAX_PIDS, 16),
  };
}
