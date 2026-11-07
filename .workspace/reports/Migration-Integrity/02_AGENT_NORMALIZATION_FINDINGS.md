# Report 02: Agent Normalization Warnings & Security Artifact Analysis

**Campaign:** Campaign 8 — Production Migration Integrity Reconciliation & Final Authorization  
**Package:** `local-mcp-memory`  
**Target Version:** `2.6.0`  
**Document Investigated:** `agents` record `62245e58-cce6-4780-b9ba-151ce0dd7016`  
**Date:** 2026-11-06  
**Auditor / Agent:** Google Antigravity  

---

## 1. Executive Summary

During the Campaign 7 dry-run, two warnings were emitted:
```text
62245e58-cce6-4780-b9ba-151ce0dd7016: query operator in "agent_id" coerced to empty
62245e58-cce6-4780-b9ba-151ce0dd7016: query operator in "agent" coerced to empty
```

This report investigates the original MongoDB document, determines why query-operator objects (`{ "$gt": "" }`) were present in scalar fields, performs a global database scan to determine if any other records are affected, and documents the data-preservation mechanism in the migration engine.

The document was proven to be an intentional NoSQL injection vulnerability test payload created on April 14, 2026. Across all **29,831 documents in all 16 collections**, this is the only record containing query operators in scalar fields. Its original raw operator values are preserved in `metadata._migration.coerced`.

---

## 2. Document Forensic Audit

Querying MongoDB for `id: '62245e58-cce6-4780-b9ba-151ce0dd7016'` in the `agents` collection returned:

```json
{
  "_id": "69de51a0d4cd3e636e31862b",
  "id": "62245e58-cce6-4780-b9ba-151ce0dd7016",
  "agent_id": { "$gt": "" },
  "agent": { "$gt": "" },
  "name": "Agent-1",
  "project": "vuln-test-project",
  "role": "worker",
  "status": "active",
  "scope": "private",
  "sessionId": null,
  "capabilities": ["coding", "testing"],
  "createdAt": "2026-04-14T14:39:28.308Z",
  "updatedAt": "2026-04-14T16:20:14.614Z",
  "last_seen": "2026-04-14T16:20:14.614Z",
  "heartbeat_interval_ms": 30000,
  "importance": 3,
  "version": 1,
  "tags": [],
  "metadata": {}
}
```

### Forensic Findings:
1. **Provenance:** The record was inserted into `vuln-test-project` by `tests/vulnerability-test.js` during security hardening against NoSQL injection.
2. **Object Type:** The values are actual embedded BSON subdocuments `{ "$gt": "" }`, not string representations.
3. **Semantic Content:** The query operator `{ $gt: '' }` carries no agent identity or functional name. The natural human-readable identifier is `"Agent-1"` and the primary key is `"62245e58-cce6-4780-b9ba-151ce0dd7016"`.
4. **Relational Impact:** An audit of `vuln-test-project` confirmed that all 5 tasks in the project have `assigned_to: null`. Zero tasks, messages, locks, or sessions reference `{ "$gt": "" }`.

---

## 3. Database-Wide Query Operator Scan

An automated scanner ([`scripts/scan-query-operators.mjs`](file:///C:/Code_Works/HTML_CSS_JS/workProjects/projects/local-mcp-memory/scripts/scan-query-operators.mjs)) audited all 16 collections for objects present in scalar identifier, project, or agent fields (`agent_id`, `agent`, `project`, `id`):

```text
Collection "feedbacks":        0 documents with object in scalar fields
Collection "chat_rooms":       0 documents with object in scalar fields
Collection "memory_versions":  0 documents with object in scalar fields
Collection "resource_locks":   0 documents with object in scalar fields
Collection "project_map":      0 documents with object in scalar fields
Collection "tasks":            0 documents with object in scalar fields
Collection "issues":           0 documents with object in scalar fields
Collection "logs":             0 documents with object in scalar fields
Collection "actions":          0 documents with object in scalar fields
Collection "chat_messages":    0 documents with object in scalar fields
Collection "activity":         0 documents with object in scalar fields
Collection "contexts":         0 documents with object in scalar fields
Collection "messages":         0 documents with object in scalar fields
Collection "metrics":          0 documents with object in scalar fields
Collection "sessions":         0 documents with object in scalar fields
Collection "agents":           1 document (62245e58-cce6-4780-b9ba-151ce0dd7016)
```

**Conclusion:** The vulnerability test artifact is unique. No other document in the production database exhibits this anomaly.

---

## 4. Preservation & Normalization Mechanism

The migration engine's handling in `src/core/migration/mongo-to-sqlite.js` (lines 563-569 and 611-618) was audited:

1. **Detection:** `isQueryOperator(value)` detects keys beginning with `$`.
2. **Metadata Retention:**
   ```javascript
   coerced[sourceKey] = value;
   ```
   The exact BSON subdocument `{ "$gt": "" }` is retained in `metadata._migration.coerced`.
3. **Schema Protection:**
   The text column in SQLite receives an empty string `''` (or fallback default), preventing invalid JSON objects from being written into scalar string columns while strictly satisfying the `NOT NULL` constraint.
4. **Automated Test Coverage:**
   The test in `tests/migration-test.js` (`unmapped fields and coerced values survive in metadata._migration`) asserts that `metaB._migration.coerced.agent_id.$gt` survives roundtrip insertion intact.

---

## 5. Finding & Verdict

**AGENT NORMALIZATION AUDIT: PASSED (INTENDED SECURITY BEHAVIOR)**  
The warning is an expected consequence of historical vulnerability testing. Original data is 100% preserved in structured metadata without corrupting SQLite column types.
