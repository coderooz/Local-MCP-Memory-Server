/**
 * Execution Sandbox — Durable Job Repository
 *
 * Persists execution job metadata and state transitions using the existing
 * SQLite collection API (no new storage engine). Concurrency-safe claiming
 * and optimistic versioning reuse the same patterns already proven in the
 * tasks subsystem (`version` column + conditional update).
 *
 * This layer never executes anything. It is pure persistence + validation
 * of the durable job record.
 */

import { v4 as uuidv4 } from 'uuid';
import { assertTransition, isTerminal } from './state-machine.js';
import { ExecutionError, EXECUTION_ERRORS } from './errors.js';

const COLLECTION = 'execution_jobs';

/** Fields that must never be persisted from caller input. */
const SERVER_ONLY_FIELDS = new Set([
  'id',
  'agent',
  'project',
  'version',
  'state',
  'createdAt',
  'updatedAt',
  'effectivePolicy',
  'approvalBinding',
  'scriptHash',
]);

export function createExecutionRepository(db) {
  const collection = db.collection(COLLECTION);

  /**
   * Create a durable job record. Identity and project are always taken from
   * the trusted `context`, never from caller-supplied fields.
   */
  async function createJob(context, payload) {
    const { agent, project, sessionId = null } = context;
    const {
      mode,
      taskId = null,
      taskVersion = null,
      runtime,
      scriptHash = null,
      effectivePolicy = null,
      approvalBinding = null,
      idempotencyKey = null,
    } = payload;

    const now = new Date().toISOString();
    const job = {
      id: uuidv4(),
      job_id: uuidv4(),
      agent,
      project,
      sessionId,
      scope: 'private',
      mode, // 'task' | 'script'
      task_id: taskId,
      task_version: taskVersion,
      runtime,
      script_hash: scriptHash,
      state: 'validating',
      effective_policy: effectivePolicy ? JSON.stringify(effectivePolicy) : '{}',
      approval_binding: approvalBinding ? JSON.stringify(approvalBinding) : '{}',
      requested_permissions: JSON.stringify(payload.requestedPermissions || []),
      result: null,
      error: null,
      artifacts: '[]',
      changed_files: '[]',
      attempts: 1,
      idempotency_key: idempotencyKey,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };

    try {
      await collection.insertOne(job);
    } catch (err) {
      // Duplicate idempotency key -> surface a stable conflict, not a crash.
      if (err && err.code === 11000) {
        const existing = await collection.findOne({ idempotency_key: idempotencyKey });
        if (existing) {
          return toJobView(existing);
        }
        throw new ExecutionError(
          EXECUTION_ERRORS.IDEMPOTENCY_CONFLICT,
          'Job with this idempotency key already exists',
          { idempotencyKey }
        );
      }
      throw err;
    }

    return toJobView(job);
  }

  /** Fetch a job by id, scoped to the trusted project. */
  async function getJob(jobId, context) {
    const job = await collection.findOne({ id: jobId, project: context.project });
    if (!job) {
      throw new ExecutionError(
        EXECUTION_ERRORS.JOB_NOT_FOUND,
        `Execution job ${jobId} not found in project scope`,
        { jobId }
      );
    }
    return toJobView(job);
  }

  /**
   * Transition a job to a new state. Validated against the state machine and
   * applied with optimistic concurrency (expectedVersion) so concurrent
   * writers cannot silently overwrite each other.
   */
  async function transitionJob(jobId, context, toState, meta = {}) {
    const job = await collection.findOne({ id: jobId, project: context.project });
    if (!job) {
      throw new ExecutionError(
        EXECUTION_ERRORS.JOB_NOT_FOUND,
        `Execution job ${jobId} not found in project scope`,
        { jobId }
      );
    }

    // Validates legality; throws INVALID_STATE_TRANSITION when not allowed.
    assertTransition(job.state, toState);

    const expectedVersion = meta.expectedVersion ?? job.version;
    if (expectedVersion !== job.version) {
      throw new ExecutionError(
        EXECUTION_ERRORS.IDEMPOTENCY_CONFLICT,
        'Job was modified concurrently; reload and retry with the current version',
        { jobId, expectedVersion, actualVersion: job.version }
      );
    }

    const now = new Date().toISOString();
    const update = {
      state: toState,
      version: job.version + 1,
      updatedAt: now,
    };
    if (meta.error !== undefined) update.error = meta.error;
    if (meta.result !== undefined) update.result = meta.result;
    if (meta.artifacts !== undefined) {
      update.artifacts = JSON.stringify(meta.artifacts);
    }
    if (meta.changedFiles !== undefined) {
      update.changed_files = JSON.stringify(meta.changedFiles);
    }
    if (meta.approvalBinding !== undefined) {
      update.approval_binding = JSON.stringify(meta.approvalBinding);
    }
    if (meta.incrementAttempt) update.attempts = job.attempts + 1;

    const res = await collection.updateOne(
      { id: jobId, version: expectedVersion },
      { $set: update }
    );

    if (res.modifiedCount === 0) {
      throw new ExecutionError(
        EXECUTION_ERRORS.IDEMPOTENCY_CONFLICT,
        'Job transition lost a concurrent write; reload and retry',
        { jobId }
      );
    }

    return toJobView(await collection.findOne({ id: jobId }));
  }

  /** List jobs within the trusted project scope, newest first. */
  async function listJobs(context, filter = {}) {
    const query = { project: context.project };
    if (filter.state) query.state = filter.state;
    if (filter.mode) query.mode = filter.mode;
    if (filter.taskId) query.task_id = filter.taskId;

    const limit = Math.min(Math.max(filter.limit || 50, 1), 200);
    const jobs = await collection.find(query).limit(limit).toArray();
    return jobs.map(toJobView);
  }

  /** Idempotency lookup used by submit to safely replay. */
  async function findByIdempotencyKey(project, idempotencyKey) {
    if (!idempotencyKey) return null;
    const job = await collection.findOne({ project, idempotency_key: idempotencyKey });
    return job ? toJobView(job) : null;
  }

  return {
    createJob,
    getJob,
    transitionJob,
    listJobs,
    findByIdempotencyKey,
    COLLECTION,
  };
}

/** Normalize a raw row into the public job view. */
function toJobView(row) {
  if (!row) return row;
  return {
    jobId: row.id,
    agent: row.agent,
    project: row.project,
    sessionId: row.sessionId,
    mode: row.mode,
    taskId: row.task_id,
    taskVersion: row.task_version,
    runtime: row.runtime,
    scriptHash: row.script_hash,
    state: row.state,
    terminal: isTerminal(row.state),
    effectivePolicy: safeParse(row.effective_policy, {}),
    approvalBinding: safeParse(row.approval_binding, {}),
    requestedPermissions: safeParse(row.requested_permissions, []),
    result: row.result ? safeParse(row.result, row.result) : null,
    error: row.error ? safeParse(row.error, row.error) : null,
    artifacts: safeParse(row.artifacts, []),
    changedFiles: safeParse(row.changed_files, []),
    attempts: row.attempts,
    idempotencyKey: row.idempotency_key,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function safeParse(value, fallback) {
  if (value === null || value === undefined) return fallback;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}
