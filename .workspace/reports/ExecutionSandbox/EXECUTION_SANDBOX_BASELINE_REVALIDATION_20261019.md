# EXECUTION_SANDBOX_BASELINE_REVALIDATION — PHASE-2 GATE VALIDATION

**Report ID:** EXECUTION_SANDBOX_BASELINE_REVALIDATION_20261019
**Date:** 2026-10-19
**Author:** OpenCode agent (Track K validation session)
**Status:** Final
**Category:** ExecutionSandbox
**Scope:** Fresh repository-grounded validation baseline + Phase-2 gate verification.
**Boundary respected:** Validation only — no Phase-2 implementation, no commit, no push,
no destructive git operation, no process killed or restarted.

---

## A. Session metadata

| Field                       | Value (verified this session, not carried over)                                                                                                                              |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Date                        | 2026-10-19                                                                                                                                                                   |
| Branch                      | `main` (verified twice: session start and session end)                                                                                                                       |
| HEAD                        | `643fa30` — `feat: sqlite persistence, mcp registry, auth, dashboard routing` (unchanged; no commit introduced by this session)                                              |
| Working-tree status (start) | 11 modified/deleted paths + 6 untracked paths (enumerated in §C)                                                                                                             |
| Working-tree status (end)   | identical to start, plus exactly this report (§13 re-check)                                                                                                                  |
| Staged files                | none at any point in this session                                                                                                                                            |
| Docker status               | CLI present (client 29.1.3, API 1.52, context `desktop-linux`); **daemon UNAVAILABLE** (`npipe:////./pipe/dockerDesktopLinuxEngine` not found, `docker version` exit code 1) |
| `npm run check` (fresh)     | PASS, exit 0 (run at session start, again inside `npm test`, and again at session close)                                                                                     |

`git diff --stat` at session start: 11 files changed, 306 insertions(+), 69 deletions(−) —
all pre-existing before this session touched anything.

---

## B. Governance verification

### Documents read (before any repository change)

