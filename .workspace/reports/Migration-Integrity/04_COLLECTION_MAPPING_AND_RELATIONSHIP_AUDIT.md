# Report 04: Collection Mapping & Relationship Integrity Audit

**Campaign:** Campaign 8 — Production Migration Integrity Reconciliation & Final Authorization  
**Package:** `local-mcp-memory`  
**Target Version:** `2.6.0`  
**Date:** 2026-11-06  
**Auditor / Agent:** Google Antigravity  

---

## 1. Executive Summary

This report delivers the mapping and relational integrity audit across all 16 production collections migrating from MongoDB to SQLite. It documents key resolution mechanics, foreign-key alignments, and clarifies why 5 of the 21 SQLite domain tables have no corresponding source collection in the production MongoDB database.

Every relationship required by the application runtime is preserved with referential integrity.

---

## 2. Mapping & Relationship Matrix across 16 Source Collections

| # | MongoDB Collection | Destination SQLite Table | Primary Identifier Mapping | Relational Foreign Key | Project Scoping Rule |
|---|---|---|---|---|---|
| 1 | `contexts` | `contexts` | `id` -> `id` (PK) | Parent to `memory_versions` | Direct (`doc.project`) |
| 2 | `memory_versions` | `memory_versions` | `id` -> `id` (PK) | `context_id` references `contexts(id)` | Inherited from context |
| 3 | `tasks` | `tasks` | `id` / `task_id` -> `id` (PK) | Self-contained; links in `relatedContexts` | Direct (`doc.project`) |
| 4 | `activity` | `activity` | `id` / `activity_id` -> `id` (PK) | Links to `related_task` if present | Direct (`doc.project`) |
| 5 | `messages` | `messages` | `id` / `message_id` -> `id` (PK) | Direct agent-to-agent | Direct (`doc.project`) |
| 6 | `project_map` | `project_map` | `id` / `map_id` -> `id` (PK) | Self-contained file architecture graph | Direct (`doc.project`) |
| 7 | `actions` | `actions` | `id` -> `id` (PK) | References contexts in `contextRefs` | Direct (`doc.project`) |
| 8 | `agents` | `agents` | `id` / `agent_id` -> `id` (PK) | Registered agent principal | Direct (`doc.project`) |
| 9 | `chat_rooms` | `chat_rooms` | `room_id` / `id` -> `room_id` (PK) | Parent to `chat_messages` | Direct (`doc.project`) |
| 10| `chat_messages` | `chat_messages` | `message_id` / `id` -> `message_id` (PK) | `room_id` references `chat_rooms(room_id)` | Inherited from room |
| 11| `feedbacks` | `feedbacks` | `feedback_id` / `id` -> `feedback_id` (PK) | Links to contexts/tasks in JSON arrays | Direct (`doc.project`) |
| 12| `issues` | `issues` | `id` / `issue_id` -> `id` (PK) | Self-contained issue/blocker | Direct (`doc.project`) |
| 13| `logs` | `logs` | `id` -> `id` (PK) | System diagnostic stream | Global / context-bound |
| 14| `metrics` | `metrics` | `id` / `metric_id` -> `id` (PK) | Performance metrics | Direct (`doc.project`) |
| 15| `resource_locks` | `resource_locks` | `id` / `lock_id` -> `id` (PK) | Unique on `(project, resource, locked_by)` | Direct (`doc.project`) |
| 16| `sessions` | `sessions` | `id` -> `id` (PK) | Live session token & heartbeat | Direct (`doc.project`) |

---

## 3. Relational Resolution Mechanics

### A. Contexts & Memory Versions
- **Integrity Status:** 100% Valid (0 Orphans).
- All 7,158 records in `memory_versions` point to an existing `context_id` in `contexts`.
- Foreign key constraint: `FOREIGN KEY (context_id) REFERENCES contexts(id) ON DELETE CASCADE`.

### B. Chat Rooms & Chat Messages
- **Dynamic Name Resolution:**
  - In v2.5.0 MongoDB, all 100 `chat_messages` stored room names (`room_id: 'test-room'`) rather than UUIDs.
  - The migration engine dynamically maps room names to room UUIDs (`context.roomIds.set(row.name, id)`).
  - During dry-run and synthetic rehearsal, all 100 messages resolved cleanly to their parent room UUID.
- Foreign key constraint: `FOREIGN KEY (room_id) REFERENCES chat_rooms(room_id) ON DELETE SET NULL`.

---

## 4. Audit of Unpopulated Destination Tables

The destination SQLite database contains 21 domain tables. Exactly 5 tables have no matching source collection in the MongoDB production database:

| Destination Table | Why Absent in MongoDB Source | Application Purpose in v2.6.0 |
|---|---|---|
| `emulators` | Feature introduced in v2.6.0 | Tracks mobile/browser device emulator states. In v2.5.0, emulators were ephemeral and unpersisted. |
| `connections` | Feature introduced in v2.6.0 | Persists cross-agent WebSocket connection states for multi-node clustering. In v2.5.0, socket connections were in-memory only. |
| `mcp_servers` | Feature introduced in v2.6.0 | External MCP registry and proxy system (`src/core/mcp-registry/`). Did not exist in v2.5.0. |
| `execution_jobs` | Feature introduced in v2.6.0 | Sandbox job queue and state machine. Execution sandbox did not exist in v2.5.0. |
| `execution_approvals`| Feature introduced in v2.6.0 | Human-in-the-loop and multi-agent execution approval records. Did not exist in v2.5.0. |

*Governance Rule:* These 5 tables remain initialized with valid schemas and will populate naturally as new v2.6.0 features are exercised. No artificial records are created.

---

## 5. Audit Verdict

**RELATIONSHIP INTEGRITY: PASSED (100% RESOLVED)**  
Every relational reference across the 29,831 records resolves without orphan errors, and all unpopulated tables are accounted for by architectural evolution.
