# Database & Persistence Report

**Audit Date:** 2026-11-05  
**Version:** 2.6.0  
**Storage Engine:** SQLite 3 (`better-sqlite3` v11.3.0)  
**Database File:** `mcp-memory.db`  
**Test Suite:** `tests/database-integrity-test.js` (34 assertions)  

---

## 1. Schema Architecture & Tables

The schema defines **31 database tables** partitioned into domain storage:

1. `contexts` — Persistent memory records
2. `context_versions` — Historical diffs and version history
3. `contexts_fts` — FTS5 virtual table for ranked full-text search
4. `project_descriptors` — Project purpose, stack, rules, constraints
5. `project_descriptors_fts` — FTS5 virtual table for descriptor search
6. `project_maps` — Architectural blueprints & codebase structural maps
7. `tasks` — Work items with dependencies, capabilities, priorities
8. `issues` — Bugs, notes, and blockers
9. `agents` — Registered agent identities and heartbeats
10. `messages` — Direct inter-agent coordination messages
11. `activity` — Live chronological activity stream
12. `resource_locks` — Advisory soft locks with TTL expiry
13. `action_logs` — System audit actions
14. `metrics` — Performance and memory metrics
15. `sessions` — Multi-agent active session state
16. `mcp_servers` — External registered MCP servers
17. `execution_jobs` — Sandbox execution jobs (state machine)
18. `execution_approvals` — Expiring hash-bound approvals
19. `chat_rooms` — Discussion rooms
20. `chat_messages` — Discussion room messages with sequence counter
21. `feedback` — Structured feedback items
22. `users` — PBKDF2 hashed user credentials for dashboard/API
23. `api_keys` — SHA-256 hashed API keys for programmatic access
(Plus internal SQLite indexes, sequence tables, and FTS shadow tables).

---

## 2. Integrity & Concurrency Invariants

- **WAL Mode**: `PRAGMA journal_mode = WAL` allows non-blocking concurrent readers while a write is underway.
- **Foreign Keys**: `PRAGMA foreign_keys = ON` enforces relational integrity. Deleting a context cascades to `context_versions`.
- **FTS5 Triggers**: Automatically update `contexts_fts` on INSERT, UPDATE, or DELETE of `contexts`.
- **Optimistic Concurrency**: Memory updates assert `version === expectedVersion`. Mismatches throw structured `VERSION_CONFLICT` errors rather than silently overwriting.
- **Idempotency**: Unique constraints on `tasks.idempotencyKey` and `execution_jobs.idempotencyKey` ensure repeated identical requests return cached results safely.

---

## 3. Test Suite Verification

Executed: `node tests/database-integrity-test.js`
- `✓ PRAGMA foreign_keys = ON`
- `✓ PRAGMA journal_mode = WAL`
- `✓ PRAGMA integrity_check = ok`
- `✓ PRAGMA foreign_key_check reports no violations`
- `✓ all domain tables exist`
- `✓ both FTS virtual tables exist`
- `✓ FTS sync triggers exist (insert/update/delete x2)`
- `✓ round-trip insert/read/delete on all tables`
- `✓ FK cascade & SET NULL enforcement`
- `✓ BEGIN/ROLLBACK transaction safety`
- Result: **34 passed, 0 failed**.
