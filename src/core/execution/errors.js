/**
 * Execution Sandbox — Error Codes
 *
 * Stable, structured error identifiers for the execution subsystem.
 * These surface through MCP tool responses and /execution/* routes so
 * clients get deterministic, non-leaky failures (no secrets, no stack
 * traces, no host paths in ordinary responses).
 */

export const EXECUTION_ERRORS = {
  IDENTITY_REQUIRED: 'IDENTITY_REQUIRED',
  PROJECT_SCOPE_DENIED: 'PROJECT_SCOPE_DENIED',
  POLICY_DENIED: 'POLICY_DENIED',
  APPROVAL_REQUIRED: 'APPROVAL_REQUIRED',
  APPROVAL_EXPIRED: 'APPROVAL_EXPIRED',
  APPROVAL_REVOKED: 'APPROVAL_REVOKED',
  WORKSPACE_CONFLICT: 'WORKSPACE_CONFLICT',
  RESOURCE_LIMIT_EXCEEDED: 'RESOURCE_LIMIT_EXCEEDED',
  SANDBOX_START_FAILED: 'SANDBOX_START_FAILED',
  EXECUTION_TIMEOUT: 'EXECUTION_TIMEOUT',
  OUTPUT_LIMIT_EXCEEDED: 'OUTPUT_LIMIT_EXCEEDED',
  RESULT_UNAVAILABLE: 'RESULT_UNAVAILABLE',
  // Phase 1 structural errors (contract / lifecycle integrity)
  SANDBOX_DISABLED: 'SANDBOX_DISABLED',
  INVALID_REQUEST: 'INVALID_REQUEST',
  UNKNOWN_RUNTIME: 'UNKNOWN_RUNTIME',
  UNKNOWN_TASK: 'UNKNOWN_TASK',
  INVALID_STATE_TRANSITION: 'INVALID_STATE_TRANSITION',
  JOB_NOT_FOUND: 'JOB_NOT_FOUND',
  IDEMPOTENCY_CONFLICT: 'IDEMPOTENCY_CONFLICT',
};

/**
 * Structured execution error. Carries a stable code plus a safe, bounded
 * message. `details` must never contain secrets, env dumps, or raw host
 * paths — callers are responsible for redacting before populating.
 */
export class ExecutionError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'ExecutionError';
    this.code = code;
    this.details = details;
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        details: this.details,
      },
    };
  }
}

export function isExecutionError(err) {
  return err instanceof ExecutionError;
}
