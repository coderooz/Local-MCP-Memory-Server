/**
 * Execution Sandbox — Execution Service
 *
 * Orchestrates job submission: resolves trusted identity/project, evaluates
 * policy, decides approval, allocates durable job state, and transitions it
 * through the lifecycle.
 *
 * CRITICAL (directive §2.4): this service NEVER executes script content
 * inside the MCP process. In Phase 1 all real execution is refused (fail-
 * closed) because no isolation backend is live. The service still produces a
 * fully durable, auditable job record so the lifecycle, policy, approval and
 * persistence layers are real and testable before any code runs.
 */

import { createHash } from 'node:crypto';
import { createExecutionRepository } from './repository.js';
import { createApprovalService } from './approval.js';
import { createWorkspaceManager } from './workspace.js';
import { computeEffectivePolicy } from './policy.js';
import { resolveRuntime } from './runtime-registry.js';
import { resolveTask } from './tasks-registry.js';
import { getBackend } from './sandbox-adapter.js';
import { normalizeResult } from './result-collector.js';
import { createAuditService, EXECUTION_EVENTS } from './audit.js';
import { ExecutionError, EXECUTION_ERRORS } from './errors.js';

/** Stable SHA-256 of script source; the approval binding anchor. */
export function hashScript(source) {
  return createHash('sha256').update(source, 'utf8').digest('hex');
}

