# WP-B - Canonical Semantics, Isolation Remediation & Regression Closure

**Date:** 2026-10-23
**Baseline:** `main` @ `643fa30`
**Scope:** F-03 by-ID authorization, INV-20 session lifecycle, SQLite `{ upsert: true }` (N1), duplicate `/session` route (N2), regression/CI closure
**Predecessor:** `.workspace/reports/ResourcesAudit/WP_A_ISOLATION_HARNESS_20261022.md`

---

## 1. Executive verdict

**COMPLETE (WP-B bounded scope).**

| Outcome                                                 | Result                                         |
| ------------------------------------------------------- | ---------------------------------------------- |
| Canonical semantics documented from repository evidence | PASS (3 established, 1 partially established)  |
| By-ID project scoping (anchored reads/writes)           | PASS                                           |
| Atomic cross-project mutation refusal                   | PASS                                           |
| Session create/current/heartbeat lifecycle              | PASS                                           |
| SQLite `{ upsert: true }`                               | PASS                                           |
| Agent registration / project-map writes                 | PASS                                           |
| Gap detector suite (`test:gaps`)                        | PASS - **11 assertions, 10/10 closed, exit 0** |
| Previously green suites                                 | PASS - 18 / 28 assertions, exit 0              |
| CI gap step                                             | **BLOCKING**                                   |

**Disclosure:** F-03 is remediated for _anchored_ requests. Unanchored by-ID access remains
permitted by the documented unanchored-read contract
(`resources/memory/context-retrieval.md:44-46`). Closing that residual requires the HTTP
authentication-posture decision (F-01), which is explicitly outside WP-B. WP-B did not guess
that decision and did not claim complete F-03 security remediation.

---

## 2. Initial repository state and safety boundaries

### 2.1 Checkpoint recovery **[STATIC]**

- Branch `main`, HEAD `643fa30 feat: sqlite persistence, mcp registry, auth, dashboard routing`.
- WP-A artifacts present and unchanged at recovery:
  - `.workspace/reports/ResourcesAudit/WP_A_ISOLATION_HARNESS_20261022.md`
  - `tests/helpers/isolation-harness.js`
  - `tests/multi-project-isolation-test.js`
  - `tests/isolation-contract-test.js`
  - `tests/isolation-gap-detectors-test.js`
- Pre-existing working-tree changes were preserved untouched (no reset, clean, stash, restore,
  or overwrite):
  - Modified: `.github/workflows/ci.yml`, `.workspace/LFI/LOGIC_FLOW_INDEX.md`,
    `.workspace/PRI/PROJECT_REFERENCE_INDEX.md`, `.workspace/TODO.md`, `DEVELOPMENT.md`,
    `PROJECT_ROADMAP.md`, `TODO.md` (deleted), `core/config/project-config-loader.js`,
    `mcp-server.js`, `package.json`, `server.js`, `src/core/database/sqlite/schema.js`,
    `tests/database-integrity-test.js`, `tests/multi-project-isolation-test.js`.
  - Untracked: `.workspace/reports/`, `resources/`, `src/core/execution/`,
    `src/interfaces/mcp-tools/execution-tool-definitions.js`,
    `tests/execution-integration-test.js`, `tests/execution-policy-test.js`,
    `tests/helpers/`, `tests/isolation-contract-test.js`,
    `tests/isolation-gap-detectors-test.js`, `tools/executionTools.js`.
- WP-B edits are limited to: `server.js`, `src/core/database/sqlite/collection.js`,
  `utils/memoryEngine.js`, `.github/workflows/ci.yml`, and the four WP-A harness/test files.
  `package.json` was **not** changed in WP-B (the three scripts were added in WP-A).

### 2.2 Safety boundaries

- All runtime evidence was produced against `http://127.0.0.1:<ephemeral>` listeners owned by
  the harness (`http.createServer(app)` on port `0`).
