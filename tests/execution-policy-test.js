/**
 * Execution Sandbox — Policy, State Machine & Registry Tests (Phase 1)
 *
 * Pure-logic validation. NO process is spawned and NO untrusted code runs.
 * Covers: schema/policy determinism, permission narrowing, state transitions,
 * runtime allow-listing, task registry, approval content-binding + replay +
 * self-approval, and result redaction/bounding.
 *
 * Run: node tests/execution-policy-test.js
 */

import assert from 'node:assert';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  computeEffectivePolicy,
  normalizeLimits,
  resolveRuntimeCeiling,
  PERMISSIONS,
} from '../src/core/execution/policy.js';
import {
  assertTransition,
  canTransition,
  isTerminal,
  cancellationOutcome,
  JOB_STATES,
} from '../src/core/execution/state-machine.js';
import {
  resolveRuntime,
  isRuntimeRegistered,
  listRuntimes,
} from '../src/core/execution/runtime-registry.js';
import { resolveTask, listTasks } from '../src/core/execution/tasks-registry.js';
import { hashScript } from '../src/core/execution/index.js';
import { redact, boundOutput, normalizeResult } from '../src/core/execution/result-collector.js';
import { assertContained } from '../src/core/execution/workspace.js';
import { ExecutionError, EXECUTION_ERRORS } from '../src/core/execution/errors.js';

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

function expectExecutionError(fn, code) {
  try {
    fn();
  } catch (err) {
    assert(err instanceof ExecutionError, `expected ExecutionError, got ${err?.name}`);
    assert.strictEqual(err.code, code, `expected code ${code}, got ${err.code}`);
    return;
  }
  throw new Error(`expected ExecutionError ${code} but nothing was thrown`);
}

