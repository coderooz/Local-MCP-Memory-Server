/**
 * Execution Sandbox — Workspace Manager
 *
 * Allocates per-job isolated workspaces, validates containment, and produces
 * changed-file manifests. Phase 1 implements the interface and the path
 * containment logic that Phase 3 (controlled writes) depends on — with
 * hardened validation that does not rely solely on string-prefix checks.
 *
 * No workspace is ever created against the original project working tree as
 * a writable mount (directive §7.1). In Phase 1, allocation is refused
 * because no isolation backend is live; callers get a deterministic failure
 * rather than a host-privileged fallback.
 */

import path from 'node:path';
import { ExecutionError, EXECUTION_ERRORS } from './errors.js';

/** Base directory under which all job workspaces would be created. */
const WORKSPACE_ROOT = process.env.MCP_SANDBOX_WORKSPACE_ROOT || null;

/**
 * Resolve and validate that a candidate path is contained within a root.
 * Uses path.resolve + realpath-style normalization and rejects traversal,
 * absolute escapes, and separator tricks. This is defence-in-depth; the
 * container mount is the primary boundary.
 *
 * @param {string} root       Authorized root directory.
 * @param {string} candidate  Path to validate.
 * @returns {string} normalized contained path
 */
export function assertContained(root, candidate) {
  if (typeof root !== 'string' || !root) {
    throw new ExecutionError(
      EXECUTION_ERRORS.WORKSPACE_CONFLICT,
      'No authorized workspace root configured',
      {}
    );
  }
  if (typeof candidate !== 'string' || !candidate) {
    throw new ExecutionError(EXECUTION_ERRORS.WORKSPACE_CONFLICT, 'Candidate path is required', {});
  }

  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, candidate);

  // Containment check on the resolved (normalized) path. Compare using
  // path.relative: a non-empty result starting with '..' or an absolute
  // path indicates escape.
  const rel = path.relative(resolvedRoot, resolved);
  const escapes = rel.startsWith('..') || path.isAbsolute(rel);

  if (escapes) {
    throw new ExecutionError(
      EXECUTION_ERRORS.WORKSPACE_CONFLICT,
      'Path escapes the authorized workspace root',
      { relative: rel }
    );
  }

  return resolved;
}

/**
 * Build the changed-file manifest schema. Phase 3 fills this from a real
 * diff; Phase 1 validates shape so the contract is stable.
 */
export function normalizeChangedFiles(files) {
  if (!Array.isArray(files)) return [];
  return files.map((f) => ({
    path: typeof f.path === 'string' ? f.path : '',
    changeType: ['added', 'modified', 'deleted'].includes(f.changeType) ? f.changeType : 'modified',
    contentHash: typeof f.contentHash === 'string' ? f.contentHash : null,
  }));
}

export function createWorkspaceManager() {
  /**
   * Allocate an isolated workspace for a job. Refused in Phase 1 because no
   * isolation backend is live — this is deliberate (fail-closed).
   */
  async function allocate() {
    throw new ExecutionError(
      EXECUTION_ERRORS.SANDBOX_START_FAILED,
      'Workspace allocation requires a live isolation backend (Phase 2)',
      {}
    );
  }

  /** Validate that a set of changed paths stays inside a workspace. */
  function validateContainment(root, changedPaths) {
    const violations = [];
    const normalized = [];
    for (const p of changedPaths || []) {
      try {
        normalized.push(assertContained(root, p));
      } catch (err) {
        violations.push({ path: p, reason: err.message });
      }
    }
    return { ok: violations.length === 0, normalized, violations };
  }

  /** Release/quarantine a workspace. No-op in Phase 1. */
  async function release() {
    // Nothing is allocated in Phase 1.
  }

  return { allocate, release, validateContainment, WORKSPACE_ROOT };
}
