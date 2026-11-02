# RESOURCES_AUDIT_VERIFICATION_20261022

Read-only verification audit of the `resources/` knowledge layer plus a risk-prioritized
engineering plan. No fixes were implemented in this run. Report date: 2026-10-22.

---

## 1. Executive Verdict

The `resources/` layer (42 authored files, 11 categories + index) is **structurally sound and
substantially accurate**, but a full re-verification against source/test/CI evidence found:

- **2 confirmed High security/data-integrity findings** in the documented system (not in the
  resources themselves): unauthenticated HTTP core with an all-interfaces bind (F-01) and
  cross-project read/write by ID on unscoped routes (F-03).
- **8 medium/low findings** (F-02, F-04–F-06, F-08, F-12–F-14), several of which are
  _scope gaps_ between what the resources/invariants claim and what the code does.
- **4 invariants materially weakened or contradicted** by runtime/test evidence (INV-01, INV-02,
  INV-13 partial; INV-20 enforcement contradicted).
- **Test coverage of isolation is weak-to-vacuous** and 9+ suites are wired into no npm script
  and no CI workflow; the default `npm test` gate was **not run** in this audit (environment
  fragility) and must not be assumed green.
- **9 documentation-accuracy corrections** identified for `resources/` (Phase 7 list, §11-adjacent),
  all rewording/scope corrections — no durable principle needs rewriting.

**Recommended next work package: WP-A — "Isolation & Contract Verification Harness"
(test-only, no production-code changes).** It is the highest-value _unblocked_ package: it
converts the false confidence of vacuous/legacy isolation suites into real leakage detectors,
and it is the required verification substrate for the follow-on security remediation (WP-B),
which is partially blocked on an HTTP auth-posture product decision. Full ranking in §8,
recommendation + acceptance criteria in §9–§10.

A single file was deleted during this audit: `resources/CODEBASE.md` — an externally generated
compilation the user explicitly authorized removing ("it has served its purpose"). It was
untracked, regenerable, and its removal restores validator-clean state (42 files, 0 errors).

---

## 2. Baseline (captured 2026-10-22)

