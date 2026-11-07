# Defect and Gap Register

**Audit Date:** 2026-11-06  
**Repository:** `C:\Code_Works\HTML_CSS_JS\workProjects\projects\local-mcp-memory`  

---

## 1. Defect & Gap Status Overview

All high and critical severity defects identified in prior campaigns have been resolved and verified by automated tests. Minor residual gaps and intentional boundaries are logged below:

| ID | Category | Severity | Description | Status | Mitigation / Note |
|---|---|---|---|---|---|
| **GAP-01** | Packaging | Low | Working tree has unstaged modifications | Open (Controlled) | Staged release commit deferred pending user release authorization. |
| **GAP-02** | Execution Sandbox | Low / By Design | Sandbox fails closed with `SANDBOX_START_FAILED` | Invariant (Intentional) | Documented Phase 1 safety invariant. Phase 2 containerization roadmap item. |
| **GAP-03** | Auth Secret Warning | Info | `[mcp-registry] WARNING: MCP_MASTER_SECRET is not set` in tests | Handled | Expected warning when environment does not define `MCP_MASTER_SECRET`; plaintext fallback in dev. |
| **GAP-04** | Dual Instance | Procedural | Instance A (v2.5.0) remains active globally | By Mandate | Protects production memory until user decides to migrate via `local-mcp-memory migrate`. |

---

## 2. Resolved Defects Archive

1. **DEF-01: Inconsistent Project Identity**
   - *Resolution:* Reconciled canonical name `local-mcp-memory` across `package.json`, `bin/cli.js`, `agent-instruction.js`, `README.md`, and docs. Automated by `tests/identity-reconciliation-test.js`.
2. **DEF-02: Missing Global Antigravity Access**
   - *Resolution:* Preserved and connected stable v2.5.0 instance via `mcp-shim.js` with verified stdio roundtrip.
3. **DEF-03: Table Count Discrepancy**
   - *Resolution:* Categorized 21 application domain tables, 2 FTS5 virtual tables, and 8 SQLite shadow tables.
4. **DEF-04: Test Suite Port Collisions**
   - *Resolution:* Isolated test ports using ephemeral OS port allocation (`127.0.0.1:0`) and scoped SQLite databases.
