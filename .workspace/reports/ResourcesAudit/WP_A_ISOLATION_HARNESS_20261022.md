# WP-A — Isolation & Contract Verification Harness

**Date:** 2026-10-22
**Baseline commit:** `643fa30` (`main`) — dirty working tree preserved as found
**Scope packet:** `.workspace/reports/ResourcesAudit/RESOURCES_AUDIT_VERIFICATION_20261022.md` (F-03, INV-01, INV-20)
**Evidence convention:** every claim below is labelled **[STATIC]** (read from source/config) or **[RUNTIME]** (observed by executing a suite in this session).

---

## 1. Verdict

**PASS — harness ready; remediation not started.**

The harness reliably detects the cross-project access (F-03) and identity/session contract gaps (INV-01, INV-20) against the real Express app on a loopback ephemeral port with a throwaway SQLite database. It is deterministic across repeated runs, leaks no state into the production runtime, and separates _must-hold_ contract tests from _characterization_ of currently unresolved semantics and from _gap detectors_ that are expected to fail until WP-B.

No production defect was fixed. No production-scope decision (warn-vs-refuse, idempotency, CAS, HTTP auth) was made.

| Question                                      | Answer                                                                                                                 |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Does the harness detect F-03?                 | **PASS (detects it)** — 3 of the 4 open gap assertions are the same missing by-id project filter                       |
| Does the harness detect INV-01 / INV-20 gaps? | **PASS (detects them)** — header scoping ignored; session-bound memory returned cross-session; live session path split |
| Is the harness deterministic?                 | **PASS** — 4 consecutive runs per suite, identical counts and exit codes                                               |
| Is the harness isolated?                      | **PASS** — temp root/DB, `127.0.0.1:0`, env restored, teardown asserted                                                |
| Can WP-B begin?                               | **PASS** — yes, see §11                                                                                                |

---

## 2. Baseline (as found, before WP-A edits)

**[STATIC]** `git rev-parse HEAD` → `643fa30`; branch `main`.
**[STATIC]** The tree was already dirty before this work and was **not** reset, cleaned, stashed, or overwritten. Pre-existing modified files included `mcp-server.js`, `package.json`, `server.js`, `src/core/database/sqlite/schema.js`, `tests/database-integrity-test.js`, `.workspace/*`, `DEVELOPMENT.md`, `PROJECT_ROADMAP.md`; untracked included `resources/`, `src/core/execution/`, `tests/execution-*`, `tools/executionTools.js`, `tests/helpers/`, `.workspace/reports/`.

**[STATIC]** Baseline suites confirmed safe and green earlier in this workstream: `mcp-registry-test` 24/24, `database-integrity-test` 34/34, `execution-policy-test` 24/24, `session-isolation-test` 34/34. The default `npm test` chain was **not** run (it can bind fixed ports / probe a pre-existing server).

**[STATIC]** Pre-existing tooling debt: `comma-dangle` in `.eslintrc.json` (`"never"`) contradicts Prettier `trailingComma: "es5"`. An untouched file (`tests/mcp-registry-test.js`) fails ESLint with **25** `comma-dangle` errors while passing `prettier --check`. This is repo-wide and predates WP-A.

**[RUNTIME]** Safety boundary honoured: the foreign live server on port **3799** was never contacted; the shared 47000–47020 range was never used. All observed listeners were `127.0.0.1:<ephemeral>`.

---

## 3. Scope

**In scope (authorised):**

- A reproducible, isolated test harness that mounts the **real** `server.js` app without `startServer()`.
- Runtime detection of F-03 (cross-project by-id read/update), INV-01 (trusted project header not applied), INV-20 (session-bound memory leak + session resolvability).
- Characterization of ambiguous current semantics without converting them into product decisions.
- Explicit gap detectors that fail while the production gap is open.
- Evidence report; suite wiring; determinism proof; teardown proof.

**Explicitly out of scope (not done):**