| Document                                    | Location                                                                                                                                                                                                                                                 | Result                                                                                                                                                                                                                                           |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GOVERNANCE.md` (v1.5)                      | `~/.config/opencode/GOVERNANCE.md` (global — not present at repo root, which is the established convention; no replacement invented)                                                                                                                     | Read                                                                                                                                                                                                                                             |
| `PROJECT_WORKFLOW.md` (v1.2)                | `~/.config/opencode/governance/PROJECT_WORKFLOW.md` (located via the global convention referenced by AGENTS.md; not present at repo root)                                                                                                                | Read                                                                                                                                                                                                                                             |
| `AGENTS.md`                                 | repository root                                                                                                                                                                                                                                          | Loaded (session instructions)                                                                                                                                                                                                                    |
| `.workspace/PRI/PROJECT_REFERENCE_INDEX.md` | repo                                                                                                                                                                                                                                                     | Reviewed in full via line-by-line `git diff` against HEAD plus prior-session authorship; no unexpected delta                                                                                                                                     |
| `.workspace/LFI/LOGIC_FLOW_INDEX.md`        | repo                                                                                                                                                                                                                                                     | Reviewed in full via line-by-line `git diff` against HEAD plus prior-session authorship; no unexpected delta                                                                                                                                     |
| All 11 ExecutionSandbox canonical docs      | `.workspace/reports/ExecutionSandbox/` (`INDEX`, `CURRENT_STATE`, `phases/PHASE_1_FOUNDATION`, `DECISION_LOG`, `ACTION_TEST_REPORT`, `FAILURE_REGISTER`, `BASELINE`, `GAP_ANALYSIS`, `IMPLEMENTATION_PLAN`, `IMPLEMENTATION_LOG`, `CONTINUATION_PROMPT`) | Read (historical evidence preserved, not rewritten)                                                                                                                                                                                              |
| Tracker documents                           | `PROJECT_ROADMAP.md` (full), `.workspace/TODO.md` (structure verified: Part 1 + Part 2), `ENHANCEMENT_PLAN.md` (skimmed), `DEVELOPMENT.md` (targeted check)                                                                                              | Inspected                                                                                                                                                                                                                                        |
| Root `TODO.md`                              | —                                                                                                                                                                                                                                                        | **Does not exist on disk** (recorded as ` D` in git; deleted in the prior TODO-consolidation session; recoverable via `git checkout TODO.md`). Only `.workspace/TODO.md` exists — the "both TODO files exist" conflict condition does not apply. |

### Discrepancies found

1. **`REPORT_INDEX.md` does not exist anywhere in the repository**, although GOVERNANCE.md
   Rule 4 and the enforcement checklist require every report to be indexed there. This gap
   is pre-existing and repo-wide (it equally covers the 11 earlier sandbox reports and the
   GitHub report). Per directive §10-J and §13 (this session's new-file boundary is the
   report plus optional PRI/LFI sync), a partial index was **not** created and broad
   back-indexing was **not** undertaken. Logged as a governance discrepancy requiring a
   user decision (§H item 9).
2. `.workspace/` content is tracked by git in this repository (e.g. `.workspace/TODO.md` is
   a tracked modified file; `.workspace/reports/` shows as untracked, not ignored), while
   GOVERNANCE.md Rule 2 states workspace files are not committed (PRI/LFI excepted).
   Pre-existing repository practice — recorded as an observation only, not modified.
3. Report location/naming for this file (`.workspace/reports/ExecutionSandbox/` +
   `{CATEGORY}_{DESCRIPTOR}_{YYYYMMDD}` form) complies with GOVERNANCE Rules 1–3 and with
   decision D-007.

---

## C. Working-tree protection (three-way classification)

Start snapshot == end snapshot; **this session wrote exactly one repository file** (this
report). Categories:

### 1. Pre-existing / user / prior-session edits — PROTECTED, untouched

| Path                                        | Nature (from `git diff` review)                                                                                                                                                                                          |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `.workspace/LFI/LOGIC_FLOW_INDEX.md`        | Hybrid: (a) pre-existing 2026-10-17 entries — dashboard SPA-hash-routing flow, `/dashboard/*` endpoint row, line-count sync vs commit `643fa30`; (b) 2026-10-18 sandbox Phase-1 entry (`### 15. Execution Sandbox Flow`) |
| `.workspace/PRI/PROJECT_REFERENCE_INDEX.md` | Hybrid: (a) pre-existing 2026-10-17 entries — root line counts, dashboard hash-router docs; (b) 2026-10-18 sandbox Phase-1 entry (`src/core/execution/` section, `executionTools.js`, 25-test-file note)                 |
| `PROJECT_ROADMAP.md`                        | 7 strikethroughs only (14 changed lines vs HEAD); established before this session; protected per BASELINE §1 — this session made no edit                                                                                 |
| `.workspace/TODO.md`                        | Tracker consolidation output (401 lines; 57 unchecked, 0 checked) from the prior consolidation session                                                                                                                   |
| `DEVELOPMENT.md`                            | Removal of the stale root-`TODO.md` file-tree row (line 192), prior consolidation session                                                                                                                                |
| `TODO.md`                                   | Deleted in the prior consolidation session (still recoverable from git)                                                                                                                                                  |

### 2. Phase-1 sandbox changes (uncommitted, verified intact) — PROTECTED

| Path                                                                    | Nature                                                                                                                                      |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `core/config/project-config-loader.js`                                  | `executionSandbox: false` flag (D-002) — diff reviewed this session                                                                         |
| `mcp-server.js`                                                         | 4 additive edits (imports 29–32, `tools/list` spread 1606/1845–1852, dispatch 2834) — verified by targeted inspection                       |
| `src/core/database/sqlite/schema.js`                                    | +2 tables, +9 indexes (additive) — diff reviewed this session                                                                               |
| `tests/database-integrity-test.js`                                      | Deliberate 19→21 table assertion update — diff reviewed                                                                                     |
| `package.json`                                                          | +3 standalone `test:execution*` scripts only; **dependencies/devDependencies unchanged** — `git diff -- package.json` confirms scripts-only |
| `src/core/execution/` (13 files)                                        | Phase-1 implementation — verified present, see §D                                                                                           |
| `src/interfaces/mcp-tools/execution-tool-definitions.js`                | 6 tool schemas                                                                                                                              |
| `tools/executionTools.js`                                               | 6 handlers + dispatcher                                                                                                                     |
| `tests/execution-policy-test.js`, `tests/execution-integration-test.js` | 40 tests                                                                                                                                    |
| `.workspace/reports/ExecutionSandbox/` (11 files)                       | Phase-0/1 evidence (historical, not overwritten)                                                                                            |

### 3. Prior-session tracker/GitHub outputs — PROTECTED

`.workspace/reports/GitHub/GITHUB_ISSUES_MILESTONES_PRS_20261018.md` (untracked, created
in the GitHub-report session).

### 4. New changes made by THIS session

- `.workspace/reports/ExecutionSandbox/EXECUTION_SANDBOX_BASELINE_REVALIDATION_20261019.md`
  (this file) — **and nothing else**. Zero PRI/LFI edits (see §12 rationale below).
- Temp artifact created and removed: `C:\Users\ranit\AppData\Local\Temp\opencode\e2e-iso-20261019`
  (used only for the §G diagnostic; deleted after evidence capture).

---

## D. Phase-1 verification against source (11 controls)

| #   | Control                                         | Verdict       | Evidence (read this session)                                                                                                                                                                                                                                                  |
| --- | ----------------------------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `features.executionSandbox` disabled by default | **CONFIRMED** | `project-config-loader.js` diff: `executionSandbox: false` with D-002 comment                                                                                                                                                                                                 |
| 2   | Docker is the only intended isolation backend   | **CONFIRMED** | `sandbox-adapter.js`: `BACKENDS = { docker: 'docker' }`; `prepare()`/`run()` throw `SANDBOX_START_FAILED` ("not yet implemented (Phase 2)"); `isAvailable()` probes an injected probe, returns false on error                                                                 |
| 3   | No general-purpose shell-execution MCP tool     | **CONFIRMED** | Exactly 6 execution tools (`execution_submit/status/result/list/cancel/approve`, definitions file); repo-wide tool search surfaces only pre-existing `notificationTools.js` PowerShell (UI sound, baseline-documented). No `execute_shell`/`run_command`/`bash` tool anywhere |
| 4   | Caller-supplied identity never authoritative    | **CONFIRMED** | `tools/executionTools.js` builds context from trusted `config.agent`/`config.project` (lines 5, 29–30); flag gate returns `SANDBOX_DISABLED`-style error (line 21)                                                                                                            |
| 5   | Approval hash-bound + self-approval forbidden   | **CONFIRMED** | `approval.js`: canonical binding over `(scriptHash, project, runtime, sorted permissions)` (l.29–37); self-approval rejected at **grant** (l.55) and again at **consume** (l.162); expiry check (l.144); one-shot consume with optimistic `used:0` guard (l.169–185)          |
| 6   | Audit redacted + best-effort                    | **CONFIRMED** | `audit.js`: `SENSITIVE_KEYS` redaction, depth ≤4, strings capped 512, arrays capped 25 (l.43–92); `record`/`recordMetricSafe` wrap in try/catch and return `auditError` instead of throwing (l.110–131, 138–153); reuses `recordActivity`/`recordMetric` only (D-009)         |
| 7   | Fail-closed when sandbox cannot execute         | **CONFIRMED** | `index.js` `executeJob`: `backend.isAvailable()` false → transition to `failed` with `SANDBOX_START_FAILED`, `executed: false`, metric `execution.refused` (l.223–257); adapter stub also throws on `prepare`/`run`                                                           |
| 8   | MCP registration additive                       | **CONFIRMED** | `mcp-server.js`: 4 additive touchpoints (imports 29–32; `tools/list` spread 1606/1845–1852; `EXECUTION_TOOL_NAMES` dispatch 2834; `validateToolArguments` at 1860 runs before dispatch). No existing tool entry modified                                                      |
| 9   | No Phase-2 process execution introduced | **CONFIRMED** | `grep` for `child_process` / `spawn` / `execSync` / `execFile` / `require(` over `src/core/execution/` → **zero matches**; `git diff server.js` → not modified (not even in the dirty set) |
| 10  | No new dependency                               | **CONFIRMED** | `git diff -- package.json` → scripts block only; dependencies/devDependencies identical to HEAD                                                                                                                                                                               |
| 11  | State machine / FR-002 fix intact               | **CONFIRMED** | `state-machine.js`: `failed` reachable from `validating`/`awaiting_approval`/`queued` (l.53–55); terminal absorption intact                                                                                                                                                   |

Supporting reads: `policy.js` (sandbox gate l.76, "may only narrow" l.118, `requiresApproval`
defaults true l.145), `execution-tool-definitions.js` (exactly 6 `name:` entries), full
`schema.js` diff (additive `execution_jobs` + `execution_approvals` with UNIQUE idempotency
index), `database-integrity-test.js` diff (21-table assertion).

**No regression detected. Condition "STOP and produce a regression report" was not triggered.**

---

## E. Test matrix (all results FRESH, executed this session)

| Command                                                                                   | Result                   | Notes                                                                                                                                                                                                                                                                                                               |
| ----------------------------------------------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run test:execution:policy`                                                           | **24/24 PASS**           | matches historical count                                                                                                                                                                                                                                                                                            |
| `npm run test:execution:integration`                                                      | **16/16 PASS**           | includes fail-closed, self-approval, audit redaction/project-scope tests                                                                                                                                                                                                                                            |
| `npm run test:feedback`                                                                   | **7/7 PASS**             |                                                                                                                                                                                                                                                                                                                     |
| `npm run test:chat`                                                                       | **9/9 PASS**             |                                                                                                                                                                                                                                                                                                                     |
| `npm run test:mcp-registry`                                                               | **24/24 PASS**           |                                                                                                                                                                                                                                                                                                                     |
| `npm run test:db`                                                                         | **34/34 PASS**           | 21 domain tables green                                                                                                                                                                                                                                                                                              |
| `npm run check`                                                                           | **PASS, exit 0**         | run 3× this session (start, inside `npm test`, session close)                                                                                                                                                                                                                                                       |
| `npm test` (aggregate)                                                                    | **FAIL, exit 1**         | composition verified: `check && feedback && chat && mcp-registry && db && e2e`. Stages 1–5 all green (74 regression tests pass **inside** the aggregate run); the run fails **solely** at `test:e2e`. Accurate classification: **aggregate red because of the e2e environmental failure; zero non-e2e regressions** |
| `npm run test:e2e` (default environment)                                                  | **FAIL, exit 1**         | 0 of 15 tests ran; `Server failed to become healthy.` at `tests/app-e2e-test.js:145`; boot output contained only the (normal) `MCP_MASTER_SECRET` warning; no `running on port` line                                                                                                                                |
| `npm run test:e2e` with `MCP_PROJECT_ROOT=<clean temp dir>` (diagnostic, non-destructive) | **PASS, exit 0 — 15/15** | server bound `http://127.0.0.1:3799`; full DB→UI contract green; shared runtime files untouched; temp dir removed after capture                                                                                                                                                                                     |

Fresh counts are **identical to the historical Phase-1 evidence** (24+16+7+9+24+34; check 0).
No historical figure was copied without execution; no historical report was rewritten.

**Not run this session (unchanged historical reference only):** `npm run lint`
(1,469 pre-existing `comma-dangle` errors, RUN-006) — deliberately not re-run and not fixed
(directive §10-E).

---

## F. Docker gate (Phase-2 entry condition)

| Item                                             | Result                                                                                                                                                 |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Docker CLI present/absent                        | **PRESENT** — client 29.1.3, API 1.52, Go 1.25.5, context `desktop-linux`                                                                              |
| Docker daemon available/unavailable              | **UNAVAILABLE** — `docker version` cannot reach `npipe:////./pipe/dockerDesktopLinuxEngine` ("The system cannot find the file specified"), exit code 1 |
| Linux container capability verified/not verified | **NOT VERIFIED** — the daemon cannot be queried at all; no container may be built, run, or validated                                                   |
| **Phase-2 gate**                                 | **BLOCKED**                                                                                                                                            |

Per directive §7: no Phase-2 implementation was started, no host-process fallback was
created, no daemon-less execution mode was added, the threat model (D-001/D-002) was not
weakened. Phase 2 remains a separate implementation session.

---

## G. FR-003 status (investigated safely; no process killed)

### Current runtime identity (verified at session start AND after every e2e run)

| File                                                | Content                                                                                                                                                           |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.mcp-runtime.json` (this checkout)                 | `pid=18096`, `port=47005`, `project=local-mcp-memory`, `status=running`, `lastUpdated=2026-10-19T04:45:51.627Z`, `signature=638d3359-b7c9-4e09-8de9-a24726ac5b3e` |
| process behind PID 18096                            | **ALIVE** — `node C:\Code_Works\HTML_CSS_JS\workProjects\website\local-mcp-memory\mcp-server.js` (the website checkout); port 47005 listener owned by 18096       |
| `local-mcp-memory.mcp-runtime.json` (this checkout) | same identity; `lastUpdated=2026-10-19T05:26:00.130Z` — refreshed during this session by the holder while no local `server.js` child existed                      |
| Historical PID 4364                                 | **DEAD / not running** — verified via `Get-Process`/`Get-CimInstance`; explicitly NOT presented as current anywhere in this report                                |

**Inference (labelled, not proven):** PID 18096 is plausibly the MCP-memory server serving
the current agent session (its script path matches the local `origin` remote path, the
project-scoped identity file it refreshes lives in this checkout, and no other local
`server.js` process exists). Per directive §8 it was **not** signalled, stopped, or
restarted at any point.

### Mechanism (diagnosed from source, no destructive action)

1. The e2e test spawns this checkout's `server.js` with `PORT=3799`, a throwaway DB
   (`data/test-app-e2e.db`) and `MCP_PROJECT`/`MCP_SERVER_URL` stripped
   (`tests/app-e2e-test.js:101–111`); it polls health for 45 s (l.133–146).
2. `server.js:3111–3112` resolves the project name back to the default
   `local-mcp-memory`, then `server.js:3118–3138` reads the runtime file, validates it, and
   — because a **foreign, live PID (18096)** holds a valid identity — returns
   `reusedExisting: true` **without ever calling `app.listen`**. This reuse path prints
   nothing, which is why the captured boot output contains no `running on port` line.
3. Nothing listens on 3799 (verified after the run) → the 45 s health poll expires →
   `server boot failed` (`app-e2e-test.js:145`).
4. Identity file resolution follows the project root
   (`core/config/runtime-state.js:66` honors `MCP_PROJECT_ROOT`; `getRuntimeFilePath`
   l.133–143 derives the filename from the project **directory** name), which is why the
   diagnostic run in a clean temp root found no foreign identity and booted normally.

### Classification

```text
ENVIRONMENTAL FAILURE — re-verified empirically this session.
```

- **Not a code regression:** `server.js` and the runtime layer are unmodified
  (`git diff server.js` clean; `server.js` absent from the dirty set); the reuse behavior
  is pre-existing single-instance design.
- **Not a test-infrastructure defect:** the test behaves as designed against an exclusive
  project-identity assumption.
- **Not caused by the sandbox work:** the fail-closed execution subsystem is inert behind a
  disabled flag and never touches boot/runtime code.

### Non-destructive isolation option — VERIFIED this session

`MCP_PROJECT_ROOT=<clean dir> npm run test:e2e` → **15/15 PASS, exit 0**, using only a
repository-supported configuration knob (no code change, no process termination). Evidence
captured (temp files `*.mcp-runtime.json` 250 B + `*.project-mcp.json` 2608 B, both
removed); shared `.mcp-runtime.json` byte-stable (`04:45:51` unchanged, pid 18096 intact);
no listener on 3799 afterwards; no orphan `server.js` children.

**Wiring this into `npm test`/`test:e2e` would be a code change → deferred (user decision).**
The default aggregate `npm test` therefore **remains red** in this session's evidence.
FR-003 stays **OPEN** (environmental), now with a verified workaround recorded.

---

## H. Contradiction reconciliation

| #   | Claim (source)                                                                                                      | Current evidence                                                                                                                                                                      | Classification                                                                                              | Required follow-up                                                                                   |
| --- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| 1   | `INDEX.md`/`CURRENT_STATE.md`/`FAILURE_REGISTER.md`/`CONTINUATION_PROMPT.md` name **PID 4364** as the FR-003 holder | 4364 is dead; PID **18096** (same website checkout) now holds port 47005 and refreshes the identity                                                                                   | Stale transient identity in historical docs (expected drift; append-only history preserved — not rewritten) | Next sandbox status refresh records 18096; do not edit historical reports                            |
| 2   | Roadmap strike: `~~Add proper rate limiting~~`                                                                      | Only the basic `rateLimiter`/`agentRateLimiter` middleware exists (`server.js:141,147`); `ENHANCEMENT_PLAN.md` still lists rate limiting as a limitation                              | **Overstates completeness** ("basic ≠ proper" per known reality)                                            | User re-verifies the strike; roadmap hardening deferred (track G)                                    |
| 3   | `ENHANCEMENT_PLAN.md` "Current State": MongoDB native driver required, no auth, no UI, "50 open issues"             | SQLite is the live persistence, auth + dashboard exist, GitHub shows 85 issues (report of 2026-10-18)                                                                                 | Plan document dated 2026-09-16 predates shipped work; stale planning snapshot                               | Deferred (track G/plan refresh); not corrected this session (§9)                                     |
| 4   | Roadmap `~~Integrated knowledge database~~` struck                                                                  | Not re-verified against source this session                                                                                                                                           | Unverified strike (roadmap treated as untrusted per §9)                                                     | Deferred (track G)                                                                                   |
| 5   | Root `TODO.md` historically marked Audio Notification `[x]`                                                         | Root file absent; consolidated `.workspace/TODO.md` records the `[x]` as **false** (only `play_notification_sound` exists)                                                            | Already reconciled by prior session; no live contradiction                                                  | Track F (feature completion) explicitly deferred                                                     |
| 6   | `optionalAuth` imported in `server.js`                                                                              | Confirmed present-but-unused (`server.js:142`, only the import line matches)                                                                                                          | Confirms auth-coverage gap is still **partial** — consistent with roadmap                                   | Deferred (track G)                                                                                   |
| 7   | GitHub tracker: 0 issues ever closed / 0 PRs merged vs shipped features (commit `643fa30`)                          | From `.workspace/reports/GitHub/GITHUB_ISSUES_MILESTONES_PRS_20261018.md`; no tracker mutation performed                                                                              | Tracker stale relative to code                                                                              | Deferred (track D)                                                                                   |
| 8   | `IMPLEMENTATION_PLAN.md` Phase-1 task text says "all 16 states"                                                     | Shipped `state-machine.js` documents and tests **15 states** (policy suite "all documented states are known" green)                                                                   | Documentation wording mismatch; source of truth = code (15)                                                 | Note only; corrected in future phase-doc refresh                                                     |
| 9   | GOVERNANCE Rule 4 requires `REPORT_INDEX.md` indexing                                                               | No `REPORT_INDEX.md` exists (repo-wide, pre-existing)                                                                                                                                 | **Governance discrepancy** (pre-existing, covers 12 reports)                                                | **User decision:** create + backfill index (broad housekeeping deliberately not performed per §10-J) |
| 10  | `npm run check` is the standard syntax gate                                                                         | Its `node --check` chain predates Phase 1 and covers **neither** `src/core/execution/*` nor `tools/executionTools.js` (they are covered by their own suites + RUN-002 `node --check`) | Gate-scope gap (pre-existing script content)                                                                | Optional: extend `check` script list (package.json change → deferred)                                |

---

## I. Phase-2 readiness decision

```text
BLOCKED — Docker unavailable
```

**Rationale:** the sole Phase-2 entry condition (usable Docker daemon for Linux containers)
is not satisfied — freshly verified, not inherited from historical reports. No regression
exists that would otherwise block (§E), and no governance/state inconsistency blocks the
_gate itself_ (the §H discrepancies are recorded follow-ups, not gate conditions).

---

## PRI / LFI synchronization decision (§12)

**No PRI or LFI edits were made — smallest additive edit possible = zero edits.** The fresh
validation established no durable structural fact genuinely missing from those indexes:

- the `src/core/execution/` layout, `tools/executionTools.js` wiring, and the execution test
  files were already registered in PRI/LFI during the Phase-1 session (2026-10-18 entries,
  re-reviewed line-by-line this session);
- this session's findings (current PID 18096, the e2e runtime-identity mechanism, Docker
  state, test counts, contradiction list) are transient environment/evidence state that
  belongs in this report — not in the structural indexes.

User edits present in both files were therefore left byte-for-byte untouched. This is the
rationale referenced from §C.4.

---

## Phase-1 verification status (summary)

**PHASE 1 VERIFIED INTACT against source** — all 11 controls confirmed (§D), 40 execution
tests green, fail-closed behavior demonstrated by test (`executeJob ALWAYS refuses`) and by
source inspection. Phase 1 remains complete and uncommitted; it was **not** recreated,
modified, or extended this session.

## Compatibility findings

- Zero behavior change for existing clients: feature flag off, additive tool wiring only,
  no existing tool/schema/route modified, `server.js` untouched.
- Regression baseline **74/74 green, unchanged** (fresh) and green _inside_ the failing
  aggregate run.
- SQLite schema additive only (21 tables round-trip; FK/unique/idempotency tests green).
- `npm test` script composition unchanged; the three `test:execution*` scripts are standalone.
- No npm dependency added; ESM-only, no TypeScript, no CommonJS introduced.
- Fresh results match all historical Phase-1 counts — no silent drift.

## Security limitations (explicit)

1. **No container isolation exists or was validated** — Docker daemon down; every §6.2
   control (non-root, read-only rootfs, network-off, resource limits) remains unverified.
2. **No real execution path exists** (fail-closed by design) — that is the intended Phase-1
   posture, not an achieved Phase-2 milestone.
3. Approval→human-principal binding (JWT/API-key) has unit-level guards but no adversarial
   validation yet (planned Phase 3 per DECISION_LOG D-006).
4. Workspace path/junction containment is interface-only (Phase 3).
5. The default `npm test` release gate stays red (environmental) — no full-gate green may
   be claimed.
6. Pre-existing lint debt (1,469 `comma-dangle`) untouched; `MCP_MASTER_SECRET` unset
   warnings observed (plaintext registry credentials at rest) — both pre-existing.

## Governance discrepancies

`REPORT_INDEX.md` missing (Rule 4, pre-existing, §B-1) · workspace-tracked-files practice
(§B-2) · `check` script scope gap (§H-10) · roadmap strike overstatement (§H-2). None
corrected this session; none silently ignored.

## Explicitly deferred work (directive §10)

A — commit/organize Phase-1 work · B — Phase-2 implementation · C — FR-003 "fix" by process
termination · D — GitHub tracker hygiene · E — dependency/lint debt · F — Audio Notification
· G — roadmap hardening · H — ngrok plan · I — architecture cleanup · J — broad
REPORT_INDEX housekeeping · AEOS / OpenCode Skills Refinement material (not this repo's
execution plan).

## Remaining blockers

1. **Docker daemon DOWN** — hard-blocks Phase 2 (F).
2. **Default `npm test` red** — FR-003 environmental identity conflict; verified
   non-destructive workaround exists but is not wired into the gate (user decision) (G).
3. Governance index gap (`REPORT_INDEX.md`) — user decision (§H-9).

## Exact recommended next action

```text
START DOCKER DESKTOP, THEN RE-VERIFY PHASE-2 GATE
```

(Secondary user decisions recorded, not gating this recommendation: whether to wire the
verified `MCP_PROJECT_ROOT` isolation into the e2e gate, and whether to create/backfill
`REPORT_INDEX.md`.)

---

## Session safety attestation

- No git commit · No push · No `reset`/`clean`/`checkout --`/`restore`/`stash` · nothing staged.
- No process killed, terminated, or restarted — only read-only inspection
  (`Get-Process`/`Get-CimInstance`/`Get-NetTCPConnection`).
- No npm dependency added; no CommonJS/TypeScript; no shell-execution tool introduced.
- D-001 … D-009 unchanged and re-verified (§D).
- Phase 2 not implemented, not validated, not claimed.
- e2e success claimed **only** for the isolated diagnostic run (15/15, observed); the
  default gate is recorded as failing.

## Revision History

| Version | Date       | Changes                                                                                                                                               |
| ------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.0     | 2026-10-19 | Initial creation — fresh baseline, Phase-2 gate verdict `BLOCKED — Docker unavailable`, FR-003 re-diagnosis + verified non-destructive isolation knob |