- Temporary SQLite DB and project root under the OS temp directory (`MCP_DB_PATH`).
- The foreign live server on port **3799** was never contacted.
- The **47000-47020** shared port range was never used.
- No production DB, credentials, external services, secrets, or session tokens were accessed.
- No staging, commit, push, deploy, new dependency, or broad security remediation.
- `npm test` was **not** run: its `test:e2e` step defaults to port `3799`
  (`tests/app-e2e-test.js:27`) and writes into the repository `data/` directory. See Section 7.

### 2.3 Baseline (pre-WP-B) **[RUNTIME]**

| Suite                                        | Result                                            | Exit  |
| -------------------------------------------- | ------------------------------------------------- | ----- |
| `node tests/multi-project-isolation-test.js` | 17 passed / 0 failed / 0 gaps (port 58347)        | 0     |
| `node tests/isolation-contract-test.js`      | 23 passed / 0 failed / 3 gaps (port 58346)        | 0     |
| `node tests/isolation-gap-detectors-test.js` | 1 passed / **4 detected / 1 closed** (port 58345) | **1** |

---

## 3. Canonical-semantics decision matrix

| Area                      | Documented rule / evidence                                                                                                                                                                                                                                                                                                                                                                               | Live implementation before WP-B                                                                                                                                                                                                                  | Test evidence                    | Status                                                                                                                                                    | Authorized behavior                                                                                                                                                                                                                                                      |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **By-ID project scoping** | INV-02: "anchored operations are filtered by project ... no cross-project leakage" (`resources/governance/invariants.md:36-46`). Anchor scoping: "Unanchored reads (no anchor) intentionally skip the filter - a documented choice"; "Session scope applies orthogonally" (`resources/memory/context-retrieval.md:34-46`). Request anchor headers defined in `src/core/session/session-context.js:5-18`. | `/context/:id/full`, `/context/:id/connected` fetched by `id` only. `/context/update` fetched by `id` only. `/task/update` filtered by `task_id` only.                                                                                           | WP-A G1-G5; contract by-ID suite | **PARTIALLY ESTABLISHED** - enforcement and unanchored exception are established; a _trusted_ per-request identity does not exist on the HTTP edge (F-01) | Resolve anchor from auth principal -> `x-mcp-project` -> `query.project` -> `body.project`. If present, add project predicate to reads and mutations. If absent, preserve documented unanchored behavior. Session anchor filters reads and refuses cross-session writes. |
| **Session lifecycle**     | INV-20: read filtering + "strict mode _refuses_ cross-session writes" (`invariants.md:179-186`). Session layer owns "session lifecycle and scope filtering" (`resources/architecture/component-responsibilities.md:106`).                                                                                                                                                                                | Two `POST /session` handlers. The handler at ~`:1074` (DB-only) shadowed the complete lifecycle handler at ~`:2803`. `/session/current` and `/session/heartbeat` read only the in-memory `SessionManager`, which the live route never populated. | Contract Part 4; INV-20 gap      | **ESTABLISHED** - memory-authoritative live state with a DB mirror; the later handler is the only one implementing create/current/heartbeat/end           | Remove the shadowing DB-only route. Keep one handler that creates/refreshes the in-memory session and persists it by `session.sessionId`. Resolve current/heartbeat/end from the same manager.                                                                           |
| **Warning vs. refusal**   | INV-06: "overlap/ownership signals never refuse document writes" (`invariants.md:101-112`).                                                                                                                                                                                                                                                                                                              | Live `<collection>/update` path returns `success:true` with `warnings[]` and applies the write.                                                                                                                                                  | Contract Part 3                  | **ESTABLISHED**                                                                                                                                           | No production change. Convert the WP-A characterization into a contract test citing INV-06.                                                                                                                                                                              |
| **SQLite upsert**         | "Registration is an **idempotent upsert**" (`resources/agents/agent-model.md:46,93`). "One entry per (project, path) - upsert, never duplicated" (`resources/projects/project-maps.md:55,76`). "Exactly one descriptor per project (upsert, never duplicated)" (`resources/projects/project-descriptors.md:38,70`).                                                                                      | `Collection.updateOne(filter, update, options)` ignored `options` entirely; returned `{modifiedCount, acknowledged}`. Non-matching upserts inserted nothing, then `findOne` returned `undefined` and routes threw.                               | Contract Parts 6; WP-A N1        | **ESTABLISHED**                                                                                                                                           | Implement Mongo-compatible `{ upsert: true }`: filter equality + `$set`/plain values into an inserted row; `$inc` from 0; `upsertedCount`/`upsertedId`; unchanged when omitted/false.                                                                                    |