- Fixing F-03/INV-01/INV-20 or the two newly observed defects (N1, N2).
- Consolidating the dual memory/route layers.
- Deciding warn-vs-refuse, idempotency, CAS, or HTTP auth posture.
- Backfilling `REPORT_INDEX.md`.
- Staging, committing, pushing, deploying, or adding dependencies.

---

## 4. Verification matrix

Legend: **PASS** = assertion holds; **FAIL** = assertion violated (a real production defect or a broken test); **CHARACTERIZED** = observed behaviour recorded, deliberately not judged; **GAP** = desired invariant asserted, currently violated by production.

### 4.1 `tests/multi-project-isolation-test.js` — 17 passed / 0 failed / 0 gaps — exit 0

| Area     | Assertion                                                | Result        | Evidence |
| -------- | -------------------------------------------------------- | ------------- | -------- |
| Harness  | detectors flag/ignore the right payloads (5 self-checks) | PASS          | RUNTIME  |
| Memory   | scoped memories created for both projects                | PASS          | RUNTIME  |
| Memory   | project-anchored search returns only the owner's records | PASS          | RUNTIME  |
| Memory   | reverse anchoring is symmetric                           | PASS          | RUNTIME  |
| Memory   | `scope=global` visible to every anchored search          | CHARACTERIZED | RUNTIME  |
| Activity | activity entries isolated per project                    | PASS          | RUNTIME  |
| Agents   | agent listings isolated per project                      | PASS          | RUNTIME  |
| Locks    | same resource independently lockable per project         | PASS          | RUNTIME  |
| Locks    | lock listings isolated                                   | PASS          | RUNTIME  |
| Tasks    | task listings isolated                                   | PASS          | RUNTIME  |
| Teardown | every created resource released; request budget held     | PASS          | RUNTIME  |

### 4.2 `tests/isolation-contract-test.js` — 23 passed / 0 failed / 3 gaps — exit 0

| Area          | Assertion                                                                 | Result        | Evidence |
| ------------- | ------------------------------------------------------------------------- | ------------- | -------- |
| Harness       | targets an isolated runtime; shared detectors behave                      | PASS          | RUNTIME  |
| Shapes        | `POST /context`, `GET /context/:id/full`, `POST /context/update` shapes   | PASS          | RUNTIME  |
| Invalid input | missing content rejected; invalid project rejected                        | PASS          | RUNTIME  |
| Invalid input | unknown id update not reported as success; empty update rejected          | PASS          | RUNTIME  |
| Unknown id    | `GET /context/:id/full` → HTTP 200 `{error:"Context not found"}`          | CHARACTERIZED | RUNTIME  |
| Warnings      | concurrent lock → `success:true` + `warnings[]`, update still applied     | CHARACTERIZED | RUNTIME  |
| Session       | `POST /session` persists a row                                            | PASS          | RUNTIME  |
| Session       | `GET /session/current` without id → no session                            | PASS          | RUNTIME  |
| Session       | unknown session id not resolved; heartbeat fails for unknown id           | PASS          | RUNTIME  |
| Session       | live identity path spans two disconnected subsystems                      | CHARACTERIZED | RUNTIME  |
| Session       | **INV-20**: a session created via `POST /session` must be resolvable live | **GAP**       | RUNTIME  |
| Retry         | duplicate primary key fails, never duplicates                             | PASS          | RUNTIME  |
| Retry         | distinct ids stored independently                                         | PASS          | RUNTIME  |
| False success | **`POST /agent/register` must persist a new agent**                       | **GAP** (500) | RUNTIME  |
| False success | `POST /agent/register` currently fails for a new agent                    | CHARACTERIZED | RUNTIME  |
| False success | **`POST /project-map` must persist what it reports as stored**            | **GAP** (500) | RUNTIME  |
| Exceptions    | unanchored search reads across projects (documented contract)             | CHARACTERIZED | RUNTIME  |
| Exceptions    | anchored search does not return foreign `private` records                 | PASS          | RUNTIME  |
| Teardown      | resources released; request budget held                                   | PASS          | RUNTIME  |

