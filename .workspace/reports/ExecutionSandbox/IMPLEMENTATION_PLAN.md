# IMPLEMENTATION PLAN — Local Execution Sandbox

**Report ID:** IMPLEMENTATION_PLAN_ExecutionSandbox_20261017
**Date:** 2026-10-17
**Status:** Active (Phase 0 complete; Phase 1 awaiting isolation decision)
**Baseline commit:** `643fa30` · **Protected dirty files:** 3 (never touched)

> Phased per directive §12. Each phase: entry conditions → tasks → tests → exit criteria.
> **No phase may be skipped.** Phase 2+ is gated on the Docker daemon decision.

---

## Module → file mapping (follows existing conventions)

New code lives under the existing `src/core/` + `tools/` layout (mirrors `src/core/mcp-registry/`):

```
src/core/execution/
  index.js              ExecutionService (submit/status/cancel orchestration)
  policy.js             ExecutionPolicyEngine (effective-permission computation)
  state-machine.js      validated job state machine + transition guards
  repository.js         execution_jobs persistence (via collection API)
  approval.js           ApprovalService (hash-bound, expiring, replay-proof)
  workspace.js          WorkspaceManager (per-job isolated worktree/staging copy)
  runtime-registry.js   trusted runtime map (python/node) — no client-supplied paths
  sandbox-adapter.js    Docker adapter (fail-closed) + interface for backends
  result-collector.js   bounded stdout/stderr, exit status, changed-file manifest, redaction
  tasks-registry.js     versioned approved-task definitions (read-only set first)
src/interfaces/mcp-tools/execution-tool-definitions.js   schemas for the 6 tools
tools/executionTools.js                                   handlers -> /execution/* routes
```

`server.js` gains an additive `/execution/*` route family (mirrors `/mcp/*` registry routes).
`src/core/database/sqlite/schema.js` gains additive tables. `mcp-server.js` gains one spread in
`tools/list` + one dispatch family in `tools/call`.

---

## PHASE 1 — Contracts & policy foundation (NO process execution)

**Entry:** Phase 0 complete (this document).
**Tasks:**

1. Schemas for the 6 tools + request/response contracts (`API_CONTRACTS.md`).
2. `state-machine.js` — all 16 states + transition validation; persist each accepted transition.
3. `repository.js` — `execution_jobs` table, idempotency key, concurrency-safe claim.
4. `policy.js` — deterministic effective-permission computation (identity ∩ project ∩ runtime ∩ task).
5. Trusted identity/project scope wiring (reuse `CONFIG.*`).
6. Audit event structures.
7. Wire `/execution/*` routes + `getExecutionTools()` (advertised only when flag on).
8. Unit tests: schema, policy determinism, transitions, idempotency — **no processes spawned**.
   **Exit:** unauthorized jobs rejected; transitions validated+durable; `npm test` 74-green preserved;
   audit records traceable.

## PHASE 2 — Restricted sandbox & read-only execution (GATED ON DOCKER)

**Entry:** Docker daemon running (USER ACTION REQUIRED) + Phase 1 exit met.
**Tasks:**

1. `sandbox-adapter.js` — Docker run with §6.2 controls (non-root, read-only rootfs, `--network=none`,
   `--memory`, `--cpus`, `--pids-limit`, no caps, only workspace mounted rw).
2. `runtime-registry.js` — explicit trusted python/node runtime entries; no client paths.
3. Timeout + process-tree termination; bounded output collection.
4. Disposable workspace allocation + cleanup/quarantine.
5. Read-only approved tasks: repo inventory, config audit, test execution, report generation.
6. **Adversarial tests:** path traversal, network egress attempt, env-secret read, resource
   exhaustion, huge output, subprocess spawn, cancellation.
   **Exit:** both runtimes run read-only tasks; host access blocked; network denied; timeout kills
   workload; output caps enforced; cleanup verified; **no script runs inside the MCP process**.

## PHASE 3 — Controlled writes & approval (GATED ON PHASE 2)

**Tasks:** isolated write workspaces (git worktree), changed-file manifest + diff, path/file-type
validation, content-hash-bound approvals with expiry + replay prevention, separate execute vs
integrate permissions, conflict detection, controlled integration.
**Exit:** writes stay isolated until approved; modified script cannot reuse an old approval;
concurrent project changes preserved; unapproved integration impossible.

## PHASE 4 — Coordination & recovery

**Tasks:** task ownership + soft-lock integration, execution leases, activity events, startup
reconciliation, crash/cancel recovery, bounded retries, authorized listing/result retrieval,
MCP-disconnect policy.
**Exit:** isolated concurrent jobs; duplicate submissions don't duplicate side effects; recovery
never silently re-runs uncertain work; existing memory/coordination intact.

## PHASE 5 — Security validation & release

**Tasks:** full `npm test` + chaos + isolation suites, adversarial isolation tests, perf/token
benchmark (§14), supply-chain review, feature-disable + cleanup-after-failure tests, PRI/LFI +
README + SECURITY + CHANGELOG updates, final release report.
**Exit:** all security gates pass; regression clean; tools documented; recovery system complete;
rollback verified; limitations documented; **no unsupported production-readiness claim**.

---

## Testing strategy

- Framework: existing `node:test` + `npm run check` conventions (no new deps).
- New suites: `tests/execution-policy-test.js`, `tests/execution-state-test.js`,
  `tests/execution-security-test.js` — wired into `npm test` only once green.
- Regression: the existing 5 suites must stay at 74-green; the DB integrity table-count assertion
  is updated **deliberately** when the new table lands.
- Release gates (§13.5) block on: sandbox escape, unauthorized fs write, cross-project leak,
  identity/approval bypass, unbounded execution, surviving child processes, silent overwrite,
  corrupted job state, or core-MCP regression.

## Rollback

- Feature flag off → sandbox entirely inert; zero behavior change (D-002).
- No existing data is migrated or deleted; job audit history is never purged by cleanup.
- Schema is additive → dropping the feature requires no destructive migration.