**Explicitly not decided by WP-B:** idempotency guarantees beyond registration/project-map,
compare-and-swap or optimistic concurrency, HTTP authentication posture (F-01), the
open-registration -> SSRF chain (F-12/F-13), consolidation of the active and dormant service
layers, and `REPORT_INDEX.md`.

---

## 4. Fixes implemented

### 4.1 SQLite upsert - `src/core/database/sqlite/collection.js`

- Added `buildUpsertDocument()` (`:57`): merges scalar equality filter fields with `$set` /
  plain update values; `$inc` starts at 0; unknown columns are dropped; operator-only filter
  clauses are not representable and are skipped.
- Reworked `Collection.updateOne()` (`:370`):
  - `changes === 0` + `options.upsert === true` -> insert the derived document via
    `insertOne()` (auto id/timestamps preserved).
  - Concurrent insert race (`11000`, mapped from SQLite `UNIQUE`) -> retry the scoped `UPDATE`
    once instead of surfacing a false failure.
  - Return shape is additive and Mongo-compatible:
    `{ acknowledged, matchedCount, modifiedCount, upsertedCount, upsertedId }`.
  - Omitting `upsert` (or `false`) preserves the previous behavior exactly.
- No other operators or adapter semantics were changed.

### 4.2 By-ID project scoping - `server.js`, `utils/memoryEngine.js`

- Added request-scope helpers (`server.js:413-444`):
  - `resolveRequestProject(req)`: authenticated principal (`apiKey.project`, `user.project`)
    -> `x-mcp-project` -> `query.project` -> `body.project`.
  - `resolveRequestSessionId(req)`: `x-mcp-session-id` -> `query.sessionId` -> `body.sessionId`.
  - `buildRequestScope(req)` and `isSessionScopeViolation(document, sessionId)`.
- `GET /context/:id/full` (`server.js:1049`): scoped `findOne({ id, ...projectFilter })`;
  a session mismatch returns the existing `{ error: 'Context not found' }` shape.
- `POST /context/update` (`server.js:951`): scoped pre-read **and** scoped mutation. The
  project predicate is pushed into `updateContextWithVersioning()` (`utils/memoryEngine.js:120`)
  and applied to its `findOne`, `updateOne`, and post-read - no check-then-update gap.
- `GET /context/:id/connected` (`server.js:1073`): scoped root check; the project filter is
  forwarded to `getConnectedContextData()` so linked contexts/tasks/issues/agents cannot leak
  across projects (`utils/memoryEngine.js:350`).
- `POST /task/update` (`server.js:1580`): scoped pre-read, scoped `updateOne`, scoped post-read,
  and cross-session refusal. This path was previously unscoped; the WP-A G3 "closed" result
  was a detector blind spot (see Section 5).
- Caller-controlled body fields cannot widen scope: they can only supply the anchor that is
  then enforced against the stored row.

### 4.3 Session lifecycle - `server.js`

- Deleted the shadowing DB-only `POST /session` handler (formerly ~`:1072-1094`). Evidence for
  keeping the later handler: it is the only implementation wiring `SessionManager`,
  `toDatabaseFormat()`, `/session/current`, `/session/heartbeat`, and `/session/end`; no
  in-repo caller depended on the DB-only contract (searched `dashboard/`, `docs/`,
  `resources/`, tests; the only reference is a static prompt excerpt).
- Added `getActiveDb()` (`server.js:228`): prefers `app.locals.db`, falls back to the module
  handle. `startServer()` sets both before listening (`server.js:3215`), so production
  behavior is unchanged; the harness can inject `app.locals.db` without the startup path.