export function createExecutionService(db, { sandboxEnabled = false } = {}) {
  const repository = createExecutionRepository(db);
  const approvals = createApprovalService(db);
  const workspaces = createWorkspaceManager();

  /**
   * Submit a job. `context` carries the TRUSTED agent/project (server-
   * injected); caller-supplied identity fields are ignored by design.
   */
  async function submitJob(context, request) {
    const audit = createAuditService(db, context);
    if (!context?.agent) {
      throw new ExecutionError(
        EXECUTION_ERRORS.IDENTITY_REQUIRED,
        'Agent identity could not be resolved from trusted config',
        {}
      );
    }
    if (!context?.project) {
      throw new ExecutionError(
        EXECUTION_ERRORS.PROJECT_SCOPE_DENIED,
        'Project scope could not be resolved from trusted config',
        {}
      );
    }

    const mode = request.mode === 'script' ? 'script' : 'task';

    // Idempotent replay: a repeat with the same key returns the same job.
    if (request.idempotencyKey) {
      const existing = await repository.findByIdempotencyKey(
        context.project,
        request.idempotencyKey
      );
      if (existing) return { replayed: true, job: existing };
    }

    let task = null;
    let scriptHash = null;

    if (mode === 'task') {
      task = resolveTask(request.taskId, request.taskVersion ?? null);
    } else {
      if (typeof request.source !== 'string' || request.source.length === 0) {
        throw new ExecutionError(
          EXECUTION_ERRORS.INVALID_REQUEST,
          'Script mode requires a non-empty source string',
          {}
        );
      }
      scriptHash = hashScript(request.source);
    }

    // Resolve trusted runtime (never a client-supplied path/image).
    resolveRuntime(request.runtime);

    const effectivePolicy = computeEffectivePolicy({
      agent: context.agent,
      project: context.project,
      runtime: request.runtime,
      task,
      requested: {
        permissions: request.permissions,
        limits: request.limits,
      },
      sandboxEnabled,
    });

    const job = await repository.createJob(context, {
      mode,
      taskId: task ? task.id : null,
      taskVersion: task ? task.version : null,
      runtime: request.runtime,
      scriptHash,
      effectivePolicy,
      requestedPermissions: effectivePolicy.permissions,
      idempotencyKey: request.idempotencyKey || null,
    });

    // Route into the lifecycle: pre-approved tasks move to queued; everything
    // else that needs a grant parks in awaiting_approval.
    if (effectivePolicy.requiresApproval) {
      const withBinding = await repository.transitionJob(job.jobId, context, 'awaiting_approval');
      await audit.record(EXECUTION_EVENTS.APPROVAL_REQUIRED, {
        jobId: job.jobId,
        mode,
        runtime: request.runtime,
        taskId: task ? task.id : null,
        scriptHash,
        permissions: effectivePolicy.permissions,
        reason: 'policy_requires_approval',
      });
      return {
        replayed: false,
        job: withBinding,
        approvalRequired: true,
        approvalBinding: approvals.bindingFor({
          scriptHash,
          project: context.project,
          runtime: request.runtime,
          permissions: effectivePolicy.permissions,
        }),
      };
    }

    const queued = await repository.transitionJob(job.jobId, context, 'queued');
    await audit.record(EXECUTION_EVENTS.JOB_SUBMITTED, {
      jobId: job.jobId,
      mode,
      runtime: request.runtime,
      taskId: task ? task.id : null,
      scriptHash,
      permissions: effectivePolicy.permissions,
      nextState: 'queued',
    });
    return { replayed: false, job: queued, approvalRequired: false };
  }

  /**
   * Approve a job. The approver must be a trusted principal and must differ
   * from the requesting agent (enforced inside the approval service).
   */
  async function approveJob(context, { jobId, approver, ttlMs }) {
    const audit = createAuditService(db, context);
    const job = await repository.getJob(jobId, context);
    if (job.state !== 'awaiting_approval') {
      throw new ExecutionError(
        EXECUTION_ERRORS.INVALID_STATE_TRANSITION,
        `Job is in state "${job.state}"; only awaiting_approval jobs can be approved`,
        { jobId, state: job.state }
      );
    }

    const grant = await approvals.grantApproval(context, {
      scriptHash: job.scriptHash,
      project: context.project,
      runtime: job.runtime,
      permissions: job.effectivePolicy.permissions,
      requestingAgent: job.agent,
      approver,
      ttlMs,
    });

    const queued = await repository.transitionJob(jobId, context, 'queued', {
      approvalBinding: grant,
    });

    await audit.record(EXECUTION_EVENTS.APPROVAL_GRANTED, {
      jobId,
      approver,
      requestingAgent: job.agent,
      scriptHash: job.scriptHash,
      runtime: job.runtime,
      permissions: job.effectivePolicy.permissions,
      nextState: 'queued',
    });

    return { job: queued, approval: grant };
  }

  /** Read a job (project-scoped). */
  async function getJob(context, jobId) {
    return repository.getJob(jobId, context);
  }

  /** List jobs (project-scoped). */
  async function listJobs(context, filter) {
    return repository.listJobs(context, filter);
  }

  /**
   * Request cancellation. Idempotent: cancelling a cancelling/terminal job
   * is a no-op returning the current state.
   */
  async function cancelJob(context, jobId) {
    const audit = createAuditService(db, context);
    const job = await repository.getJob(jobId, context);
    if (job.terminal || job.state === 'cancelling') {
      return { job, alreadyCancelling: true };
    }
    const cancelling = await repository.transitionJob(jobId, context, 'cancelling');
    await audit.record(EXECUTION_EVENTS.JOB_CANCELLED, {
      jobId,
      previousState: job.state,
      nextState: 'cancelling',
      reason: 'cancel_requested_by_caller',
    });
    return { job: cancelling, alreadyCancelling: false };
  }

  /**
   * Execute a job. Phase 1 ALWAYS refuses: no isolation backend is live and
   * the service must never run code in-process. The job is failed with a
   * deterministic, auditable error.
   */
  async function executeJob(context, jobId) {
    const audit = createAuditService(db, context);
    const job = await repository.getJob(jobId, context);

    // Even queued jobs cannot run: the backend is not implemented.
    const backend = getBackend('docker');
    const available = await backend.isAvailable();

    const reason = available
      ? 'Sandbox backend execution is not implemented (Phase 2)'
      : 'Sandbox isolation backend (Docker) is unavailable; execution refused (fail-closed)';

    const failed = await repository.transitionJob(jobId, context, 'failed', {
      error: { code: EXECUTION_ERRORS.SANDBOX_START_FAILED, message: reason },
    });

    await audit.record(EXECUTION_EVENTS.EXECUTION_REFUSED, {
      jobId,
      previousState: job.state,
      nextState: 'failed',
      backendAvailable: available,
      errorCode: EXECUTION_ERRORS.SANDBOX_START_FAILED,
      reason,
    });
    await audit.recordMetricSafe('execution.refused', {
      jobId,
      backendAvailable: available,
      errorCode: EXECUTION_ERRORS.SANDBOX_START_FAILED,
    });

    return { job: failed, executed: false, reason };
  }

  return {
    submitJob,
    approveJob,
    getJob,
    listJobs,
    cancelJob,
    executeJob,
    approvals,
    repository,
    workspaces,
    normalizeResult,
  };
}
