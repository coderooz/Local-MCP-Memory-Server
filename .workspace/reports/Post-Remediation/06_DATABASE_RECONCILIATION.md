# Database Reconciliation: SQLite Architecture vs MongoDB Legacy

**Date:** 2026-11-06  
**Authoritative Engine:** SQLite 3 via `better-sqlite3` v13.0.3  
**Legacy Store:** MongoDB Native Driver (v2.5.0)  

---

## 1. Architectural Evolution

In v2.5.0, `local-mcp-memory` operated against a local MongoDB daemon requiring a separate service process, non-embedded network sockets, and manual index setup.

In v2.6.0, the core persistence layer was completely redesigned around embedded SQLite with `better-sqlite3`:
1. **Zero External Daemon:** Operates strictly within the Node process memory space; no background database daemon required.
2. **WAL Journaling Mode:** Uses Write-Ahead Logging (`PRAGMA journal_mode = WAL`) providing high concurrent read throughput alongside non-blocking writes.
3. **Strict Foreign Keys:** Foreign key constraints enforced by default (`PRAGMA foreign_keys = ON`).
4. **Synchronous Mode:** Configured with `PRAGMA synchronous = NORMAL` and `busy_timeout = 5000` for crash-resilience.
5. **Full-Text Search:** Integrated SQLite FTS5 extension with automated trigger-based synchronization.

---

## 2. Table Catalog Reconciliation

The catalog contains **31 total tables** in `sqlite_master`:

### 2.1 Domain Application Tables (21 tables)
1. `contexts` — Persistent memory records and key-value entries.
2. `memory_versions` — Historical snapshots and versions of memory records.
3. `actions` — Action logs recorded by participating agents.
4. `sessions` — Active collaboration and agent sessions.
5. `agents` — Registered agent metadata, heartbeat status, and capabilities.
6. `tasks` — Work items with assigned agents, status, and idempotency keys.
7. `messages` — Inter-agent direct messages.
8. `issues` — Impediments, bugs, and resolution status.
9. `project_map` — Project architectural hierarchy and components.
10. `activity` — Chronological activity events.
11. `resource_locks` — Resource soft locks with timeout and agent leases.
12. `metrics` — Performance and execution metrics.
13. `feedbacks` — Feedback submissions with triage status.
14. `chat_rooms` — Multi-agent discussion rooms.
15. `chat_messages` — Discussion room messages with sequence counters.
16. `logs` — System operational logs.
17. `emulators` — Testing emulator state tracking.
18. `connections` — Port registry and peer connections.
19. `mcp_servers` — Upstream MCP server registrations and configs.
20. `execution_jobs` — Script execution jobs.
21. `execution_approvals` — Approval status for privileged executions.

### 2.2 FTS5 Virtual Tables (2 tables)
1. `contexts_fts` — Full-text index for `contexts` table.
2. `project_map_fts` — Full-text index for `project_map` table.

### 2.3 SQLite FTS5 Internal Auxiliary Shadow Tables (8 tables)
- `contexts_fts_data`, `contexts_fts_idx`, `contexts_fts_content`, `contexts_fts_docsize`, `contexts_fts_config`
- `project_map_fts_data`, `project_map_fts_idx`, `project_map_fts_content`, `project_map_fts_docsize`

---

## 3. MongoDB to SQLite Query Builder Compatibility

The SQLite adapter layer (`src/core/database/sqlite/`) provides full compatibility with MongoDB query syntax:
- **Operators:** `$eq`, `$ne`, `$gt`, `$gte`, `$lt`, `$lte`, `$in`, `$nin`, `$and`, `$or`, `$regex`.
- **Update Operators:** `$set`, `$inc`, `$unset`.
- **Custom Functions:** Custom `REGEXP` user-defined function registered with SQLite engine to support JavaScript RegExp flags and patterns.
- **Transactions:** Native `BEGIN`, `COMMIT`, `ROLLBACK` integration with savepoints.

---

## 4. Verification Evidence

The automated database integrity test suite (`tests/database-integrity-test.js`) executes 34 targeted assertions covering:
- Foreign key constraint rejection and cascading deletes.
- Unique index violation error code mapping (mapped to MongoDB-compatible error code 11000).
- FTS5 indexing, reindexing, and trigger deletions.
- Sequence incrementation and atomic operations.
- 34/34 assertions passed.
