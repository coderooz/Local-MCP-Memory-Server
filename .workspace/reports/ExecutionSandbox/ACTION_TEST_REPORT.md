# ACTION TEST REPORT — Local Execution Sandbox

Append-only validation evidence. Each run is a separate entry; earlier failed runs are never
overwritten by later successful ones.

---

## RUN-001 — Baseline (pre-change)

- **Run ID:** RUN-001
- **Timestamp:** 2026-10-17
- **Git baseline:** `643fa30f734493d2400d6cbc0dbe43e59bf64b86`, 3 pre-existing dirty files.
- **Command:** `npm test` + `npm run check`
- **Scope:** existing suites only.
- **Results:** `check` PASS; feedback 7/7; chat 9/9; mcp-registry 24/24; db 34/34; **e2e 15
  FAIL**.
- **Classification:** e2e failure = **environmental, pre-existing** (website-copy process squats
  runtime identity; MCP memory `08a859b2`). Regression baseline to protect = **74/89 green**.
- **Release gate?** Yes (`npm test`).

## RUN-002 — Phase 1 code compile

- **Run ID:** RUN-002
- **Timestamp:** 2026-10-18
- **Command:** `node --check` on all 20 new/modified files.
- **Result:** all OK.
- **Classification:** pass.
- **Fixes after run:** none.

## RUN-003 — Phase 1 execution suites (first defects)

- **Run ID:** RUN-003
- **Timestamp:** 2026-10-18
- **Command:** `node --test tests/execution-policy-test.js`, `…execution-integration-test.js`,
  `…database-integrity-test.js`.
- **Result:** policy 24/24; integration initially **RED** (`db.collection is not a function`);
  db 34/34.
- **Classification:** functional defect (service-bridge raw `getDb` import).
- **Fix after run:** import wrapped `getDb` from `index.js`; add `queued`→`failed` transition.
- **Re-run:** policy 24/24, integration 11/11, db 34/34 — all green.

## RUN-004 — Audit service integration

- **Run ID:** RUN-004
- **Timestamp:** 2026-10-18
- **Command:** `node --test tests/execution-integration-test.js`
- **Result:** 13/16 — 2 fail (`cancellation must be audited`, redaction row query).
- **Classification:** test + audit-wiring defects.
- **Fixes after run:** (a) cancel a fresh queued job so `execution.cancelled` is emitted;
  (b) filter redaction row in JS (dot-query unsupported by SQLite layer); (c) fixed
  `audit.js` `Object.freeze` paren + import depth.
- **Re-run:** integration **16/16** green.

## RUN-005 — Full Phase 1 validation

- **Run ID:** RUN-005
- **Timestamp:** 2026-10-18
- **Commands + results:**
  - `npm run test:execution` → policy 24/24, integration 16/16.
  - `npm run test:feedback` → 7/7; `test:chat` → 9/9; `test:mcp-registry` → 24/24;
    `test:db` → 34/34.
  - `npm run check` → exit 0.
  - `npx prettier --check` (new files) → PASS.
  - `npm test` (full gate) → e2e 15 FAIL (environmental, unchanged from RUN-001).
- **Regression status:** baseline **74/89 green, unchanged**; +40 new execution tests green.
- **Classification:** Phase 1 pass. e2e failure remains environmental (pre-existing).
- **Release gate?** Phase 1 gate = PASS. Full `npm test` gate still red on e2e (environmental,
  documented, out of sandbox scope).

## RUN-006 — Lint note (informational)

- **Run ID:** RUN-006
- **Timestamp:** 2026-10-18
- **Command:** `npm run lint` (`eslint .`).
- **Result:** 1469 `comma-dangle` errors repo-wide.
- **Classification:** **pre-existing Prettier/ESLint config conflict** (Prettier enforces `es5`
  trailing commas; the ESLint `comma-dangle` rule disagrees). Affects every existing file.
  Not part of `npm test`. New files are Prettier-clean and match repo style.
- **Action:** none (out of scope; would touch unrelated files).