- Session create (`server.js:2843`) now persists under the authoritative
  `session.sessionId` rather than a possibly-`undefined` request value, and writes the DB
  mirror with `{ upsert: true }`.
- `/session/heartbeat`, `/session/end`, `/sessions/stats`, `/sessions/cleanup`, and
  `/debug/sessions` use the same handle.
- One handler remains per intended route; no duplicate registration.

### 4.4 Test-harness strengthening (test-only)

- `tests/helpers/isolation-harness.js:284`: `detectMutationLeak()` now observes
  `title`, `description`, `status`, and `assigned_to` in addition to memory fields. The
  original field list could not see the `/task/update` mutation, which is why WP-A reported
  G3 closed while the route was unscoped.
- `tests/isolation-gap-detectors-test.js`: added G6-G10 (session lifecycle, cross-session
  write refusal, agent upsert, project-map upsert, connected-context scoping) and one direct
  adapter-contract test for insert-once / update-second / omitted-`false` behavior; updated
  the suite header and CI comment. Request budget: **22 / 100**.
- `tests/isolation-contract-test.js`:
  - Replaced the stale "agent registration fails" characterization with an idempotent-upsert
    test (one row, same id, refreshed name).
  - Replaced the stale "two disconnected session subsystems" characterization with a positive
    create -> current -> heartbeat lifecycle test.
  - Converted the lock characterization into a contract test citing INV-06 (warn + apply).
  - Added positive anchored same-project read and update tests (authorized access preserved).
- `tests/multi-project-isolation-test.js`: added a controlled detector fixture proving a
  changed `title` is reported as a mutation.

No assertion was weakened, skipped, or converted from failure to characterization.

### 4.5 CI gate - `.github/workflows/ci.yml`

- Removed `continue-on-error: true` from the gap-detector step.
- Renamed the job to **Isolation & Regression Harness**.
- Order: `test:isolation` -> `test:contract` -> `test:gaps` (blocking).
- The job installs via `npm ci`, starts no external service, and binds no fixed port.

---

## 5. Findings fixed, partially fixed, and unresolved

| ID                     | Before                                                                                                           | After                                                                                                                                        | Status                                                                                                  |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| **F-03**               | By-ID read/update/connected/task paths ignored the project anchor                                                | Anchored requests are scoped in the query predicate; cross-project mutation refused with no DB change                                        | **PARTIALLY FIXED** - unanchored requests still permitted by documented design; closure depends on F-01 |
| **INV-01**             | Caller body fields could supply the only identity                                                                | Authenticated principal takes precedence when present; request anchor enforced; no trusted HTTP principal mounted (`optionalAuth` not wired) | **PARTIALLY ESTABLISHED** - full trusted identity is F-01                                               |
| **INV-02**             | Unscoped by-ID queries in product paths                                                                          | Scoped predicates on `/context/:id/full`, `/context/:id/connected`, `/context/update`, `/task/update`                                        | **FIXED (targeted paths)**                                                                              |
| **INV-20**             | Session creation persisted a row the live lookup never saw; session-bound memory readable/writable cross-session | One lifecycle; create -> current -> heartbeat resolves; reads filter by session; writes refuse cross-session                                 | **FIXED**                                                                                               |
| **N1**                 | `{ upsert: true }` ignored; agent/project-map 500s                                                               | Upsert implemented; both routes persist and are idempotent                                                                                   | **FIXED**                                                                                               |
| **N2**                 | Duplicate `POST /session`; first shadowed the complete handler                                                   | Shadowing route removed; single authoritative handler                                                                                        | **FIXED**                                                                                               |
| **WP-A G3 blind spot** | Mutation detector could not observe task fields; `/task/update` unscoped                                         | Detector strengthened + route scoped; controlled fixture added                                                                               | **FIXED (test + product)**                                                                              |

---

## 6. Regression mapping (G1-G10)

