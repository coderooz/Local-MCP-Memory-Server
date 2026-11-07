# Defect Closure Register and Resolution Evidence

**Audit Date:** 2026-11-06  
**Repository Target:** `C:\Code_Works\HTML_CSS_JS\workProjects\projects\local-mcp-memory`  

---

## 1. Consolidated Defect Matrix

| Defect ID | Description | Severity | Root Cause | Resolution | Verification Test | Status |
|---|---|---|---|---|---|---|
| **DEF-01** | Inconsistent package naming across files | P1 | Fragmented naming (`local-memory-mcp` vs `local-mcp-memory`) | Unified canonical identity to `local-mcp-memory`; kept aliases | `tests/identity-reconciliation-test.js` | **CLOSED** |
| **DEF-02** | SQLite adapter drops `{ upsert: true }` | P1 | `collection.js#updateOne` dropped options argument | Implemented upsert contract in SQLite collection adapter | `tests/isolation-gap-detectors-test.js` | **CLOSED** |
| **DEF-03** | `GET /context/:id/full` cross-project leak | P1 | Filtered by `id` only without project anchor | Added project scoping to by-ID reads | `tests/isolation-gap-detectors-test.js` | **CLOSED** |
| **DEF-04** | `POST /context/update` cross-project mutation | P1 | Filtered by `id` only without project anchor | Added project scoping to updates | `tests/isolation-gap-detectors-test.js` | **CLOSED** |
| **DEF-05** | Duplicate `/session` route shadowing | P2 | Database route shadowed in-memory route | Consolidated session routes and persistence lifecycle | `tests/isolation-contract-test.js` | **CLOSED** |
| **DEF-06** | `POST /agent/register` 500 error on new agent | P1 | SQLite insert failed on missing upsert | Added atomic agent upsert logic | `tests/isolation-contract-test.js` | **CLOSED** |
| **DEF-07** | `POST /project-map` 500 error | P1 | Missing upsert handling on project map | Added atomic project map upsert | `tests/isolation-contract-test.js` | **CLOSED** |
| **DEF-08** | Incomplete `.env.example` documentation | P2 | Only 7 of 47 env vars were documented | Created comprehensive `.env.example` documenting all 47 vars | File inspection & clean install | **CLOSED** |
| **DEF-09** | Table count documentation discrepancy | P3 | Ambiguity between domain tables and catalog tables | Documented 21 domain + 2 FTS5 + 8 shadow = 31 catalog tables | Schema & `sqlite_master` audit | **CLOSED** |
| **DEF-10** | `better-sqlite3` version discrepancy | P3 | Historical notes cited `^11.3.0` | Reconciled documentation to reflect actual `^13.0.3` / `13.0.3` | `package.json` & lockfile audit | **CLOSED** |

---

## 2. Outstanding Gaps and Intentional Invariants

- **GAP-01: Execution Sandbox Phase 1 Invariant (Intentional / P3):**
  - The sandbox deliberately fails closed with `SANDBOX_START_FAILED`. Docker containerization is scheduled for Phase 2.
- **GAP-02: Controlled Publication (Procedural / P3):**
  - Staging and publishing are blocked awaiting user authorization per non-negotiable directive boundaries.