### 4.3 `tests/isolation-gap-detectors-test.js` — 1 passed / 4 gaps detected / 1 gap closed — exit 1 (intended)

| ID  | Invariant                                                            | Result                      | Root cause (static)                                            |
| --- | -------------------------------------------------------------------- | --------------------------- | -------------------------------------------------------------- |
| G1  | F-03/INV-02: by-id read must not return a foreign memory             | **GAP**                     | `server.js:994` filters by id only **[STATIC]**                |
| G2  | F-03/INV-02: `POST /context/update` must not modify a foreign memory | **GAP**                     | `server.js:900` filters by id only **[STATIC]**                |
| G3  | F-03/INV-01: trusted `x-mcp-project` header must scope a by-id read  | **GAP**                     | request-scoped project not applied to by-id reads **[STATIC]** |
| G4  | F-03/INV-02: `POST /task/update` must not modify a foreign task      | **CLOSED** (already scoped) | `server.js:1541` **[STATIC]**                                  |
| G5  | INV-20: session-bound memory must not be returned to another session | **GAP**                     | no session filter on `/context/:id/full` **[STATIC]**          |

**Totals:** 7 open gap assertions across 3 suites, tracing to **5 defective code paths**:

1. `GET /context/:id/full` — no project/session filter (`server.js:994`).
2. `POST /context/update` — no project filter (`server.js:900`).
3. `POST /session` — duplicate route; DB-backed handler (`server.js:1074`) shadows the in-memory handler (`server.js:2803`), so `/session/current` (`:2856`) and `/session/heartbeat` (`:2877`) cannot resolve persisted sessions.
4. `POST /agent/register` — 500 on a new agent (`server.js:1286`).
5. `POST /project-map` — 500 on write (`server.js:1877`).

---

## 5. Files changed