| Detector | Invariant     | Assertion (response **and** state)                                                        | Pre-fix evidence                                                   |
| -------- | ------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| G1       | F-03 / INV-02 | `/context/:id/full?project=BETA` must not return an ALPHA record                          | Failed in baseline run                                             |
| G2       | F-03 / INV-02 | `/context/update` with `body.project=BETA` must not change content/summary/lifecycle/...  | Failed in baseline run                                             |
| G3       | F-03 / INV-02 | `/task/update` with `body.project=BETA` must not change title/description/status/assignee | Detector weakness masked it; now proven by fixture + baseline code |
| G4       | F-03 / INV-01 | `x-mcp-project: BETA` must scope `/context/:id/full`                                      | Failed in baseline run                                             |
| G5       | INV-20        | Session-bound memory must not be returned to another session header                       | Failed in baseline run                                             |
| G6       | INV-20        | `POST /session` -> `GET /session/current` + heartbeat resolve; one DB row                 | Contract INV-20 gap was open pre-fix                               |
| G7       | INV-20        | Cross-session `/context/update` must not mutate; response must not claim success          | Contract characterization + unscoped code                          |
| G8       | INV-02        | Repeated `/agent/register` -> one row, same id, refreshed values                          | Contract "fails for new agent" gap was open pre-fix                |
| G9       | INV-02        | Repeated `/project-map` -> one (project, path) row, refreshed summary                     | Contract project-map gap was open pre-fix                          |
| G10      | F-03 / INV-02 | `/context/:id/connected?project=BETA` must not return the record; ALPHA must              | Route fetched root unscoped (static)                               |

Every detector reads the SQLite collection after the request; a response-shaped refusal alone
does not pass. The gap suite also contains one direct adapter-contract test (below HTTP)
covering insert-once, update-on-second-call, and omitted/`false` upsert leaving the table
untouched.

---

## 7. Exact commands and results

All runtime commands were executed from the repository root on 2026-10-23.

| Command                                      | Result                                                         | Exit  |
| -------------------------------------------- | -------------------------------------------------------------- | ----- |
| `node tests/multi-project-isolation-test.js` | **18 passed / 0 failed / 0 gaps**                              | 0     |
| `node tests/isolation-contract-test.js`      | **28 passed / 0 failed / 0 gaps**                              | 0     |
| `node tests/isolation-gap-detectors-test.js` | **11 passed / 10 closed / 0 detected / 22 HTTP requests**      | **0** |
| `npm run test:isolation`                     | 18 passed                                                      | 0     |
| `npm run test:contract`                      | 28 passed                                                      | 0     |
| `npm run test:gaps`                          | 11 passed / 10 closed                                          | **0** |
| `node tests/database-integrity-test.js`      | 34 passed / 0 failed                                           | 0     |
| `node tests/session-isolation-test.js`       | 34 pass / 0 fail                                               | 0     |
| `node tests/execution-policy-test.js`        | 24 passed / 0 failed                                           | 0     |
| `node tests/mcp-registry-test.js`            | 24 passed / 0 failed                                           | 0     |
| `node tests/feedback-system-test.js`         | 7 passed / 0 failed                                            | 0     |
| `node tests/chat-system-test.js`             | 9 passed / 0 failed                                            | 0     |
| `npm run check`                              | all `node --check` targets pass                                | 0     |
| `npx prettier --check <changed files>`       | all Prettier-clean                                             | 0     |
| `npx eslint <changed files>`                 | pre-existing repo-wide violations only                         | 1     |
| `node tests/app-e2e-test.js`                 | **NOT RUN** - defaults to foreign port `3799` and repo `data/` | -     |
| `node tests/chaos-additional-test.js`        | **NOT RUN** - fixed `localhost:4000` target                    | -     |
| `npm test`                                   | **NOT RUN** - chain includes `test:e2e` (port 3799)            | -     |

**Lint note:** the repository has a pre-existing ESLint/Prettier conflict
(`comma-dangle`, `indent`, occasional `quotes`) across `server.js` and the SQLite adapter.
Changed line ranges were compared against `git show HEAD:<file>` via `eslint --stdin`; no new
non-`comma-dangle` finding was introduced. One new warning created by deleting the duplicate
route (`SessionModel` unused import) was removed. The pre-existing conflict is recorded as
repo-wide debt, not fixed in WP-B.

