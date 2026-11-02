/**
 * Execution Sandbox — Service Bridge
 *
 * Binds the execution service to the singleton database connection and
 * exposes a getResult() that enforces project-scoped, bounded, redacted
 * result retrieval.
 */

import { getDb } from '../../core/database/sqlite/index.js';
import { createExecutionService } from './index.js';
import { isFeatureEnabled } from '../../../core/config/project-config-loader.js';
import { ExecutionError, EXECUTION_ERRORS } from './errors.js';
import { normalizeResult } from './result-collector.js';

let serviceInstance = null;

/** Lazily build (and cache) the execution service against the live DB. */
export function getExecutionService() {
  if (serviceInstance) return serviceInstance;

  const db = getDb();
  const sandboxEnabled = isFeatureEnabled('executionSandbox');
  serviceInstance = createExecutionService(db, { sandboxEnabled });

  // Attach a project-scoped result reader.
  serviceInstance.getResult = async (context, jobId) => {
    const job = await serviceInstance.getJob(context, jobId);

    if (!job.terminal) {
      throw new ExecutionError(
        EXECUTION_ERRORS.RESULT_UNAVAILABLE,
        `Job is in state "${job.state}"; result is not yet available`,
        { jobId, state: job.state }
      );
    }

    if (job.state !== 'succeeded') {
      return {
        jobId,
        state: job.state,
        available: false,
        error: job.error || { code: EXECUTION_ERRORS.RESULT_UNAVAILABLE },
      };
    }

    // Re-normalize stored result through the redaction/bounding layer so a
    // tampered row cannot leak unbounded or unredacted content.
    const bounded = normalizeResult(
      {
        exitCode: job.result?.exitCode ?? 0,
        stdout: job.result?.stdout ?? '',
        stderr: job.result?.stderr ?? '',
        durationMs: job.result?.durationMs ?? null,
      },
      { outputBytes: job.effectivePolicy?.limits?.outputBytes || 65536 }
    );

    return {
      jobId,
      state: job.state,
      available: true,
      result: bounded,
      artifacts: job.artifacts,
      changedFiles: job.changedFiles,
    };
  };

  return serviceInstance;
}

/** Test-only: reset the cached service (so tests can inject a fresh DB). */
export function __resetExecutionService() {
  serviceInstance = null;
}