| File                                    | Change                        | Notes                                                                                                                                                                  |
| --------------------------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/helpers/isolation-harness.js`    | **new**                       | temp root/DB, env save+restore, `127.0.0.1:0` listener, request client, detectors, `createRunner` (`test`/`characterize`/`gap`), teardown evidence, 100-request budget |
| `tests/multi-project-isolation-test.js` | **rewritten**                 | previously MongoDB-oriented on `localhost:4000`, silently skipped yet reported PASS; now live-runtime, exit 0                                                          |
| `tests/isolation-contract-test.js`      | **new**                       | shapes, invalid input, warnings, live session path, retry, false-success gaps, documented exceptions, teardown                                                         |
| `tests/isolation-gap-detectors-test.js` | **new**                       | G1–G5 regression detectors; exits 1 while gaps remain open                                                                                                             |
| `server.js`                             | **minimal production change** | `const app = express()` → `export const app = express()` with an explanatory comment; behaviour-preserving, required to mount the real app in tests                    |
| `package.json`                          | scripts                       | added `test:isolation`, `test:contract`, `test:gaps`; existing `test` chain untouched                                                                                  |
| `.github/workflows/ci.yml`              | new `isolation` job           | isolation + contract must pass; gap detectors run with `continue-on-error: true` until WP-B closes them                                                                |

No production database, credential, or foreign service was touched. No dependency was added. Nothing was staged or committed.

**[STATIC]** The only runtime-behaviour risk in the production diff is the `export const app` keyword change; `node --check server.js` passes and all suites mount the same object.

---

## 6. Commands executed

```text
git status --porcelain=v1 / git log -1 --oneline            # baseline capture
node tests/multi-project-isolation-test.js                  # exit 0  (17/0/0)
node tests/isolation-contract-test.js                       # exit 0  (23/0/3)
node tests/isolation-gap-detectors-test.js                  # exit 1  (1 pass, 4 gaps, 1 closed) — intended
npm run test:isolation --silent                             # exit 0  (script wiring verified)
npm run test:contract --silent                              # exit 0  (script wiring verified)
npm run test:gaps --silent                                  # exit 1  (script wiring verified; CI step non-blocking)
npx prettier --check <4 new/changed test files>              # exit 0
npx eslint <4 new/changed test files>                        # exit 1 — 88 comma-dangle errors only
npx eslint tests/mcp-registry-test.js                        # exit 1 — 25 comma-dangle errors (baseline proof)
node --check server.js                                       # exit 0
```

`npm test` was **not** run. No command targeted port `3799` or the `47000–47020` range.

---

## 7. Repeatability

All suites were executed four times each (one initial + npm-script run + two determinism runs). Counts and exit codes were identical every time.

| Suite                   | Runs | passed | failed | gaps detected | gaps closed | exit |
| ----------------------- | ---- | ------ | ------ | ------------- | ----------- | ---- |
| multi-project-isolation | 4    | 17     | 0      | 0             | 0           | 0    |
| isolation-contract      | 4    | 23     | 0      | 3             | 0           | 0    |
| isolation-gap-detectors | 4    | 1      | 0      | 4             | 1           | 1    |

**[RUNTIME]** Observed ephemeral ports across runs: `58187`, `61028`, `61040`, `58188`, `61029`, `61042`, `64030`, `58238`, `58243` — all `127.0.0.1`, all distinct, none fixed. No state carried between runs (each run creates and removes its own temp root).

---

## 8. Teardown evidence

The harness returns an evidence object from `close()` and asserts it in both green suites:

| Evidence field          | Asserted by isolation suite | Asserted by contract suite | Observed |
| ----------------------- | --------------------------- | -------------------------- | -------- |
| `listenerClosed`        | yes                         | yes                        | true     |
| `portReleased`          | yes                         | yes                        | true     |
| `databaseClosed`        | yes                         | yes                        | true     |
| `tempRootRemoved`       | yes                         | yes                        | true     |
| `dbFileRemoved`         | yes                         | yes                        | true     |
| `projectRootRemoved`    | yes                         | —                          | true     |
| `envRestored`           | —                           | —                          | true     |
| `requestsIssued <= 100` | yes                         | yes                        | held     |

**[RUNTIME]** Temp roots were created under `%TEMP%` (e.g. `wp-a-isolation-*`, `wp-a-contract-*`, `wp-a-gap-*`) and removed. No `./data`, `users.json`, or user runtime state was read or written.

---

## 9. Gaps exposed (detected, **not fixed**)

### F-03 — cross-project by-id access (INV-01/INV-02)

- `GET /context/:id/full` returns a memory owned by another project when the caller is scoped elsewhere; the trusted `x-mcp-project` header does not change this.
- `POST /context/update` modifies another project's memory by id.
- **Closed already:** `POST /task/update` is project-scoped.

### INV-20 — session identity

- A memory bound to session A is returned to a caller presenting session B (no session filter on by-id read).
- `POST /session` writes the database, but `GET /session/current` and `POST /session/heartbeat` read the in-memory `SessionManager`, which the live route never populates. The session identity therefore does not survive the request path.

### N1 — SQLite adapter silently drops `{ upsert: true }` (newly observed)

**[STATIC]** `src/core/database/sqlite/collection.js:320` `updateOne(filter, update, options)` ignores `options`; `findOne` returns `undefined` on a miss (`:194`).
**[RUNTIME]** Consequence: `POST /agent/register` returns **500** (`Cannot read properties of undefined (reading 'agent_id')`) and persists **0 rows**; `POST /project-map` returns **500** (`... reading 'related_tasks'`) despite the route reporting an upsert. Both are false-success/availability defects, not merely isolation defects.

### N2 — duplicate `POST /session` route shadowing (newly observed)

**[STATIC]** Earlier DB-backed `routeHandler('sessions')` at `server.js:1074` wins over the later in-memory handler at `:2803`.
**[RUNTIME]** Session rows persist (1 row observed) but cannot be resolved live.

### Documented exceptions (recorded as contract, not defects)

- Unanchored `/context/search` reads across projects by design.
- Anchored search does **not** expose foreign `private`-scoped records.
- Concurrent-lock update returns `success:true` + `warnings[]` (the dormant layer would refuse; canonical semantics unresolved — **not decided here**).

---

## 10. Limitations

1. **No fixes.** The suites prove the gaps exist; they do not make WP-B done. A green gap run is not expected until WP-B lands.
2. **Gap suite exits 1 by design.** CI runs it with `continue-on-error: true`; it must be flipped to blocking after remediation.
3. **Lint config conflict is pre-existing and unresolved.** `comma-dangle: never` (ESLint) vs `trailingComma: es5` (Prettier) cannot both hold for multiline literals. The four WP-A files are Prettier-clean and contain **zero** non-`comma-dangle` errors; the untouched `tests/mcp-registry-test.js` shows the identical 25-error class. Fixing the config is out of scope.
4. **Characterizations are not verdicts.** The 7 CHARACTERIZED rows describe current behaviour and deliberately avoid the warn-vs-refuse / HTTP-status / idempotency decisions reserved for a product owner.
5. **Transport coverage is HTTP only.** MCP stdio/SSE paths were not exercised; the suites target the Express API surface where F-03 was reported.
6. **Single-process, single-node.** No multi-worker or concurrent-client stress was performed beyond sequential retry/duplicate-id checks.
7. **Windows host.** Loopback/ephemeral behaviour was verified on Windows; CI (Ubuntu) will exercise the same harness but was not run locally.
8. **`startServer()` deliberately not used.** The harness injects `app.locals.db`; therefore it does not validate startup-time wiring (port reuse, config bootstrap). That is intentional and documented.

---

## 11. WP-B readiness

**READY.** WP-B (remediation) can begin with a trustworthy regression net:

- Every defect it must fix already has a failing detector with a precise cause and file:line.
- Green suites (17 + 23 assertions) will catch regressions in the parts that already work.
- Teardown/port/env isolation means WP-B runs cannot contaminate the live runtime or each other.
- CI wiring exists: isolation and contract are blocking; gap detectors are visible but non-blocking until fixes land.

**Sequencing recommendation for WP-B (not executed here):**

1. Decide the canonical semantics (project scoping on by-id reads/updates, session resolution, warn-vs-refuse, upsert behaviour) — product/architecture decision, not a test decision.
2. Fix `GET /context/:id/full` + `POST /context/update` scoping → closes G1/G2/G3/G5.
3. Resolve the duplicate `/session` route → closes the contract INV-20 gap.
4. Implement or reject `{ upsert: true }` in the SQLite adapter → closes the agent/project-map 500s.
5. Flip `test:gaps` to blocking in CI.

**Not started:** no production fix, no dual-layer consolidation, no `REPORT_INDEX.md` change.

---

## 12. Next action

1. **WP-B start:** obtain the product/architecture decision on canonical scoping and upsert semantics, then implement the five fixes in the order above, re-running `npm run test:gaps` until it exits 0.
2. When the gap suite is green, remove `continue-on-error: true` from the `isolation` job's gap step.
3. Separately (out of WP-A): reconcile ESLint `comma-dangle` with Prettier `trailingComma` repo-wide, and clean up the two scratch probes left in `%TEMP%\opencode`.

---

### Appendix — Harness safety invariants (asserted and documented in code)

- Loopback only; never binds `0.0.0.0` or `::`.
- Ephemeral port only; never `3799`, never `47000–47020`.
- Never reads/writes `./data`, `users.json`, or user runtime state.
- Never probes a pre-running server: it starts its own listener and talks only to `127.0.0.1:<ephemeral>`.
- Never calls `startServer()`; injects `app.locals.db` and owns the listener.
- Saves and restores `MCP_DB_PATH`, `MCP_PROJECT_ROOT`, `MCP_PROJECT`, `MCP_AGENT`.
- Enforces a 100-request budget (below `app.js`'s 120 req/min per-IP limiter).