---

## 8. Test repeatability

Final-state repeat runs:

| Run | Suite     | Port  | Passed | Failed | Gaps                   | Exit |
| --- | --------- | ----- | ------ | ------ | ---------------------- | ---- |
| 1   | isolation | 50375 | 18     | 0      | 0                      | 0    |
| 1   | contract  | 50384 | 28     | 0      | 0                      | 0    |
| 1   | gaps      | 55167 | 11     | 0      | 0 detected / 10 closed | 0    |
| 2   | isolation | 50397 | 18     | 0      | 0                      | 0    |
| 2   | contract  | 50406 | 28     | 0      | 0                      | 0    |
| 2   | gaps      | 55180 | 11     | 0      | 0 detected / 10 closed | 0    |

Earlier WP-B loops produced the same counts at ports `56070`, `63144`, and `58345-58347`.
All listeners were loopback ephemeral; no port was `3799` or in `47000-47020`. No flake,
ordering dependency, or leftover listener was observed (`teardown: listenerClosed=true
portReleased=true`).

**Regression detection evidence:** the baseline run (Section 2.3) failed **G1, G2, G4, and
G5** against unmodified production code; **G3 falsely passed** because the original mutation
detector could not see task fields. The task-title detector is now validated with a
controlled fixture (`multi-project-isolation-test.js`, Part 0), and the strengthened detector
plus the scoped route close that false negative. No temporary exposure of the real
application was used.

---

## 9. CI gate status

**BLOCKING.**

- `.github/workflows/ci.yml` -> job `isolation` ("Isolation & Regression Harness").
- Steps in order: checkout -> Node (`node-version-file: .nvmrc`) -> `npm ci` ->
  `npm run test:isolation` -> `npm run test:contract` -> `npm run test:gaps`.
- No `continue-on-error` remains on the gap step.
- YAML parsed successfully (`js-yaml`); step list verified with `continue-on-error=false` on
  all three test steps.
- The job depends on no pre-running service and no fixed port.
- Unrelated existing CI jobs (`lint`, `check`, `test`, `build`, `security`) were preserved.

---

## 10. Deviations from the planned scope

1. **`/context/:id/connected` and `/task/update` were remediated** in addition to the two
   named context paths. Both are the same F-03 defect class, both are covered by INV-02, and
   both are now proven by G10/G3. Disclosed rather than bundled silently.
2. **The mutation detector was strengthened** to observe task fields. This is a test-only
   correction of a WP-A false negative; it does not change product semantics.
3. **The lock characterization became a contract test.** INV-06 explicitly establishes
   warn-not-block, so the behavior is no longer "unresolved". No production change.
4. **`updateOne` now returns `matchedCount`** in addition to the previous fields. Additive;
   no caller reads it.
5. **Unanchored by-ID behavior was preserved**, not tightened. Tightening would require an
   F-01 product decision (who the caller is) and would break the documented unanchored-read
   contract and existing callers.
6. **No `REPORT_INDEX.md` update**, no commit/stage/push, no new dependency, no dual-layer
   consolidation.

---

## 11. Remaining security risks and unresolved decisions

