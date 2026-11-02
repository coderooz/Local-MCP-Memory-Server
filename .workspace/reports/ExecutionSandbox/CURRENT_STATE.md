# CURRENT STATE — Local Execution Sandbox

**Report ID:** CURRENT_STATE_ExecutionSandbox_20261018
**Updated:** 2026-10-18
**Recovery snapshot.** A future session should read this + `INDEX.md` before acting.

---

## Git

- **Branch:** `main`
- **Baseline commit:** `643fa30f734493d2400d6cbc0dbe43e59bf64b86`
- **Working tree:** pre-existing modified files — **PROTECTED, never touched, never committed
  by this task**:
  - `.workspace/LFI/LOGIC_FLOW_INDEX.md`
  - `.workspace/PRI/PROJECT_REFERENCE_INDEX.md`
  - `PROJECT_ROADMAP.md`
  - `core/config/project-config-loader.js` (sandbox feature flag — sandbox change)
  - `mcp-server.js` (additive tool registration — sandbox change)
  - `src/core/database/sqlite/schema.js` (2 new tables — sandbox change)
  - `tests/database-integrity-test.js` (table count 19→21 — sandbox change)
- **Untracked (new, sandbox):** `src/core/execution/*`, `src/interfaces/mcp-tools/execution-tool-definitions.js`,
  `tools/executionTools.js`, `tests/execution-*.js`, `.workspace/reports/ExecutionSandbox/*`
- **Nothing staged. Nothing pushed.** No stash.

## Phase

- **Current phase:** 1 — Execution contracts & policy foundation — **COMPLETE**
- **Overall completion:** ~30% (Phase 1 of 5). Contracts, policy, state machine, durable job
  repository, approval binding, audit trail, MCP tool contracts + tests all implemented.
  **No process execution** — execution is fail-closed by design (Phase 2, Docker-gated).

## Implemented modules (`src/core/execution/`)

| Module                | Responsibility                                                    |
| --------------------- | ----------------------------------------------------------------- |
| `errors.js`           | Stable error codes (`IDENTITY_REQUIRED`, `POLICY_DENIED`, …)      |
| `state-machine.js`    | Validated lifecycle transitions (15 states)                       |
| `policy.js`           | Deterministic effective-policy computation (never trusts request) |
| `runtime-registry.js` | Trusted runtime allowlist (python/node; no client paths)          |
| `tasks-registry.js`   | Versioned approved-task definitions (read-only)                   |
| `repository.js`       | Durable `execution_jobs` persistence + optimistic concurrency     |
| `approval.js`         | Hash-bound, expiring, replay-proof, no-self-approval grants       |
| `sandbox-adapter.js`  | Replaceable backend abstraction (Docker stub, fail-closed)        |
| `workspace.js`        | Workspace manager interface (containment — Phase 3)               |
| `result-collector.js` | Bounded result normalization + redaction                          |
| `audit.js`            | Activity/metrics adapter with redaction + truncation              |
| `index.js`            | Execution service orchestrating the above                         |
| `service-bridge.js`   | Bridges to collection-wrapped `getDb` for tool handlers           |

Plus `src/interfaces/mcp-tools/execution-tool-definitions.js` (6 tool schemas) and
`tools/executionTools.js` (handlers), wired into `mcp-server.js` additively.

## Partially implemented

- **Workspace containment** (`workspace.js`) — interface + basic allocation only; path/junction
  escape defenses are Phase 3.
- **Result collector** — normalization/redaction present; real diffs/manifests are Phase 3.

## Unimplemented modules (future phases)

- Real Docker isolation adapter (Phase 2), read-only execution (Phase 2), controlled writes +
  integration (Phase 3), startup reconciliation + leases (Phase 4), release validation (Phase 5).

## Test results (2026-10-18, post-Phase-1)

| Suite                        | Result                                    |
| ---------------------------- | ----------------------------------------- |
| `npm run check`              | PASS (exit 0)                             |
| `test:execution:policy`      | **24/24 PASS**                            |
| `test:execution:integration` | **16/16 PASS**                            |
| `test:feedback`              | 7/7 PASS                                  |
| `test:chat`                  | 9/9 PASS                                  |
| `test:mcp-registry`          | 24/24 PASS                                |
| `test:db`                    | 34/34 PASS                                |
| `test:e2e`                   | 15 FAIL — **environmental, pre-existing** |
| Prettier (new files)         | PASS                                      |

**Regression baseline protected: 74/89 green, unchanged.** e2e is the known
website-copy-runtime-identity issue (MCP memory `08a859b2`), NOT a sandbox regression.
Evidence: `git diff server.js` is clean; the squatting process is PID 4364
(`…\website\local-mcp-memory\mcp-server.js`, project `local-mcp-memory`, port 47005).

## Security controls verified (Phase 1)

- No unrestricted shell-execution MCP tool exists.
- Identity is server-injected (`CONFIG.agent`/`CONFIG.project`), never caller-asserted.
- Requested permissions can only narrow effective permissions.
- State transitions validated + concurrency-safe (optimistic versioning).
- Idempotency: duplicate submissions replay; UNIQUE idempotency index.
- Approval bound to `(scriptHash, project, runtime, permissions)` + expiry + replay-proof.
- **Self-approval forbidden.**
- **Audit redaction**: source/secrets/env/stack/host-paths redacted; long strings truncated.
- Audit rows project-scoped (no cross-project leakage).
- **Execution always refuses (fail-closed)** — no process spawned, no untrusted code run.

## Security controls NOT yet verified

- All container isolation controls (§6.2) — unbuildable until Docker daemon runs.
- Workspace path/symlink/junction containment (Phase 3).
- Controlled integration + conflict detection (Phase 3).

## Active blockers

1. **Docker daemon is DOWN** (`dockerDesktopLinuxEngine` npipe missing). Container isolation
   unusable until Docker Desktop is started. **Blocks Phase 2.**
2. **e2e release gate red** — environmental (website-copy process PID 4364 squats runtime
   identity). Pre-existing; not caused by sandbox. Fix = stop the website copy or run e2e in a
   clean runtime-file environment.

## Important architectural decisions

See `DECISION_LOG.md`. D-001 (Docker-only isolation, fail-closed), D-002 (disabled by
default), D-003 (additive tool registration), D-004 (extend existing SQLite), D-005
(server-injected identity), D-006 (human approval, never self-approval), D-007 (reports under
`.workspace/reports/`), D-008 (no commit/push), **D-009 (audit reuses existing
activity/metrics services via narrow adapter; never a competing logger)**.

## Last successful checkpoint

Phase 1 complete: 13 execution modules + 6 tool contracts + 2 tables + feature flag wired;
40 execution tests green; audit redaction verified; all 74 baseline regression tests unchanged.

## Exact next action

**Ask the user to start Docker Desktop**, then begin **Phase 2** (real Docker isolation adapter

- read-only execution + adversarial sandbox tests). Phase 2 is blocked solely on the daemon.

## Files to inspect before resuming

- `INDEX.md` (navigation)
- `phases/PHASE_1_FOUNDATION.md` (what shipped + evidence)
- `ACTION_TEST_REPORT.md` (validation runs)
- `FAILURE_REGISTER.md` (2 defects found + fixed)
- `DECISION_LOG.md` (D-001..D-009)
- `src/core/execution/index.js` (orchestration) + `audit.js` (redaction)
- `mcp-server.js` (additive wiring) + `src/core/database/sqlite/schema.js` (tables)
