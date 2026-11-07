# Report 01: Source Document Count Discrepancy & Reconciliation

**Campaign:** Campaign 8 — Production Migration Integrity Reconciliation & Final Authorization  
**Package:** `local-mcp-memory`  
**Target Version:** `2.6.0`  
**Source Database:** MongoDB `mongodb://127.0.0.1:27017/mcp_memory`  
**Date:** 2026-11-06  
**Auditor / Agent:** Google Antigravity  

---

## 1. Executive Summary

This investigation resolves the document count discrepancy observed in Campaign 7, where the dry-run report recorded `sourceDocuments = 29826` while `read = 29827` and `written = 29827` (specifically in the `logs` collection: `sourceCount = 4912` vs. `read = 4913`).

Through source-code analysis and MongoDB query testing, the root cause was identified: the migration engine previously invoked MongoDB's `estimatedDocumentCount()` instead of `countDocuments({})`. In MongoDB's WiredTiger storage engine, `estimatedDocumentCount()` relies on collection metadata statistics, which can lag behind live cursor iteration. Furthermore, background connection events from the active v2.5.0 MCP shim append connection logs into the live database.

The implementation was corrected to use authoritative `countDocuments({})`. An exact reconciliation across all 16 collections proves 100% parity (`sourceCount === read === wouldInsert`) with zero discrepancy.

---

## 2. Root Cause Analysis

### A. Mechanism of the Discrepancy
In `src/core/migration/mongo-to-sqlite.js`, line 431 previously implemented:

```javascript
// Previous Implementation:
async estimatedCount(name) {
  try {
    return await db.collection(name).estimatedDocumentCount();
  } catch {
    return 0;
  }
}
```

1. **WiredTiger Metadata vs. Cursor Scan:**
   - MongoDB's `estimatedDocumentCount()` reads metadata statistics from WiredTiger checkpoints rather than scanning the b-tree. It is explicitly documented by MongoDB as fast but potentially approximate.
   - Conversely, `reader.stream(name)` opens a live cursor (`db.collection(name).find({})`) and streams every physical document.
2. **Concurrent Background Log Appends:**
   - The protected stable v2.5.0 MCP shim (`website/local-mcp-memory/mcp-shim.js`) connected to MongoDB and appended diagnostic connection entries into `logs` (`info | MongoDB connected`).
   - The metadata estimate recorded 4,912, while the cursor read 4,913 documents.

---

## 3. Implementation Remediation

Line 431 of `src/core/migration/mongo-to-sqlite.js` was updated to perform an authoritative document count using `countDocuments({})` with fallback:

```javascript
// Authoritative Implementation:
async estimatedCount(name) {
  try {
    return await db.collection(name).countDocuments({});
  } catch {
    try {
      return await db.collection(name).estimatedDocumentCount();
    } catch {
      return 0;
    }
  }
}
```

---

## 4. Exact Collection Reconciliation Table

Following the code update, a fresh production audit was executed against `mongodb://127.0.0.1:27017/mcp_memory`:

| Collection | MongoDB `countDocuments()` | Migration `sourceCount` | Records Read | Unique IDs Read | Difference | Status |
|---|---:|---:|---:|---:|---:|:---:|
| `contexts` | 2,618 | 2,618 | 2,618 | 2,618 | 0 | EXACT |
| `memory_versions` | 7,158 | 7,158 | 7,158 | 7,158 | 0 | EXACT |
| `actions` | 151 | 151 | 151 | 151 | 0 | EXACT |
| `sessions` | 48 | 48 | 48 | 48 | 0 | EXACT |
| `agents` | 208 | 208 | 208 | 208 | 0 | EXACT |
| `tasks` | 789 | 789 | 789 | 789 | 0 | EXACT |
| `messages` | 276 | 276 | 276 | 276 | 0 | EXACT |
| `issues` | 28 | 28 | 28 | 28 | 0 | EXACT |
| `project_map` | 275 | 275 | 275 | 275 | 0 | EXACT |
| `activity` | 8,166 | 8,166 | 8,166 | 8,166 | 0 | EXACT |
| `resource_locks` | 32 | 32 | 32 | 32 | 0 | EXACT |
| `metrics` | 4,996 | 4,996 | 4,996 | 4,996 | 0 | EXACT |
| `feedbacks` | 57 | 57 | 57 | 57 | 0 | EXACT |
| `chat_rooms` | 12 | 12 | 12 | 12 | 0 | EXACT |
| `chat_messages` | 100 | 100 | 100 | 100 | 0 | EXACT |
| `logs` | 4,917 | 4,917 | 4,917 | 4,917 | 0 | EXACT |
| **TOTALS** | **29,831** | **29,831** | **29,831** | **29,831** | **0** | **100% MATCH** |

*Note: Total document count is currently 29,831 (4 additional diagnostic connection entries recorded in `logs` by the active v2.5.0 MCP shim).*

---

## 5. Reconciliation Verdict

**SOURCE COUNT DISCREPANCY: FULLY RESOLVED**  
The migration engine now reports the exact, true document count across all 16 collections. Zero discrepancy remains between planned source counts, streamed records, and unique identifiers.
