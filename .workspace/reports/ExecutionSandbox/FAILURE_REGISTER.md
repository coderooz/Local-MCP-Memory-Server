# FAILURE REGISTER — Local Execution Sandbox

Stable IDs for material failures. Confirmed root causes vs hypotheses are distinguished.

---

## FR-001 — `db.collection is not a function` (integration suite)

- **Date first observed:** 2026-10-18
- **Phase:** 1
- **Severity:** High (blocked integration suite)
- **Reproduction:** run `tests/execution-integration-test.js`; `submitJob` throws
  `db.collection is not a function`.
- **Expected:** job submission persists to `execution_jobs`.
- **Actual:** TypeError on first DB access.
- **Root cause (CONFIRMED):** `service-bridge.js` imported the raw `getDb` from
  `src/core/database/sqlite/connection.js`, which returns the low-level handle without the
  `.collection()` wrapper. The execution repository expects the collection-wrapped DB from
  `src/core/database/sqlite/index.js`.
- **Evidence:** stack trace pointing at `connection.js` `getDb`; switching the import fixed it.
- **Fix:** import `getDb` from `index.js` (collection-wrapped).
- **Fix outcome:** resolved — integration suite green.
- **Regression test:** integration suite covers submission against a real DB.
- **Status:** CLOSED.
- **Remaining risk:** none.

## FR-002 — `queued` job could not reach `failed` (stuck state)

- **Date first observed:** 2026-10-18
- **Phase:** 1
- **Severity:** Medium (liveness, not security)
- **Reproduction:** submit a pre-approved task (→ `queued`), then call `executeJob` (which
  fails closed → `failed`).
- **Expected:** `queued` → `failed` allowed.
- **Actual:** `INVALID_STATE_TRANSITION`.
- **Root cause (CONFIRMED):** the state-machine transition table omitted `failed` from the
  allowed successors of `validating`/`awaiting_approval`/`queued`, so a job that could not start
  was permanently stuck.
- **Evidence:** `state-machine.js` table; adding the edge fixed it.
- **Fix:** allow `failed` from `validating`, `awaiting_approval`, `queued`.
- **Fix outcome:** resolved — fail-closed path now reaches `failed` and is audited.
- **Regression test:** integration "executeJob ALWAYS refuses" + audit tests.
- **Status:** CLOSED.
- **Remaining risk:** none (fail-closed semantics preserved).

## FR-003 — e2e release gate red (environmental, PRE-EXISTING)

- **Date first observed:** before this task (documented in MCP memory `08a859b2`).
- **Phase:** n/a (environment)
- **Severity:** High for the `npm test` gate; **not caused by the sandbox**.
- **Reproduction:** `npm run test:e2e` → "Server failed to become healthy."
- **Expected:** spawned server binds its test port and reports health.
- **Actual:** spawned server defers to an already-running runtime identity; no health on the
  test port.
- **Root cause (CONFIRMED):** a live process — **PID 4364**,
  `C:\…\website\local-mcp-memory\mcp-server.js`, project `local-mcp-memory`, port 47005 — holds
  the runtime identity declared in `.mcp-runtime.json` and
  `local-mcp-memory.mcp-runtime.json`. The e2e-spawned server sees a valid runtime for the same
  project with a live foreign PID and returns `reusedExisting` without binding the test port.
- **Evidence:** `git diff server.js` is CLEAN (sandbox never touched boot/runtime-recovery);
  runtime files point at PID 4364 (website copy); same failure documented 10 sessions ago.
- **Attempted fixes:** none — deliberately NOT debugged (out of scope per prior decision
  `08a859b2` and directive: do not kill the user's other project's process).
- **Fix outcome:** unresolved (environmental).
- **Regression test:** n/a.
- **Status:** OPEN — **environmental blocker, not a sandbox defect.**
- **Remaining risk:** `npm test` aggregate gate stays red until the website-copy process is
  stopped or e2e runs in a clean runtime-file environment. **Phase 2 release must not claim
  full `npm test` green while this persists.**