| Risk / decision                        | Severity | Why it remains                                                                                                                                                | Smallest safe next action                                                                                                |
| -------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **Unanchored by-ID read/write bypass** | High     | Documented unanchored contract (`context-retrieval.md:44-46`); no authenticated principal on the HTTP edge                                                    | F-01 decision: require an authenticated project anchor for by-ID reads/mutations, then flip unanchored to deny           |
| **`x-mcp-project` is caller-asserted** | High     | No auth middleware mounted (`optionalAuth` exists but is unused); API-key project scoping is dormant                                                          | F-01: mount auth and derive the anchor from the principal, not the header                                                |
| **Session ID is a bearer token**       | Medium   | No authentication/authorization binds a session to a caller                                                                                                   | F-01: bind sessions to authenticated clients; reject unknown/foreign IDs with the same not-found shape                   |
| **Upsert is not a single transaction** | Low      | `UPDATE` then `INSERT`; duplicate-row prevention relies on unique constraints. `agents.agent_id` and `project_map.(project,file_path)` have no unique indexes | Additive unique indexes in a schema work package (INV-14 permits additive indexes); handle pre-existing duplicates first |
| **Session state is process-local**     | Medium   | In-memory manager is authoritative; DB is a mirror. A restart loses live sessions (durable knowledge is unaffected, INV-19)                                   | Document/accept ephemeral sessions, or add a DB-first resume decision                                                    |
| **Dormant layer divergence**           | Medium   | `src/domains/*`, `interfaces/api/routes.js`, `src/core/mcp/*` still encode different warn/refuse and session semantics                                        | Separate consolidation decision; not WP-B                                                                                |
| **F-12/F-13 chain**                    | High     | Open registration -> SSRF path untouched                                                                                                                      | Separate authorized remediation                                                                                          |
| **ESLint/Prettier conflict**           | Low      | Repo-wide `comma-dangle`/`indent` disagreement                                                                                                                | Reconcile config in a formatting-only change                                                                             |

---

## 12. Readiness verdict for the next work package

**WP-B is complete for its authorized boundary. The next package can start.**

Recommended bounded next package: **WP-C - HTTP authentication posture (F-01) and anchor
enforcement**, specifically:

1. Decide and document the HTTP identity model (API key project scope vs. session principal).
2. Mount authentication and derive the by-ID anchor from the principal.
3. Once a trusted anchor exists, decide whether unanchored by-ID reads/mutations are refused;
   add the corresponding detectors and make them blocking.
4. Keep the F-12/F-13 registration/SSRF chain in its own package.

Do not begin F-01, F-12/F-13, dual-layer consolidation, or idempotency/CAS work without
separate authorization.

---

## Appendix A - Files changed in WP-B

| File                                                                       | Change                                                                                                                                                                                                                               |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `server.js`                                                                | Scope helpers; scoped `/context/:id/full`, `/context/:id/connected`, `/context/update`, `/task/update`; removed duplicate `/session`; `getActiveDb()`; session persistence by authoritative id; unused `SessionModel` import removed |
| `src/core/database/sqlite/collection.js`                                   | `buildUpsertDocument()`; `updateOne(..., { upsert: true })`; additive Mongo-like return fields; concurrent-insert retry                                                                                                              |
| `utils/memoryEngine.js`                                                    | `updateContextWithVersioning(scopeFilter)` scoped read/update/post-read; `getConnectedContextData(scopeFilter)` scoped expansion                                                                                                     |
| `.github/workflows/ci.yml`                                                 | Gap step blocking; job renamed; three-step order verified                                                                                                                                                                            |
| `tests/helpers/isolation-harness.js`                                       | Mutation detector observes task fields                                                                                                                                                                                               |
| `tests/multi-project-isolation-test.js`                                    | Task-title detector fixture                                                                                                                                                                                                          |
| `tests/isolation-contract-test.js`                                         | Idempotent agent upsert test; coherent session lifecycle test; INV-06 lock test; positive anchored read/update tests                                                                                                                 |
| `tests/isolation-gap-detectors-test.js`                                    | G6-G10 detectors; direct upsert adapter test; header/comment updated                                                                                                                                                                 |
| `.workspace/reports/ResourcesAudit/WP_B_ISOLATION_REMEDIATION_20261023.md` | This report                                                                                                                                                                                                                          |

Untouched: `package.json`, schema, migrations, dormant service layers, `REPORT_INDEX.md`.

## Appendix B - Evidence classification

- **[STATIC]:** git state, source inspection, documentation citations, diff review, ESLint
  comparison against `HEAD`.
- **[RUNTIME]:** all suite results, port bindings, SQLite post-request state assertions,
  teardown evidence, repeatability runs.
- No runtime claim in this report is based on source inspection alone, and no static claim is
  presented as a passing test.