async function runTests() {
  console.log('=== Execution Sandbox: Policy / State / Registry Tests ===\n');

  // ------------------------------------------------------------------
  // A. Policy engine
  // ------------------------------------------------------------------
  await test('sandbox disabled -> SANDBOX_DISABLED (fail-closed default)', () => {
    expectExecutionError(
      () =>
        computeEffectivePolicy({
          agent: 'a1',
          project: 'p1',
          runtime: 'python',
          sandboxEnabled: false,
        }),
      EXECUTION_ERRORS.SANDBOX_DISABLED
    );
  });

  await test('missing identity -> IDENTITY_REQUIRED', () => {
    expectExecutionError(
      () =>
        computeEffectivePolicy({
          agent: '',
          project: 'p1',
          runtime: 'python',
          sandboxEnabled: true,
        }),
      EXECUTION_ERRORS.IDENTITY_REQUIRED
    );
  });

  await test('missing project -> PROJECT_SCOPE_DENIED', () => {
    expectExecutionError(
      () =>
        computeEffectivePolicy({
          agent: 'a1',
          project: '',
          runtime: 'python',
          sandboxEnabled: true,
        }),
      EXECUTION_ERRORS.PROJECT_SCOPE_DENIED
    );
  });

  await test('unknown runtime -> UNKNOWN_RUNTIME', () => {
    expectExecutionError(
      () =>
        computeEffectivePolicy({
          agent: 'a1',
          project: 'p1',
          runtime: 'ruby',
          sandboxEnabled: true,
        }),
      EXECUTION_ERRORS.UNKNOWN_RUNTIME
    );
  });

  await test('requested permissions may only NARROW, never grant net/process', () => {
    const policy = computeEffectivePolicy({
      agent: 'a1',
      project: 'p1',
      runtime: 'python',
      sandboxEnabled: true,
      requested: { permissions: ['net:access', 'process:spawn', 'fs:read'] },
    });
    // net/process are never on the runtime ceiling, so they are dropped.
    assert(!policy.permissions.includes('net:access'), 'net:access must not be granted');
    assert(!policy.permissions.includes('process:spawn'), 'process:spawn must not be granted');
    assert(policy.permissions.includes('fs:read'), 'fs:read should survive');
    assert.strictEqual(policy.network, false, 'network must default deny');
    assert.strictEqual(policy.process, false, 'process must default deny');
  });

  await test('policy is deterministic (same inputs -> identical output)', () => {
    const input = {
      agent: 'a1',
      project: 'p1',
      runtime: 'node',
      sandboxEnabled: true,
      requested: { permissions: ['fs:read'], limits: { timeoutMs: 5000 } },
    };
    const a = JSON.stringify(computeEffectivePolicy(input));
    const b = JSON.stringify(computeEffectivePolicy(input));
    assert.strictEqual(a, b, 'policy output must be deterministic');
  });

  await test('resource limits are clamped to safe maxima', () => {
    const limits = normalizeLimits({
      timeoutMs: 99999999,
      memoryMb: 999999,
      cpus: 999,
      outputBytes: 999999999,
      pidsLimit: 99999,
    });
    assert(limits.timeoutMs <= 15 * 60 * 1000, 'timeout must be clamped');
    assert(limits.memoryMb <= 2048, 'memory must be clamped');
    assert(limits.cpus <= 4, 'cpus must be clamped');
    assert(limits.outputBytes <= 1024 * 1024, 'output must be clamped');
    assert(limits.pidsLimit <= 64, 'pids must be clamped');
  });

  await test('runtime ceiling excludes net and process', () => {
    const ceiling = resolveRuntimeCeiling('python');
    assert(!ceiling.includes('net:access'));
    assert(!ceiling.includes('process:spawn'));
    assert(ceiling.includes('fs:read'));
  });

  // ------------------------------------------------------------------
  // B. State machine
  // ------------------------------------------------------------------
  await test('all documented states are known', () => {
    for (const s of ['queued', 'running', 'succeeded', 'cancelled', 'timed_out']) {
      assert(JOB_STATES.includes(s), `state ${s} should be registered`);
    }
  });

  await test('valid transitions are permitted', () => {
    assert(canTransition('validating', 'queued'));
    assert(canTransition('queued', 'preparing'));
    assert(canTransition('running', 'collecting'));
    assert(canTransition('collecting', 'validating_result'));
    assert(canTransition('validating_result', 'succeeded'));
  });

  await test('a job that cannot start may always fail (no unrecoverable state)', () => {
    // Backend-unavailable / workspace-allocation failures must be reachable
    // from every pre-execution state, or a job could get stuck forever.
    assert(canTransition('queued', 'failed'), 'queued -> failed must be allowed');
    assert(canTransition('validating', 'failed'), 'validating -> failed must be allowed');
    assert(
      canTransition('awaiting_approval', 'failed'),
      'awaiting_approval -> failed must be allowed'
    );
    assert(canTransition('preparing', 'failed'), 'preparing -> failed must be allowed');
  });

  await test('terminal states block further transitions', () => {
    expectExecutionError(
      () => assertTransition('succeeded', 'running'),
      EXECUTION_ERRORS.INVALID_STATE_TRANSITION
    );
    expectExecutionError(
      () => assertTransition('cancelled', 'queued'),
      EXECUTION_ERRORS.INVALID_STATE_TRANSITION
    );
    expectExecutionError(
      () => assertTransition('rejected', 'queued'),
      EXECUTION_ERRORS.INVALID_STATE_TRANSITION
    );
  });

  await test('illegal transition is rejected with INVALID_STATE_TRANSITION', () => {
    expectExecutionError(
      () => assertTransition('queued', 'succeeded'),
      EXECUTION_ERRORS.INVALID_STATE_TRANSITION
    );
    expectExecutionError(
      () => assertTransition('validating', 'running'),
      EXECUTION_ERRORS.INVALID_STATE_TRANSITION
    );
  });

  await test('isTerminal and cancellationOutcome behave correctly', () => {
    assert(isTerminal('succeeded'));
    assert(isTerminal('failed'));
    assert(!isTerminal('running'));
    assert.strictEqual(cancellationOutcome('running'), 'failed');
    assert.strictEqual(cancellationOutcome('queued'), 'cancelled');
  });

  // ------------------------------------------------------------------
  // C. Runtime + task registries
  // ------------------------------------------------------------------
  await test('trusted runtimes are python and node only', () => {
    const runtimes = listRuntimes();
    assert(runtimes.includes('python') && runtimes.includes('node'));
    assert(isRuntimeRegistered('python') && isRuntimeRegistered('node'));
    assert(!isRuntimeRegistered('bash'), 'bash must not be a trusted runtime');
  });

  await test('resolveRuntime rejects unregistered ids', () => {
    expectExecutionError(() => resolveRuntime('bash'), EXECUTION_ERRORS.UNKNOWN_RUNTIME);
  });

  await test('approved tasks resolve and unknown tasks are rejected', () => {
    const task = resolveTask('repo.inventory');
    assert.strictEqual(task.id, 'repo.inventory');
    assert(Array.isArray(task.allowedRuntimes));
    expectExecutionError(() => resolveTask('evil.task'), EXECUTION_ERRORS.UNKNOWN_TASK);
    assert(listTasks().length >= 3, 'at least three read-only tasks expected');
  });

  await test('task version mismatch is rejected', () => {
    expectExecutionError(() => resolveTask('repo.inventory', 999), EXECUTION_ERRORS.UNKNOWN_TASK);
  });

  // ------------------------------------------------------------------
  // D. Script hashing (approval anchor)
  // ------------------------------------------------------------------
  await test('script hash is stable and content-sensitive', () => {
    const a = hashScript('print("hello")');
    const b = hashScript('print("hello")');
    const c = hashScript('print("HELLO")');
    assert.strictEqual(a, b, 'identical source must hash identically');
    assert.notStrictEqual(a, c, 'different source must hash differently');
    assert(/^[a-f0-9]{64}$/.test(a), 'hash must be a 64-char hex sha256');
  });

  // ------------------------------------------------------------------
  // E. Result collector (redaction + bounding)
  // ------------------------------------------------------------------
  await test('redaction masks secrets', () => {
    const out = redact('password=supersecret token: abc123 mongodb://user:pass@host/db');
    assert(!out.includes('supersecret'), 'password value must be redacted');
    assert(!out.includes('abc123'), 'token value must be redacted');
    assert(!out.includes('user:pass@host'), 'mongodb creds must be redacted');
    assert(out.includes('[REDACTED]'));
  });

  await test('output bounding truncates and flags', () => {
    const big = 'x'.repeat(5000);
    const res = boundOutput(big, 100);
    assert(res.truncated, 'oversized output must be flagged truncated');
    assert(res.bytes >= 100, 'byte count should reflect the original');
    assert(res.text.length <= 100, 'text must respect the cap');
  });

  await test('normalizeResult marks success only on exit 0', () => {
    const ok = normalizeResult({ exitCode: 0, stdout: 'done', stderr: '' }, { outputBytes: 1000 });
    assert.strictEqual(ok.success, true);
    const bad = normalizeResult({ exitCode: 1, stdout: '', stderr: 'boom' }, { outputBytes: 1000 });
    assert.strictEqual(bad.success, false);
  });

  // ------------------------------------------------------------------
  // F. Workspace containment
  // ------------------------------------------------------------------
  await test('path traversal escapes are rejected', () => {
    expectExecutionError(
      () => assertContained('/root/ws', '../etc/passwd'),
      EXECUTION_ERRORS.WORKSPACE_CONFLICT
    );
    expectExecutionError(
      () => assertContained('C:\\ws', 'C:\\Windows\\System32'),
      EXECUTION_ERRORS.WORKSPACE_CONFLICT
    );
  });

  await test('contained relative paths resolve safely', () => {
    const p = assertContained('/root/ws', 'sub/file.txt');
    assert(p.includes('sub'), 'contained path should resolve inside the root');
  });

  // ------------------------------------------------------------------
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
