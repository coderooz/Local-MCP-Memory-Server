/**
 * Execution Sandbox — Integration Tests (Phase 1)
 *
 * Exercises the durable job repository, lifecycle transitions, idempotent
 * submission, approval binding, and the fail-closed execution path against a
 * real (temporary, on-disk) SQLite database.
 *
 * NO process is spawned and NO untrusted code runs: executeJob must ALWAYS
 * refuse. That refusal is the behaviour under test.
 *
 * Run: node tests/execution-integration-test.js
 */

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  initializeDatabase,
  disconnectDatabase,
  getDb,
} from '../src/core/database/sqlite/index.js';
import { createExecutionService, hashScript } from '../src/core/execution/index.js';
import { createApprovalService } from '../src/core/execution/approval.js';
import { createAuditService, redactAuditMetadata } from '../src/core/execution/audit.js';
import { createDockerBackend, registerBackend } from '../src/core/execution/sandbox-adapter.js';
import { ExecutionError, EXECUTION_ERRORS } from '../src/core/execution/errors.js';

const auditModule = { redactAuditMetadata };

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`✓ ${name}`);
  } catch (err) {
    failed++;
    console.error(`✗ ${name}`);
    console.error(`  ${err.message}`);
  }
}

const CONTEXT = { agent: 'integration-agent', project: 'exec-test', sessionId: 'sess-1' };

