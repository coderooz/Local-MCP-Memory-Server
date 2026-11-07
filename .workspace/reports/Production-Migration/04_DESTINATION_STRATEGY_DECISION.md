# Report 04: Destination Strategy Decision & Architecture Evaluation

**Campaign:** Campaign 7 — Production Data Migration & Operational Memory Activation  
**Package:** `local-mcp-memory`  
**Target Version:** `2.6.0`  
**Audit Date:** 2026-11-06  
**Auditor / Agent:** Google Antigravity  

---

## 1. Executive Summary

This report evaluates the three architectural options outlined in Section 7 of the directive for housing migrated production memory:
- **Option A:** Dedicated production SQLite database path (e.g. `mcp-memory-production.db`).
- **Option B:** Existing SQLite database (`mcp-memory.db`) with controlled reconciliation.
- **Option C:** Backed-up replacement of the existing SQLite database.

Based on empirical evidence from the Phase C conflict audit (which proved **0 identifier collisions** between MongoDB and SQLite), this report recommends **Option B (Existing SQLite Database with Controlled Reconciliation)**, while detailing the exact configuration required if Option A is preferred by the user.

---

## 2. Technical Evaluation of Options

### Option A: Dedicated Production SQLite Database Path
*Architecture:* Create a separate SQLite file at `C:\Users\ranit\AppData\Local\local-mcp-memory\mcp-memory-prod.db` for migrated production data.
- **Advantages:**
  - Complete physical separation of test fixtures from production memory.
  - Zero risk of test data being visible in production searches.
- **Disadvantages:**
  - Default CLI commands (`status`, `doctor`, `search`, `store`) and AI clients resolve `mcp-memory.db`.
  - Requires all AI client configurations (Antigravity, Cursor, Opencode, Codex) to permanently pass `MCP_DB_PATH=...` in their environment.
  - Increases operational complexity and divergence from standard package conventions.

---

### Option B: Existing SQLite Database with Controlled Reconciliation (RECOMMENDED)
*Architecture:* Migrate production records into the existing canonical database at `C:\Users\ranit\AppData\Local\local-mcp-memory\mcp-memory.db` using `--resume`.
- **Advantages:**
  - **Zero Identifier Collisions:** The Phase C audit verified that not a single primary or natural key overlaps between the 29,827 MongoDB records and the 31 SQLite test records.
  - **Multi-Project Isolation:** All SQLite test records are scoped to test project names (`chaos-1793886490081`, `local-setup-verification`). All production records are scoped to real development projects (`LocalCart`, `brain-network`, `docs-repo`, `local-mcp-memory`). Multi-project scoping prevents test records from appearing in production project queries.
  - **Canonical Path Compatibility:** Retains standard platform paths without requiring custom `MCP_DB_PATH` overrides in AI client configurations.
  - **Idempotency & Durability:** Supported natively by `mongo-to-sqlite.js` using `INSERT OR REPLACE` and atomic 500-record transactions.
  - **Verified Rollback:** A verified native backup (`.backups/sqlite-pre-migration/mcp-memory-pre-migration.db`, SHA-256 `f4d0d7ca...`) was created prior to any cutover, and the migration engine automatically creates an additional snapshot (`destination-before-migration.db`).
- **Disadvantages:**
  - Requires passing `--resume` flag to acknowledge that the destination currently holds pre-existing schema and test rows.

---

### Option C: Backed-up Replacement
*Architecture:* Delete or rename the existing SQLite database and migrate into a completely empty `mcp-memory.db`.
- **Advantages:**
  - Resulting database contains exclusively production data.
- **Disadvantages:**
  - Destructive to existing verified test records.
  - Violates safety rules unless explicitly approved by the user.
  - Unnecessary given that Option B has 0 identifier collisions.

---

## 3. Decision & Technical Recommendation

```
========================================================================================
RECOMMENDATION: OPTION B (EXISTING SQLITE DATABASE WITH CONTROLLED RECONCILIATION)
========================================================================================
```

Option B is the safest, most maintainable, and standard-compliant strategy:
1. It retains 100% of the canonical paths expected by all MCP clients.
2. It causes zero collisions due to distinct UUID namespaces.
3. It preserves both the test verification baseline and the operational production records under isolated project scopes.
4. It is fully reversible via the verified native backup.

If the user strictly prefers physical database separation, Option A can be executed using `--db-path <path>`.