| Item                        | Value                                                                                                                                                                                   | Evidence                                                                         |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Branch / HEAD               | `main` @ `643fa30`                                                                                                                                                                      | git status                                                                       |
| Divergence                  | 4 commits ahead of origin                                                                                                                                                               | git status (no push performed, none authorized)                                  |
| Working tree                | Dirty — pre-existing modified files (user WIP per `.workspace/TODO.md:110-114`) + untracked `resources/`, `src/core/execution/`, execution tests/tools                                  | git status                                                                       |
| Staging/commits this run    | None                                                                                                                                                                                    | read-only constraint honored                                                     |
| Foreign live server         | PID 3156, port 3799 — the `website\` v2.5.0 copy serving this session (`.workspace/TODO.md:92-97`)                                                                                      | never touched                                                                    |
| Runtime evidence (this run) | `tests/session-isolation-test.js` 34/34, `tests/database-integrity-test.js` 34/34, `tests/mcp-registry-test.js` 24/24, `tests/execution-policy-test.js` 24/24 — all green on 2026-10-22 | controlled side effects only: temp DBs, ephemeral `listen(0)` ports, temp sqlite |
| `npm test` (default gate)   | **NOT run** — e2e leg requires fixed port `3799` and probes a pre-running server (`tests/app-e2e-test.js:23-40`), risking contact with the foreign live server                          | never claim default gate green from this audit                                   |

Subagent investigations (sessions `ses_e9dc2663effeqIX6OD9wN93MLB` dual-layer trace,
`ses_e9dc2663affeqarA9jybWahYru` invariant matrix, `ses_e9dc26637ffeTxoAoCWKGY7D6r`
isolation/security triage) plus independent first-hand re-verification of every High finding
in this report.

---

## 3. Resource Verification

| Check                                                                                 | Result                                                                                                                                                              |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Files on disk                                                                         | 42 (`resources/README.md` + 41 across 11 categories)                                                                                                                |
| Structural validator (frontmatter, H1, fences, relative links, README index coverage) | **42 files, 0 errors** (post-CODEBASE.md removal)                                                                                                                   |
| `resources/CODEBASE.md`                                                               | Externally generated 2026-10-22T06:00:45.282Z, no frontmatter, 163 broken relative links → removed at explicit user instruction (untracked, generated, regenerable) |
| Index consistency                                                                     | README claims 42 files = 42 on disk ✓                                                                                                                               |
| Prettier                                                                              | Clean (verified at authoring time; nothing modified since)                                                                                                          |
| Frontmatter/convention                                                                | All 42 files conform (`last_reviewed` dates present)                                                                                                                |

The layer's _claims_ were verified against code in §4 (invariants), §5 (dual-layer), §6
(coverage), §7 (security); accuracy corrections are itemized in §11.

---

## 4. Invariant Verification Matrix (INV-01…INV-20)

Status legend: VERIFIED (code + runtime or strong static evidence) · PARTIAL (holds in part /
with material exceptions) · CONTRADICTED (documented claim vs observed behavior conflict).

| Invariant                              | Status                                                | Evidence                                                                                                                                                                                                                                                                                                            |
| -------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| INV-01 actor identity at trusted edges | **PARTIAL**                                           | MCP edge injection present (mcp-server.js) **except** `send_message`: `mcp-server.js:2027-2031` spreads `...args` _after_ `from_agent`/`project` → caller overrides identity. HTTP body identity authoritative (`server.js:120-124` pattern). Execution rejects missing identity — runtime-verified (policy suite). |
| INV-02 project scoping                 | **PARTIAL**                                           | MCP path anchored ✓. HTTP search anchored when project supplied (`server.js:844-850`, documented choice). **By-ID routes unscoped**: read `server.js:990-993` (`findOne({id})`, no project filter), write `server.js:906-948` (no caller-project check). Tests claiming enforcement are vacuous (§6).               |
| INV-03 mandatory context snapshot      | **PARTIAL**                                           | Snapshot implemented `src/domains/task/task.service.js:156-164`; **project-map has no versioning** path.                                                                                                                                                                                                            |
| INV-04 version lineage                 | **PARTIAL**                                           | Version rows + FK cascade runtime-verified (db-integrity suite). **No transactions** — version + audit + write are single-shot; 500-after-commit window structural (`server.js:1444` → `:1476-1488`); runtime occurrence suspected, not observed.                                                                   |
| INV-05 SQLite materialization          | **VERIFIED**                                          | Runtime: FTS triggers + read-back, 21 tables, WAL, FK (db-integrity 34/34); 500-on-outage tests (`tests/memory-write-path-test.js:476-479`).                                                                                                                                                                        |
| INV-06 task write-through              | **VERIFIED (code) / wiring gap**                      | Write-through implemented (`memory.service.js:382-398`); no document write gated; FTS-sync trigger exists but unwired.                                                                                                                                                                                              |
| INV-07 registry auth vs core posture   | **PARTIAL (documented-accepted)**                     | Registry guard runtime-proven (401/403 + project boundaries, registry suite). Core HTTP unauthenticated by documented local-first stance — but tension with all-interfaces bind (F-01).                                                                                                                             |
| INV-08 registry credential security    | **VERIFIED (runtime)**                                | Encrypt/decrypt round-trip, fail-closed without secret, masking, scrubSecrets (registry suite 24/24; plaintext warning observed at runtime).                                                                                                                                                                        |
| INV-09 deterministic CAS               | **PARTIAL**                                           | Determinism/monotonicity verified; **live task-create route does not read `idempotencyKey`** (`server.js:1402`) — idempotency exists only on the dormant service path (runtime-proven by db suite via `task.service`).                                                                                              |
| INV-10 storage fail-closed             | **VERIFIED (runtime)**                                | db-integrity 34/34 incl. round-trip on all 21 tables; registry-database 500-on-failure tests.                                                                                                                                                                                                                       |
| INV-11 execution sandbox containment   | **VERIFIED (runtime)**                                | execution-policy 24/24: fail-closed default, identity/project denials, narrow-only permissions.                                                                                                                                                                                                                     |
| INV-12 registry egress safety          | **VERIFIED (runtime)**                                | Circuit breaker, bounded timeout (registry suite). URL-validation gap tracked separately as F-12.                                                                                                                                                                                                                   |
| INV-13 redaction-before-storage        | **PARTIAL**                                           | Execution-audit channel redaction verified; **activity/log routes persist caller-supplied metadata unredacted** (F-05).                                                                                                                                                                                             |
| INV-14 job state discipline            | **VERIFIED (runtime)**                                | Policy suite: all states known, terminal block, illegal transition rejected.                                                                                                                                                                                                                                        |
| INV-15 advertise honesty               | **VERIFIED (static)**                                 | Tool list quotes `listChanged: false` verbatim (mcp-server.js ~:1394-1400). No test asserts the literal — noted as minor gap.                                                                                                                                                                                       |
| INV-16 reset confirmation escalation   | **VERIFIED (scoped)**                                 | Severe literal enforced (`server.js:2728-2741`); moderate/major without confirmation is spec-intended; **endpoint itself unauthenticated** → F-01 blast radius.                                                                                                                                                     |
| INV-17 reset traceability              | **VERIFIED**                                          | Reset action log (`server.js:2951-2968`).                                                                                                                                                                                                                                                                           |
| INV-18 write-failure honesty           | **VERIFIED**                                          | 500 on write failure; no false success.                                                                                                                                                                                                                                                                             |
| INV-19 bounded retry / regen-id        | **VERIFIED (runtime)**                                | Retry-once + ID regeneration (`mcp-server.js:1192-1210`); registry suite retry-once.                                                                                                                                                                                                                                |
| INV-20 session isolation               | **CONTRADICTED (enforcement) / VERIFIED (unit only)** | `SessionIsolationValidator.validateSession` + `filterBySession` (`src/core/session.js:263-297`) are **dead code — never invoked by any HTTP path**; session middleware reads `sessionId` header but validation never engages. Unit suite passes today (34/34) but exercises classes no route calls.                 |

---

## 5. Dual-Layer Comparison

**Two distinct dualities must not be conflated:**

1. **In-repo dual service layer** (the ADR concern): `src/domains/*` + `src/interfaces/api/routes.js`
   - `src/core/mcp/*` vs the live `utils/*Engine.js` + `server.js` routes.
2. **Two-copy deployment** (`.workspace/TODO.md:88-108`, user-confirmed intentional):
   `website\local-mcp-memory` v2.5.0 = live runtime, DO NOT TOUCH; `projects\local-mcp-memory`
   v2.6.0 = this development line. This is a _different_ duality and does **not** conflict with
   the ADR's "in-repo rationale not recoverable" entry — but the resources should reference it
   explicitly to prevent future conflation.

**In-repo layer facts (re-verified):**

- Dormant (unreachable from either entry point): task/memory/issue/project/agent services,
  `src/interfaces/api/routes.js` (`registerAllRoutes` — grep confirms server.js never imports it),
  `src/core/mcp/*` (latent breakage corroborated: `.workspace/TODO.md:116-121` —
  `tool-executor.js:1` imports nonexistent `hasHandler`).
- **Live exceptions to the "src/domains = dormant" shorthand**: chat and feedback services are
  wired via `server.js:1187-1348`; activity/metrics load through the execution-audit path.
- Semantic divergence: collaboration conflict = **warn** (dormant `task.service.js:383-385`) vs
  **refuse** (live `utils/taskEngine.js:159-163`); dormant layer has idempotency + CAS, live
  layer lacks both.
- Roadmap intent exists (`PROJECT_ROADMAP.md` Phase 3: remove dual architecture / unify), but
  consolidation is **blocked on product decisions**: canonical warn-vs-refuse semantics and
  whether dormant-layer idempotency/CAS are required behavior.

---

## 6. Isolation / E2E Coverage Assessment

- `tests/multi-project-isolation-test.js:16` targets a **pre-running `localhost:4000` server and
  direct MongoDB** — legacy, unwired, expected-broken against the SQLite single-process reality;
  its write-leakage assertions (`:176-183`) are vacuous (no failing condition when isolation is
  absent), and it exits green when no server is found.
- `tests/session-isolation-test.js` passes today (34/34) but tests classes **no route invokes**
  (INV-20).
- `tests/app-e2e-test.js` is the only production-path e2e; `:242-243` calls `/context/search`
  **without a project** — it _enshrines_ the unanchored-read behavior; fixed-port design has
  FR-003 port-conflict history and probes pre-running servers.
- The `docs/app.js` dashboard is a **static doc page** — its only `fetch()` is
  `VERSION_SOURCE_URL` (`:989`); `/context/` references (`:339-341`) are documentation strings.
  The code comment citing "the dashboard depends on it" for unanchored reads is therefore stale;
  the only known unanchored consumer is the e2e test itself.
- **Wired into nothing** (no npm script, no CI): multi-project-isolation, session-isolation,
  conflict-detection, chaos, vulnerability, stress, architecture-audit, stdio-stabilization,
  execution-* suites.
- CI executes only: lint, format:check, `npm run check`, `npm test` (= check + feedback + chat +
  mcp-registry + db + e2e; `package.json:84`), package build, and non-blocking
  `npm audit --audit-level=high continue-on-error` (`.github/workflows/ci.yml:33,36,57,78,98-108,129-130`).
  → CI today covers check/feedback/chat + registry security + DB integrity + the single e2e.
- Runtime-verified green today (safe suites): registry 24/24, db-integrity 34/34,
  execution-policy 24/24, session units 34/34.

---

## 7. Security & Data-Integrity Findings

Severity × confidence. Every High was personally re-verified at the cited lines.

| ID         | Severity | Confidence                | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ---------- | -------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| F-01       | **High** | CONFIRMED                 | HTTP core unauthenticated **and** binds all interfaces: `app.listen(allocatedPort)` with no host arg (`server.js:3186`); `optionalAuth` imported (`:142`) but never used; `POST /reset` unauthenticated (`:2715-2741`) — severe gated only by the public literal `MCP_RESET_CONFIRM`, moderate/major/minor require nothing; open registration mints tokens/API keys with caller-chosen permissions (`src/interfaces/api/auth.js:45-75`). Partially mitigated by the documented local-first stance, but the bind-all reality + existing-but-unused auth system + destructive reset reachability justify High. |
| F-03       | **High** | CONFIRMED                 | Cross-project read **and** write by ID: `GET /context/:id/full` `findOne({id})` with no project filter (`server.js:990-993`); `POST /context/update` reads by id and never checks caller project (`:906-948`). Violates INV-02 and the multi-project isolation product promise. No known broken consumers if fixed (dashboard is static; only unanchored consumer is the e2e test).                                                                                                                                                                                                                          |
| F-04       | Medium   | CONFIRMED                 | Unanchored HTTP reads allowed when `project` absent (`server.js:844-850`) — documented, but its stated rationale (dashboard) is stale (§6) and it collides with INV-02's "unscoped product-path queries violate".                                                                                                                                                                                                                                                                                                                                                                                            |
| F-05       | Medium   | CONFIRMED                 | `/activity` and `/logs` persist caller-supplied metadata (actor, IP) and `logError` stores `err.message`/stack **unredacted** — scope gap vs INV-13.                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| F-06       | Medium   | CONFIRMED                 | Session isolation enforcement is dead code (INV-20): `validateSession`/`filterBySession` never invoked; `sessionId` header spoofable.                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| F-14       | Medium   | CONFIRMED                 | INV-01 edge bug: `mcp-server.js:2027-2031` — `...args` spread after `from_agent`/`project` lets an MCP caller override identity/project on `send_message` only. Small, surgical fix.                                                                                                                                                                                                                                                                                                                                                                                                                         |
| F-13       | Medium   | CONFIRMED                 | Open registration + caller-chosen role/permissions nullifies `requireAuth`'s value; **chains into F-12** (registry routes become reachable by any caller who self-registers).                                                                                                                                                                                                                                                                                                                                                                                                                                |
| F-12       | Medium   | Code path CONFIRMED, risk | SSRF surface: registry stores caller URL raw, then proxied credentialed `fetch(url, {headers})` (`proxy.js:224-233`) with timeout + circuit breaker but **no URL validation/allowlist/response-size cap**.                                                                                                                                                                                                                                                                                                                                                                                                   |
| F-08       | Medium   | Structural                | No transactions around version+audit+write; 500-after-commit window. Runtime occurrence suspected, not observed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| F-02       | Low-Med  | CONFIRMED                 | Rate limiter keys on caller-asserted agent header (`server.js:124-128` → `utils/rate-limiter.js`) — spoofable, so per-agent limits are advisory.                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| F-07       | Low      | CONFIRMED                 | Residual: bounded retry on idempotent paths exists; single SQLITE_BUSY retry (`sqlite-adapter.js:699-701`) may surface 500s under transient contention.                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| F-09/10/11 | Positive | Runtime                   | Registry guard 401/403 + encryption-at-rest + fail-closed (24/24); execution sandbox fail-closed (24/24); versioning/FTS/FK (34/34).                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

**No Critical found** (highest reachable impact is bounded by the local-first deployment
posture; the F-13→F-12 chain is the combination to watch if exposure ever widens beyond LAN).

---

## 8. Work-Package Ranking

| Rank  | Package                                                                                                                                                                                 | Security/DI impact                                                              | Evidence confidence                             | Dependency position                                                                                                | Regression risk                 | Verdict                                          |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------- | ------------------------------------------------ |
| **1** | **WP-A — Isolation & contract verification harness** (replace/port Mongo-era + vacuous suites; leakage-failing assertions; wire safe suites into `npm test` + CI; no prod code changes) | Indirect (detection capability; removes false confidence)                       | High (vacuity + no-CI wiring directly observed) | **Prerequisite for WP-B** — no detector exists to validate scoping fixes; e2e currently enshrines unanchored reads | Low (test/CI files only)        | **RECOMMENDED**                                  |
| 2     | WP-B — HTTP trust-boundary & scoping remediation (F-03, F-14 pure enforcement; F-01/F-13/F-12 decision-gated)                                                                           | **Highest (2 Highs)**                                                           | High                                            | Blocked partially on HTTP auth-posture ADR + needs WP-A's detectors                                                | Medium (route behavior changes) | Next after WP-A                                  |
| 3     | WP-C — Dual-layer disposition                                                                                                                                                           | Medium (confusion/maintenance; no runtime exposure — dormant layer unreachable) | Medium                                          | Blocked on product decisions (warn-vs-refuse; idempotency/CAS requirement; unify target)                           | High (blast radius)             | Defer                                            |
| 4     | WP-D — `REPORT_INDEX.md` backfill (14+ unindexed reports)                                                                                                                               | None                                                                            | High                                            | Awaiting explicit authorization                                                                                    | None                            | Cheap, parallel-safe; not a verification blocker |
| 5     | WP-E — Resource accuracy corrections (§11)                                                                                                                                              | None                                                                            | High                                            | Several depend on WP-B decisions                                                                                   | None                            | Follow code decisions, don't precede             |

**Why not WP-B first:** two confirmed Highs are tempting, but (a) it cannot be validated
safely without WP-A's leakage detectors, (b) the existing test surface _enshrines_ the behavior
being fixed (`app-e2e-test.js:242-243`), and (c) its first design step (what "caller project"
means on unauthenticated HTTP) is a product decision the repository cannot answer alone. WP-A is
decision-free, immediately executable, and unblocks everything downstream.

---

## 9. Recommendation — WP-A: Isolation & Contract Verification Harness

**Scope (test/CI only; zero production-code changes):**

1. Replace `tests/multi-project-isolation-test.js` with a spawned-server harness (temp
   `MCP_PROJECT_ROOT`, ephemeral port) whose cross-project **write and read leakage fails the
   test** (no vacuous branches, no exit-0-when-no-server).
2. Repair the non-asserting branch in conflict-detection coverage; characterize warn-vs-block
   explicitly as _current behavior pending canonical-semantics decision_ (do not pick a side).
3. Add clearly-labeled **gap-detector** tests (expected-fail/xfail, non-blocking, enumerated):
   by-ID project scoping (F-03), `send_message` identity injection (F-14), session
   filter wiring (INV-20/F-06). These flip green as WP-B lands.
4. Wire the already-green safe suites into `npm test` + `ci.yml`: new isolation harness,
   conflict-detection, stdio-stabilization (temp root), retry allow-list, execution-policy.
5. Keep every test on temp/ephemeral resources; never probe pre-running servers; never touch
   `data/` user paths or port 3799.

**Prerequisites:** none blocking. **Sequence:** 1→2→4 (green) then 3 (gap detectors) in one PR
series. **Effort:** medium. **Rollback:** revert test/CI files only.

## 10. Acceptance Criteria (WP-A done when)

- [ ] New isolation harness fails when a cross-project write/read leaks (mutation-tested by
      temporarily disabling scoping in a scratch branch, or equivalent proof).
- [ ] No test in the repo can exit 0 without asserting something (grep-verifiable: leak
      branches removed; conflict-detection asserts both paths).
- [ ] `npm test` and CI include: isolation harness, conflict-detection, stdio-stabilization,
      retry allow-list, execution-policy, registry, db-integrity — all green.
- [ ] Gap-detector list documented exactly (F-03, F-14, INV-20 wiring) with links to WP-B.
- [ ] No production file modified; `git status` shows changes only under `tests/`, CI workflow,
      and `.workspace/` notes.
- [ ] The default gate's green status is re-observed (not assumed) in a clean environment.

## 11. Resource-Accuracy Correction List (WP-E scope, itemized)

1. `resources/orchestration/task-model.md` — "Task creates are idempotent under their natural
   key" → split: dormant service implements (runtime-proven), **live route does not**
   (`server.js:1402`).
2. `resources/governance/invariants.md` — INV-01 add HTTP body-authoritative + send_message
   exception; INV-02 "enforced and tested" → enforcement partial, tests vacuous; INV-13 scope
   redaction claim to execution-audit channel (activity/log gap F-05); INV-20 enforcement claim
   → contradicted (dead validator), unit-only.
3. `resources/system-architecture.md`, `architecture/change-guidelines.md`,
   `architecture/extensibility.md` — refine "src/domains = dormant": chat + feedback are live;
   activity/metrics load via execution audit; add the TODO-F1 two-copy deployment distinction.
4. `resources/governance/architectural-decisions.md` — "dual-layer rationale not recoverable"
   → partially recoverable: roadmap Phase 3 unify intent + warn-vs-refuse divergence + TODO F1
   (deployment-level, separate duality).
5. `resources/security/trust-boundaries.md` — B4: note all-interfaces bind (`server.js:3186`)
   vs local-first framing; B5: note SSRF surface (no URL validation on registered servers,
   credentialed egress `proxy.js:224-233`).
6. `resources/security/authentication-authorization.md` — add dated runtime-verified positives
   (registry 401/403) and gaps: dead `optionalAuth` (`:142`), open registration,
   per-process JWT secret, spoofable rate-limit key.
7. `resources/mcp/tool-contracts.md` — add INV-01 send_message identity exception cross-ref.
8. `resources/memory/context-retrieval.md` — annotate that the dashboard rationale for
   unanchored reads is stale (dashboard is static; sole consumer is the e2e test).
9. `resources/reliability/validation-principles.md` — optional: note e2e fixed-port
   environment fragility.

## 12. Uncertainties

- Second-hand (subagent-cited, not personally re-read this run): register route details
  (`auth.js:45-75`), activity/log redaction gap line ranges, commit-window line numbers,
  session-context middleware internals, `memory-write-path-test.js:476-479`. High confidence,
  flagged for WP-B implementer re-verification.
- 500-after-commit window: structural only; runtime occurrence never observed.
- `security-model.md` "reverse proxy guidance" source not re-verified this round.
- `MCP_MASTER_SECRET` unset in the test environment (plaintext warning observed); the live
  `website\` environment's state is unknown.
- Default `npm test` status today: unknown (deliberately not run).
- Pre-existing dirty files are user WIP (`.workspace/TODO.md:110-114`) — not examined for
  overlap with these routes; WP-B must re-check before touching them.
- Whether/when `projects\` → `website\` promotion happens is user-owned and out of scope.

## 13. No-Change Confirmation

- **Not modified:** application code, tests, configs, all 42 resource files, documentation sets,
  CI workflows.
- **Deleted (user-authorized):** `resources/CODEBASE.md` — externally generated compilation,
  untracked, purpose served, regenerable; removal restores validator-clean state.
- **Not created:** `REPORT_INDEX.md` (still awaiting explicit authorization); no root-level files.
- **Not staged, committed, or pushed**; no locks claimed; no destructive commands; no
  user-data/database touched; four test runs used temp resources and ephemeral ports only; the
  foreign live server (port 3799) was never contacted.
- Audit stops at this plan. No work package was implemented.

---

_Report generated 2026-10-22 · read-only audit · evidence references are file:line as observed
on HEAD `643fa30`._