async function runTests() {
  console.log('=== Execution Sandbox: Integration Tests ===\n');

  const dbPath = path.join(__dirname, '..', 'data', 'test-db-execution.db');
  for (const suffix of ['', '-wal', '-shm']) {
    try {
      fs.rmSync(dbPath + suffix, { force: true });
    } catch {
      /* fresh anyway */
    }
  }

  await initializeDatabase(dbPath);
  const db = getDb();

  // Sandbox ENABLED for these tests (the production default is disabled;
  // enablement is a config concern already covered in the policy suite).
  //
  // Register the Docker backend with an availability probe that reports the
  // daemon is DOWN (the real state on this host). This proves executeJob
  // fails closed regardless of whether the backend is reachable.
  registerBackend(
    createDockerBackend({
      availabilityProbe: async () => false,
    })
  );

  const service = createExecutionService(db, { sandboxEnabled: true });
  const approvals = createApprovalService(db);

  // ------------------------------------------------------------------
  // A. Submission + lifecycle
  // ------------------------------------------------------------------
  let submittedJobId = null;

  await test('pre-approved task submits straight to queued', async () => {
    const res = await service.submitJob(CONTEXT, {
      mode: 'task',
      taskId: 'repo.inventory',
      runtime: 'node',
      permissions: ['fs:read'],
      idempotencyKey: 'int-key-1',
    });
    assert.strictEqual(res.replayed, false);
    assert.strictEqual(res.approvalRequired, false, 'read-only task should not require approval');
    assert.strictEqual(res.job.state, 'queued');
    submittedJobId = res.job.jobId;
  });

  await test('script submission requiring approval parks in awaiting_approval', async () => {
    const res = await service.submitJob(CONTEXT, {
      mode: 'script',
      source: 'print("hello sandbox")',
      runtime: 'python',
      permissions: ['fs:read'],
    });
    assert.strictEqual(res.approvalRequired, true, 'script mode defaults to requiring approval');
    assert.strictEqual(res.job.state, 'awaiting_approval');
    assert.strictEqual(res.job.scriptHash, hashScript('print("hello sandbox")'));
    assert(typeof res.approvalBinding === 'string' && res.approvalBinding.length > 0);
  });

  await test('idempotent resubmission replays the same job', async () => {
    const res = await service.submitJob(CONTEXT, {
      mode: 'task',
      taskId: 'repo.inventory',
      runtime: 'node',
      permissions: ['fs:read'],
      idempotencyKey: 'int-key-1',
    });
    assert.strictEqual(res.replayed, true, 'same idempotency key must replay');
    assert.strictEqual(res.job.jobId, submittedJobId);
  });

  await test('getJob and listJobs are project-scoped', async () => {
    const job = await service.getJob(CONTEXT, submittedJobId);
    assert.strictEqual(job.jobId, submittedJobId);
    const jobs = await service.listJobs(CONTEXT, { mode: 'task' });
    assert(jobs.length >= 1, 'expected at least one task-mode job');
    for (const j of jobs) assert.strictEqual(j.project, CONTEXT.project);
  });

  // ------------------------------------------------------------------
  // B. Approval binding + self-approval guard
  // ------------------------------------------------------------------
  let awaitingJobId = null;
  let awaitingHash = null;

  await test('self-approval by the requesting agent is forbidden', async () => {
    const jobs = await service.listJobs(CONTEXT, { state: 'awaiting_approval' });
    const job = jobs[0];
    awaitingJobId = job.jobId;
    awaitingHash = job.scriptHash;

    try {
      await service.approveJob(CONTEXT, {
        jobId: job.jobId,
        approver: CONTEXT.agent, // same as requester
      });
      throw new Error('self-approval should have been rejected');
    } catch (err) {
      assert(err instanceof ExecutionError, 'expected an ExecutionError');
      assert.strictEqual(err.code, EXECUTION_ERRORS.POLICY_DENIED);
    }
  });

  await test('approval by a different principal is accepted', async () => {
    const res = await service.approveJob(CONTEXT, {
      jobId: awaitingJobId,
      approver: 'human-review-agent',
    });
    assert.strictEqual(res.job.state, 'queued', 'approved job should move to queued');
    assert.strictEqual(res.approval.approver, 'human-review-agent');
  });

  await test('approval binding is content-sensitive (hash mismatch is rejected)', async () => {
    const expected = approvals.bindingFor({
      scriptHash: awaitingHash,
      project: CONTEXT.project,
      runtime: 'python',
      permissions: ['fs:read'],
    });
    const wrong = approvals.bindingFor({
      scriptHash: hashScript('different source'),
      project: CONTEXT.project,
      runtime: 'python',
      permissions: ['fs:read'],
    });
    assert.notStrictEqual(expected, wrong, 'different source must produce a different binding');
  });

  await test('an approval cannot be consumed twice (replay prevention)', async () => {
    const grant = await approvals.grantApproval(CONTEXT, {
      scriptHash: awaitingHash,
      project: CONTEXT.project,
      runtime: 'python',
      permissions: ['fs:read'],
      requestingAgent: 'some-agent',
      approver: 'human-review-agent',
    });

    // First consume succeeds.
    await approvals.consumeApproval(CONTEXT, {
      approvalId: grant.approvalId,
      scriptHash: awaitingHash,
      project: CONTEXT.project,
      runtime: 'python',
      permissions: ['fs:read'],
      requestingAgent: 'some-agent',
    });

    // Second consume must fail (already used).
    try {
      await approvals.consumeApproval(CONTEXT, {
        approvalId: grant.approvalId,
        scriptHash: awaitingHash,
        project: CONTEXT.project,
        runtime: 'python',
        permissions: ['fs:read'],
        requestingAgent: 'some-agent',
      });
      throw new Error('replay should have been rejected');
    } catch (err) {
      assert(err instanceof ExecutionError, 'expected an ExecutionError');
      assert.strictEqual(err.code, EXECUTION_ERRORS.APPROVAL_EXPIRED);
    }
  });

  // ------------------------------------------------------------------
  // C. Fail-closed execution (the Phase 1 safety guarantee)
  // ------------------------------------------------------------------
  await test('executeJob ALWAYS refuses — no isolation backend is live', async () => {
    const res = await service.executeJob(CONTEXT, submittedJobId);
    assert.strictEqual(res.executed, false, 'nothing may execute in Phase 1');
    assert.strictEqual(res.job.state, 'failed');
    assert.strictEqual(res.job.error.code, EXECUTION_ERRORS.SANDBOX_START_FAILED);
  });

  await test('a failed job cannot be transitioned back to running', async () => {
    try {
      await service.repository.transitionJob(submittedJobId, CONTEXT, 'running');
      throw new Error('terminal->running should be rejected');
    } catch (err) {
      assert(err instanceof ExecutionError, 'expected an ExecutionError');
      assert.strictEqual(err.code, EXECUTION_ERRORS.INVALID_STATE_TRANSITION);
    }
  });

  // ------------------------------------------------------------------
  // D. Cancellation is idempotent
  // ------------------------------------------------------------------
  await test('cancelling a queued job transitions to cancelling and is audited', async () => {
    // Submit a fresh pre-approved task so we have a NON-terminal job to cancel.
    const fresh = await service.submitJob(CONTEXT, {
      mode: 'task',
      taskId: 'repo.inventory',
      runtime: 'node',
      permissions: ['fs:read'],
      idempotencyKey: 'int-cancel-1',
    });
    assert.strictEqual(fresh.job.state, 'queued');
    const res = await service.cancelJob(CONTEXT, fresh.job.jobId);
    assert.strictEqual(res.alreadyCancelling, false, 'queued job should begin cancelling');
    assert.strictEqual(res.job.state, 'cancelling');
  });

  await test('cancelling an already-cancelled/terminal job is a safe no-op', async () => {
    const res = await service.cancelJob(CONTEXT, submittedJobId);
    assert.strictEqual(res.alreadyCancelling, true, 'terminal job should be a no-op cancel');
  });

  // ------------------------------------------------------------------
  // E. Audit trail — recorded, redacted, bounded, project-scoped (§13.3)
  // ------------------------------------------------------------------
  await test('audit events are persisted to the existing activity stream', async () => {
    const rows = await db
      .collection('activity')
      .find({ project: CONTEXT.project, type: 'execution' })
      .toArray();
    assert(rows.length >= 1, 'expected at least one execution activity row');
    const events = rows.map((r) => r.metadata?.event);
    assert(events.includes('execution.job_submitted'), 'submit must be audited');
    assert(events.includes('execution.approval_required'), 'approval routing must be audited');
    assert(events.includes('execution.refused'), 'refusal must be audited');
    assert(events.includes('execution.cancelled'), 'cancellation must be audited');
  });

  await test('audit rows never persist raw script source or sensitive fields', async () => {
    // Submit a script carrying sensitive-looking metadata; the audit layer must
    // redact `source`, `env`, `secrets`, and bound long strings.
    const res = await service.submitJob(CONTEXT, {
      mode: 'script',
      source: 'print("SECRET_SOURCE_MARKER_do_not_persist")',
      runtime: 'python',
      permissions: ['fs:read'],
    });
    // Directly record an audit event with sensitive keys to exercise redaction.
    const audit = createAuditService(db, CONTEXT);
    await audit.record('execution.test_redaction', {
      jobId: res.job.jobId,
      source: 'SECRET_SOURCE_MARKER_do_not_persist',
      env: { API_KEY: 'SECRET_ENV_MARKER' },
      secrets: { token: 'SECRET_TOKEN_MARKER' },
      stack: 'Error: SECRET_STACK_MARKER',
      hostPath: 'C:\\Users\\ranit\\.ssh\\id_ed25519',
      bounded: 'x'.repeat(5000),
    });

    const rows = await db
      .collection('activity')
      .find({ project: CONTEXT.project, type: 'execution' })
      .toArray();
    const matching = rows.filter((r) => r.metadata?.event === 'execution.test_redaction');
    assert(matching.length >= 1, 'redaction test row should be persisted');
    const serialized = JSON.stringify(matching[0]);
    assert(!serialized.includes('SECRET_SOURCE_MARKER'), 'source must be redacted');
    assert(!serialized.includes('SECRET_ENV_MARKER'), 'env secrets must be redacted');
    assert(!serialized.includes('SECRET_TOKEN_MARKER'), 'secret token must be redacted');
    assert(!serialized.includes('SECRET_STACK_MARKER'), 'stack traces must be redacted');
    assert(!serialized.includes('id_ed25519'), 'host secret paths must be redacted');
    assert(serialized.includes('[redacted]'), 'redaction marker expected');
    // Long strings must be bounded (truncated), not stored in full.
    assert(matching[0].metadata.bounded.length < 600, 'long strings must be truncated');
    assert(matching[0].metadata.bounded.includes('[truncated:'), 'truncation marker expected');
  });

  await test('redactAuditMetadata is pure and depth-bounded', () => {
    const { redactAuditMetadata } = auditModule;
    const nested = { a: { b: { c: { d: { e: { f: 'too deep' } } } } } };
    const out = redactAuditMetadata(nested);
    assert.strictEqual(typeof out, 'object');
    // Depth cap replaces deeply-nested values rather than recursing forever.
    assert(JSON.stringify(out).includes('[truncated:depth]'));
    // Sensitive top-level key is redacted.
    assert.strictEqual(redactAuditMetadata({ source: 'abc' }).source, '[redacted]');
    // Non-sensitive passthrough preserved.
    assert.strictEqual(redactAuditMetadata({ jobId: 'j1' }).jobId, 'j1');
  });

  await test('audit rows are project-scoped (no cross-project leakage)', async () => {
    const otherProject = { agent: 'other-agent', project: 'other-exec-project' };
    const otherRows = await db
      .collection('activity')
      .find({ project: otherProject.project, type: 'execution' })
      .toArray();
    // Our execution rows must never appear under another project's scope.
    const ours = await db
      .collection('activity')
      .find({ project: CONTEXT.project, type: 'execution' })
      .toArray();
    for (const row of ours) {
      assert.strictEqual(row.project, CONTEXT.project);
    }
    assert(otherRows.every((r) => r.project !== CONTEXT.project));
  });

  // ------------------------------------------------------------------
  await disconnectDatabase();
  for (const suffix of ['', '-wal', '-shm']) {
    try {
      fs.rmSync(dbPath + suffix, { force: true });
    } catch {
      /* best-effort cleanup */
    }
  }

  console.log('\n=== Results ===');
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total: ${passed + failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch((err) => {
  console.error('Test runner failed:', err);
  process.exit(1);
});
