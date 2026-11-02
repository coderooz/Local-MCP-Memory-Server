/**
 * Execution Sandbox — Audit Service
 *
 * Directive §4.1: the audit service produces "structured, traceable execution
 * events" and "must use the existing logging and activity conventions where
 * practical, with execution-specific records for details that do not fit
 * existing models."
 *
 * This is a NARROW ADAPTER over the existing activity/metrics services
 * (`src/domains/activity/activity.service.js`,
 * `src/domains/metrics/metrics.service.js`). It does NOT introduce a competing
 * logging system. Every event is written to the existing `activity` table with
 * `type: 'execution'` and a redacted, structured `metadata` payload. Aggregate
 * counters reuse the existing `metrics` table.
 *
 * Invariants:
 * - Sensitive values (source, secrets, env, absolute host paths, stacks) are
 *   REDACTED before persistence; only bounded, structured facts are stored.
 * - A generated script can never write its own audit record: the audit service
 *   is constructed by the server from the trusted `db` and trusted context, and
 *   is not exposed to script content.
 * - Audit writes are best-effort and NEVER throw into the caller (a failed
 *   audit write is surfaced as `auditError` on the returned receipt, not as an
 *   exception), so an audit-storage hiccup cannot mask a policy/lifecycle
 *   decision — but it is still visible for operators.
 */

import { recordActivity } from '../../domains/activity/activity.service.js';
import { recordMetric } from '../../domains/metrics/metrics.service.js';

/** Stable execution event vocabulary (keeps activity rows queryable). */
export const EXECUTION_EVENTS = Object.freeze({
  JOB_SUBMITTED: 'execution.job_submitted',
  APPROVAL_REQUIRED: 'execution.approval_required',
  APPROVAL_GRANTED: 'execution.approval_granted',
  STATE_TRANSITION: 'execution.state_transition',
  EXECUTION_REFUSED: 'execution.refused',
  JOB_CANCELLED: 'execution.cancelled',
  POLICY_DENIED: 'execution.policy_denied',
});

/** Metadata keys whose values must never be persisted verbatim. */
const SENSITIVE_KEYS = new Set([
  'source',
  'script',
  'code',
  'stdout',
  'stderr',
  'env',
  'environment',
  'secrets',
  'token',
  'password',
  'stack',
  'stackTrace',
  'hostPath',
  'absolutePath',
  'homeDir',
]);

/** Maximum characters stored for any free-form string metadata value. */
const MAX_STRING_LEN = 512;

/**
 * Recursively redact sensitive keys and bound string lengths so an audit row
 * stays small, structured, and free of secrets or raw script content.
 */
export function redactAuditMetadata(value, depth = 0) {
  if (depth > 4) return '[truncated:depth]';
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    return value.length > MAX_STRING_LEN
      ? `${value.slice(0, MAX_STRING_LEN)}…[truncated:${value.length}]`
      : value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) {
    return value.slice(0, 25).map((item) => redactAuditMetadata(item, depth + 1));
  }
  if (typeof value === 'object') {
    const out = {};
    for (const [key, val] of Object.entries(value)) {
      if (SENSITIVE_KEYS.has(key)) {
        out[key] = '[redacted]';
      } else {
        out[key] = redactAuditMetadata(val, depth + 1);
      }
    }
    return out;
  }
  return String(value);
}

/**
 * Create an audit recorder bound to a trusted context (server-injected agent /
 * project). Returns `{ record, recordMetricSafe }`.
 */
export function createAuditService(db, context = {}) {
  const agent = context.agent || 'system';
  const project = context.project || 'default';

  /**
   * Record one execution event into the existing activity stream.
   * Returns a receipt `{ ok, activityId?, auditError? }`.
   */
  async function record(event, details = {}) {
    const { jobId = null, ...rest } = details;
    const message = `[execution] ${event}${jobId ? ` job=${jobId}` : ''}`;

    try {
      const { activity } = await recordActivity(db, {
        agent,
        project,
        type: 'execution',
        message,
        related_task: jobId,
        resource: jobId ? `execution:${jobId}` : 'execution',
        metadata: redactAuditMetadata({
          event,
          jobId,
          ...rest,
        }),
      });
      return { ok: true, activityId: activity?.activity_id ?? null, auditError: null };
    } catch (err) {
      return {
        ok: false,
        activityId: null,
        auditError: { code: 'AUDIT_WRITE_FAILED', message: err?.message || 'audit write failed' },
      };
    }
  }

  /**
   * Best-effort aggregate metric (success/failure counters). Mirrors the
   * existing metric conventions; never throws.
   */
  async function recordMetricSafe(metricType, data = {}) {
    try {
      await recordMetric(db, {
        agent,
        project,
        metric_type: metricType,
        name: metricType,
        data: redactAuditMetadata(data),
      });
      return { ok: true, auditError: null };
    } catch (err) {
      return {
        ok: false,
        auditError: { code: 'AUDIT_WRITE_FAILED', message: err?.message || 'metric write failed' },
      };
    }
  }

  return { record, recordMetricSafe, agent, project };
}
