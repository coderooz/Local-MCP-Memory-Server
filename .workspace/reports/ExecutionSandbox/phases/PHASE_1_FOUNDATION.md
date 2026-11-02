# PHASE 1 — Execution Contracts & Policy Foundation

**Report ID:** PHASE_1_FOUNDATION_ExecutionSandbox_20261018
**Status:** COMPLETE
**Date:** 2026-10-18
**Scope:** Contracts, policy engine, state machine, durable job repository, approval binding,
audit trail, MCP tool contracts, and tests — **no process execution**.

---

## Objective (directive §12 Phase 1)

Implement the execution contracts and policy foundation so that policy decisions are
deterministic, unauthorized jobs are rejected, state transitions are validated and durable, and
audit records are traceable — all **without starting any arbitrary process**.

## Entry conditions

- Phase 0 complete: baseline captured, integration points verified, 8 decisions recorded.
- Docker daemon DOWN → real execution is out of scope; Phase 1 is not Docker-blocked.

## What shipped

### 1. Contracts & schemas (`src/interfaces/mcp-tools/execution-tool-definitions.js`)

Six tool schemas mirroring the existing `tool-definitions.js` style: `execution_submit`,
`execution_status`, `execution_result`, `execution_list`, `execution_cancel`,
`execution_approve`. Registered additively (D-003).

### 2. Policy engine (`policy.js`)

`computeEffectivePolicy({agent, project, runtime, task, requested, sandboxEnabled})` →
deterministic `{permissions, requiresApproval, limits, deniedReasons}`. Requested permissions
can only **narrow**; the sandbox flag gates enablement; runtime must be in the trusted
allowlist. Never trusts caller input.

### 3. State machine (`state-machine.js`)

15 states with an explicit transition table. Invalid transitions throw
`INVALID_STATE_TRANSITION`. Terminal states are absorbing. `failed` is reachable from
`validating`/`awaiting_approval`/`queued`/`running` so a job is never stuck unrecoverable.

### 4. Durable job repository (`repository.js` + `schema.js`)

`execution_jobs` table (created in the existing SQLite `createSchema`) with a UNIQUE
idempotency index. `createJob`/`getJob`/`transitionJob`/`listJobs`/`findByIdempotencyKey`.
Transitions use optimistic concurrency (`version` column + conditional update) reusing the
proven tasks-subsystem pattern. Identity/project always come from the trusted context.

### 5. Approval service (`approval.js`)

Grants bound to `(scriptHash, project, runtime, permissions)` with expiry + replay prevention.
`consumeApproval` is one-shot. **Self-approval (approver === requestingAgent) is rejected** with
`POLICY_DENIED`. Bindings are content-sensitive (different source → different binding).

### 6. Audit service (`audit.js`) — §4.1/§8/§10

Narrow adapter over the **existing** `recordActivity`/`recordMetric` services (D-009 — no
competing logger). Events: `job_submitted`, `approval_required`, `approval_granted`,
`state_transition`, `refused`, `cancelled`, `policy_denied`. Redacts `source`/`secrets`/`env`/
`stack`/`hostPath` and truncates long strings before persistence. Writes are best-effort and
never throw into the caller. Wired into every lifecycle method of `index.js`.

### 7. Sandbox adapter + workspace + result collector

`sandbox-adapter.js` exposes a replaceable `getBackend(name)` abstraction; the Docker backend
is a stub whose `isAvailable()` probes the daemon (currently false). `workspace.js` and
`result-collector.js` provide the interfaces + bounded normalization, to be completed in
Phases 2–3.

### 8. MCP tool contracts + wiring (`tools/executionTools.js`, `mcp-server.js`)

Six handlers dispatching to the execution service via `service-bridge.js` (which imports the
collection-wrapped `getDb`). `mcp-server.js` gains 4 additive edits: imports, `tools/list`
spread, `tools/call` dispatch block, `getToolSchemaMap` entries. **No existing tool touched.**

### 9. Feature flag (`core/config/project-config-loader.js`)

`features.executionSandbox = false` (disabled by default, D-002). Enabled-but-unavailable →
`SANDBOX_START_FAILED`, never a host fallback.

## Tests (40 green)

- `tests/execution-policy-test.js` — **24/24**: schema, policy determinism, permission
  narrowing, runtime allowlist, state transitions, error normalization, feature flag.
- `tests/execution-integration-test.js` — **16/16** (against a real temp SQLite DB): submission
  - lifecycle, idempotent replay, project scoping, self-approval guard, approval binding
    sensitivity, replay prevention, **fail-closed execution**, invalid transition rejection,
    idempotent cancellation, **audit persistence**, **audit redaction/truncation**, **audit project
    isolation**.

No test spawns a process or runs untrusted code; `executeJob` always refuses and that refusal is
asserted.

## Exit conditions (directive §12 Phase 1) — met

| Criterion                               | Status | Evidence                                   |
| --------------------------------------- | ------ | ------------------------------------------ |
| Policy decisions deterministic/testable | ✅     | policy suite 24/24                         |
| Unauthorized jobs rejected              | ✅     | identity/scope/policy denies tested        |
| State transitions validated + durable   | ✅     | state-machine + repository optimistic lock |
| Existing MCP behavior passes regression | ✅     | 74/74 baseline green, unchanged            |
| Audit records traceable                 | ✅     | integration audit tests green              |

## Defects found & fixed during Phase 1

1. **`service-bridge.js` imported raw `getDb`** from `connection.js` instead of the
   collection-wrapped `getDb` from `index.js` → `db.collection is not a function`. Fixed.
2. **`queued` could not reach `failed`** → a job that failed to start was stuck unrecoverable.
   Added `failed` to allowed transitions of `validating`/`awaiting_approval`/`queued`.

Both recorded in `FAILURE_REGISTER.md`.

## Not done (deferred, out of Phase 1 scope)

- Real Docker adapter + adversarial isolation tests (Phase 2 — Docker-blocked).
- Workspace containment + controlled integration (Phase 3).
- Startup reconciliation + leases (Phase 4).
- Release/perf validation (Phase 5).
