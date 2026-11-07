# Report 02: Campaign 9 Test Evidence Reconciliation

**Project:** local-mcp-memory  
**Version:** 2.6.0  
**Campaign:** Campaign 10 — Final Release Readiness, Production Migration Preflight & Controlled Cutover Authorization  
**Date:** 2026-11-06  
**Auditor:** Google Antigravity  
**Status:** COMPLETE / RECONCILED  

---

## 1. Discrepancy Investigation
Campaign 9 reported:
- `npm run check`: 63 files verified.
- `npm test`: 102 assertions.
- `npm run test:resilience`: 19 assertions.
- `npm run test:isolation`: 18 assertions.
- `npm run test:execution`: 40 assertions.
- Workspace governance: 6 assertions.
- Claimed total: 242+ passing assertions.

However, summing `102 + 19 + 18 + 40 + 6` yields **185**, creating an apparent discrepancy of 57 assertions.

### Root Cause Analysis:
1. **`npm test` Actual Assertions (120 vs 102):**
   `npm test` in `package.json` executes 8 sub-suites:
   - `test:identity` (6)
   - `test:feedback` (7)
   - `test:chat` (9)
   - `test:mcp-registry` (24)
   - `test:conformance` (14)
   - `test:db` (34)
   - `test:e2e` (15)
   - `test:migration` (11)
   The true sum of `npm test` is **120 assertions**, not 102. (120 minus 18 equals 102; historical reporting erroneously subtracted the 18 isolation tests from `npm test`).
2. **Excluded Active Test Suites:**
   In Campaign 4 (`Deployment-Readiness`), the 236-assertion baseline comprised:
   `npm test` (120) + `test:resilience` (19) + `test:execution` (40) + `test:isolation` (18) + `test:contract` (28) + `test:gaps` (11) = **236 assertions**.
3. **Campaign 9 Governance Addition:**
   Campaign 9 added `tests/workspace-governance-test.mjs` (6 assertions).
   Therefore: **236 + 6 = exactly 242 unique passing assertions**.

---

## 2. Comprehensive Reconciled Test Matrix

| Test Suite | Command | Category | Tests/Assertions | Passed | Failed | Skipped | Exit Code |
| :--- | :--- | :--- | ---: | ---: | ---: | ---: | ---: |
| **Syntax Verification** | `npm run check` | Static Analysis | 63 files | 63 | 0 | 0 | 0 |
| **Identity Reconciliation** | `npm run test:identity` | Unit | 6 | 6 | 0 | 0 | 0 |
| **Feedback System** | `npm run test:feedback` | Unit | 7 | 7 | 0 | 0 | 0 |
| **Chat Room System** | `npm run test:chat` | Unit | 9 | 9 | 0 | 0 | 0 |
| **MCP Registry & Crypto** | `npm run test:mcp-registry` | Integration | 24 | 24 | 0 | 0 | 0 |
| **MCP Conformance (SSE/stdio)**| `npm run test:conformance` | Protocol Conformance| 14 | 14 | 0 | 0 | 0 |
| **Database Integrity (SQLite)**| `npm run test:db` | Storage Engine | 34 | 34 | 0 | 0 | 0 |
| **E2E Application & UI** | `npm run test:e2e` | End-to-End | 15 | 15 | 0 | 0 | 0 |
| **Migration Engine Safety** | `npm run test:migration` | Migration & Rollback| 11 | 11 | 0 | 0 | 0 |
| *(Subtotal `npm test`)* | *(Aggregate command)* | *(Core Suite)* | *(120)* | *(120)*| *(0)* | *(0)* | *(0)* |
| **MCP Connection Resilience** | `npm run test:resilience` | Fault Recovery | 19 | 19 | 0 | 0 | 0 |
| **Multi-Project Isolation** | `npm run test:isolation` | Security Boundaries | 18 | 18 | 0 | 0 | 0 |
| **Isolation Contract Verifier**| `npm run test:contract` | Behavioral Contract | 28 | 28 | 0 | 0 | 0 |
| **Isolation Gap Detectors** | `npm run test:gaps` | Invariant Guard | 11 | 11 | 0 | 0 | 0 |
| **Execution Policy Sandbox** | `npm run test:execution:policy` | Security Sandbox | 24 | 24 | 0 | 0 | 0 |
| **Execution Integration** | `npm run test:execution:integration`| Integration Sandbox | 16 | 16 | 0 | 0 | 0 |
| **Workspace Governance** | `node --test tests/workspace-governance-test.mjs` | Governance | 6 | 6 | 0 | 0 | 0 |
| **TOTAL UNIQUE ASSERTIONS** | — | — | **242** | **242** | **0** | **0** | **0** |

---

## 3. Note on Legacy MongoDB Chaos Test
The script `tests/mcp-chaos-resilience-test.js` was audited. It is a legacy v2.5.0 MongoDB test that passes `MONGO_URI=mongodb://127.0.0.1:1/mcp_memory` and asserts that server initialization fails. In v2.6.0, SQLite is embedded and local, so the server initializes successfully without requiring a live MongoDB daemon, causing the legacy negative assertion to fail. It is not part of the `v2.6.0` release suite (`npm run test:resilience` is the authoritative resilience test).
