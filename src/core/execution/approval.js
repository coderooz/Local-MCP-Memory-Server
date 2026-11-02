/**
 * Execution Sandbox — Approval Service
 *
 * Creates and validates approvals bound to the EXACT action being approved:
 * (scriptHash, project, runtime, permissionSet). Approvals expire, cannot be
 * replayed, and are invalidated when any bound content or policy changes.
 *
 * Security invariant (directive §7.3): an approval is only valid when granted
 * by a principal DIFFERENT from the requesting agent. This module enforces
 * that separation; the requesting agent can never approve its own job.
 */

import { v4 as uuidv4 } from 'uuid';
import { ExecutionError, EXECUTION_ERRORS } from './errors.js';

const COLLECTION = 'execution_approvals';

/** Default approval lifetime. */
const DEFAULT_TTL_MS = 30 * 60 * 1000; // 30 minutes

export function createApprovalService(db) {
  const collection = db.collection(COLLECTION);

  /**
   * Compute the canonical binding string for an approval. Any change to the
   * script, project, runtime, or permission set produces a different hash,
   * which invalidates prior approvals.
   */
  function bindingFor({ scriptHash, project, runtime, permissions }) {
    const canonical = JSON.stringify({
      scriptHash: scriptHash || null,
      project,
      runtime,
      permissions: [...(permissions || [])].sort(),
    });
    return canonical;
  }

  /**
   * Record an approval grant. `approver` must be a trusted human/authorized
   * principal and MUST differ from `requestingAgent`.
   */
  async function grantApproval(context, params) {
    const { scriptHash, project, runtime, permissions, requestingAgent, approver, ttlMs } = params;

    if (!approver) {
      throw new ExecutionError(
        EXECUTION_ERRORS.APPROVAL_REQUIRED,
        'An approval must record an approving principal',
        {}
      );
    }

    // A job may never be approved by the agent that requested it.
    if (approver === requestingAgent) {
      throw new ExecutionError(
        EXECUTION_ERRORS.POLICY_DENIED,
        'Self-approval is forbidden: the approving principal must differ from the requesting agent',
        { requestingAgent }
      );
    }

    if (context.project !== project) {
      throw new ExecutionError(
        EXECUTION_ERRORS.PROJECT_SCOPE_DENIED,
        'Approval project does not match the trusted project scope',
        {}
      );
    }

    const now = Date.now();
    const ttl = Number.isFinite(ttlMs) ? ttlMs : DEFAULT_TTL_MS;
    const binding = bindingFor({ scriptHash, project, runtime, permissions });

    const record = {
      id: uuidv4(),
      approval_id: uuidv4(),
      agent: context.agent,
      project,
      sessionId: context.sessionId || null,
      scope: 'private',
      binding,
      script_hash: scriptHash || null,
      runtime,
      permissions: JSON.stringify([...(permissions || [])].sort()),
      requesting_agent: requestingAgent,
      approver,
      granted_at: new Date(now).toISOString(),
      expires_at: new Date(now + ttl).toISOString(),
      used: 0,
      revoked: 0,
      version: 1,
      createdAt: new Date(now).toISOString(),
      updatedAt: new Date(now).toISOString(),
    };

    await collection.insertOne(record);
    return {
      approvalId: record.approval_id,
      binding,
      grantedAt: record.granted_at,
      expiresAt: record.expires_at,
      approver,
    };
  }

  /**
   * Validate an approval for a specific action. Throws APPROVAL_REQUIRED /
   * APPROVAL_EXPIRED / APPROVAL_REVOKED / POLICY_DENIED as appropriate.
   * Consumes the approval (replay prevention) on success.
   */
  async function consumeApproval(context, params) {
    const { approvalId, scriptHash, project, runtime, permissions, requestingAgent } = params;

    if (!approvalId) {
      throw new ExecutionError(
        EXECUTION_ERRORS.APPROVAL_REQUIRED,
        'This action requires an approval_id',
        {}
      );
    }

    const approval = await collection.findOne({ approval_id: approvalId, project });
    if (!approval) {
      throw new ExecutionError(EXECUTION_ERRORS.APPROVAL_REQUIRED, 'Approval not found', {
        approvalId,
      });
    }

    if (approval.revoked) {
      throw new ExecutionError(EXECUTION_ERRORS.APPROVAL_REVOKED, 'Approval has been revoked', {
        approvalId,
      });
    }

    if (approval.used > 0) {
      throw new ExecutionError(
        EXECUTION_ERRORS.APPROVAL_EXPIRED,
        'Approval has already been consumed and cannot be replayed',
        { approvalId }
      );
    }

    if (Date.now() > Date.parse(approval.expires_at)) {
      throw new ExecutionError(EXECUTION_ERRORS.APPROVAL_EXPIRED, 'Approval has expired', {
        approvalId,
        expiresAt: approval.expires_at,
      });
    }

    // Binding must match the exact action being approved.
    const expected = bindingFor({ scriptHash, project, runtime, permissions });
    if (approval.binding !== expected) {
      throw new ExecutionError(
        EXECUTION_ERRORS.POLICY_DENIED,
        'Approval does not match the current script/policy; content changed since approval',
        { approvalId }
      );
    }

    // Self-approval guard also applies at consumption time.
    if (approval.approver === requestingAgent) {
      throw new ExecutionError(EXECUTION_ERRORS.POLICY_DENIED, 'Self-approval is forbidden', {
        approvalId,
      });
    }

    // Mark consumed (replay prevention) with optimistic concurrency.
    const res = await collection.updateOne(
      { approval_id: approvalId, used: 0, revoked: 0 },
      {
        $set: {
          used: 1,
          updatedAt: new Date().toISOString(),
        },
        $inc: { version: 1 },
      }
    );
    if (res.modifiedCount === 0) {
      throw new ExecutionError(
        EXECUTION_ERRORS.APPROVAL_EXPIRED,
        'Approval was consumed concurrently',
        { approvalId }
      );
    }

    return {
      approvalId,
      approver: approval.approver,
      binding: approval.binding,
    };
  }

  /** Revoke an approval. */
  async function revokeApproval(context, approvalId) {
    const res = await collection.updateOne(
      { approval_id: approvalId, project: context.project },
      { $set: { revoked: 1, updatedAt: new Date().toISOString() } }
    );
    return res.modifiedCount > 0;
  }

  return { grantApproval, consumeApproval, revokeApproval, bindingFor };
}
