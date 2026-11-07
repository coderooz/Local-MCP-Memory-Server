# Migration Engine Technical Audit

**Audit Date:** 2026-11-06  
**Module Target:** [`src/core/migration/mongo-to-sqlite.js`](file:///C:/Code_Works/HTML_CSS_JS/workProjects/projects/local-mcp-memory/src/core/migration/mongo-to-sqlite.js)  
**Auditing Agent:** Google Antigravity  

---

## 1. Migration Architecture and Safety Contract

The migration engine transitions data from MongoDB (v2.5.0) to embedded SQLite (v2.6.0). The module is built around a non-negotiable safety contract:

1. **Dry-Run by Default:** Unless `--apply` (`apply: true`) is explicitly passed, the engine operates in read-only analysis mode and writes zero bytes to disk.
2. **Pre-Write Source Backup:** Before the first write to SQLite, the engine streams all source MongoDB documents into a compressed, timestamped JSONL directory and generates a cryptographically verified `manifest.json` with SHA-256 digests.
3. **Pre-Write Destination Snapshot:** If a target SQLite database already exists, it is checkpointed (`wal_checkpoint(TRUNCATE)`) and copied to `destination-before-migration.db`.
4. **Resumability & Idempotency:** Destination writes use atomic `INSERT ... ON CONFLICT(id) DO UPDATE` (upsert semantics) in batches of 500 records. An interrupted run can be safely resumed with `--resume`.
5. **Post-Migration Verification:** The run automatically executes `PRAGMA integrity_check`, `PRAGMA foreign_key_check`, row count reconciliations, and sample content inspections.
6. **Source Immutability:** The engine opens read-only cursors on MongoDB and never mutates or drops source collections.

---

## 2. Collection-to-Table Mapping Matrix

The engine maps 21 collections to their matching SQLite tables:

| Source Collection | Target SQLite Table | ID Source Field | JSON Encoded Columns | Relational References & Fallbacks |
|---|---|---|---|---|
| `contexts` | `contexts` | `id` | `tags`, `metadata`, `relatedContexts`, `conflictsWith` | Primary context table; FTS5 triggers sync on insert/update |
| `memory_versions` | `memory_versions` | `id` | `tags`, `metadata`, `snapshot` | FK `context_id` $\to$ `contexts.id`; cascade on delete |
| `actions` | `actions` | `id` | `contextRefs`, `outcome`, `tags`, `metadata` | Scoped by project & agent |
| `sessions` | `sessions` | `id` | `contextIds`, `actionIds`, `tags`, `metadata` | Fallback: `startedAt = createdAt` |
| `agents` | `agents` | `id` | `capabilities`, `tags`, `metadata` | Fallback: `last_seen = updatedAt \|\| createdAt` |
| `tasks` | `tasks` | `id` | `dependencies`, `required_capabilities`, `tags`, `metadata` | Idempotency key uniqueness preserved |
| `messages` | `messages` | `id` | `tags`, `metadata` | Inter-agent direct messages |
| `issues` | `issues` | `id` | `relatedContexts`, `relatedTasks`, `tags`, `metadata` | Bug tracking & impediments |
| `project_map` | `project_map` | `id` | `dependencies`, `exports`, `key_details`, `metadata` | FTS5 trigger sync on insert/update |
| `activity` | `activity` | `id` | `tags`, `metadata` | Fallback: `timestamp = createdAt` |
| `resource_locks` | `resource_locks` | `id` | `tags`, `metadata` | Unique tuple: `(project, resource, locked_by)` |
| `metrics` | `metrics` | `id` | `data`, `tags`, `metadata` | Numeric and gauge metrics |
| `feedbacks` | `feedbacks` | `feedback_id`, `id` | `voters`, `related_contexts`, `tags`, `metadata` | Feedback & bug triage |
| `chat_rooms` | `chat_rooms` | `room_id`, `id` | `participants`, `admins`, `tags`, `metadata` | Rename: `scope` $\to$ `room_scope` |
| `chat_messages` | `chat_messages` | `message_id`, `id` | `tags`, `metadata` | FK `room_id` $\to$ `chat_rooms.id`; inherits room project & agent |
| `logs` | `logs` | `id` | `log_context`, `tags`, `metadata` | Rename: `context` $\to$ `log_context` |
| `emulators` | `emulators` | `emulator_id`, `id` | `capabilities`, `tags`, `metadata` | Testing emulator state |
| `connections` | `connections` | `connectionId`, `id` | `tags`, `metadata` | Connection registry |
| `mcp_servers` | `mcp_servers` | `server_id`, `id` | `env`, `auth_config`, `health`, `metadata` | Upstream server configs |
| `execution_jobs` | `execution_jobs` | `job_id`, `id` | `effective_policy`, `approval_binding`, `artifacts` | Gated execution job tracking |
| `execution_approvals`| `execution_approvals`| `approval_id`, `id`| `permissions` | Gated execution approval tracking |

---

## 3. Data Integrity and Transformation Rules

1. **ObjectId Transformation:** MongoDB BSON `_id` values (if hex string or ObjectId) are normalized via `toText()`. When an explicit application domain identifier (`id`, `room_id`, `feedback_id`) is present, it takes precedence as the SQLite primary key.
2. **Timestamp Normalization:** Dates, ISO strings, and integer millisecond timestamps are converted to canonical ISO-8601 strings (`YYYY-MM-DDTHH:mm:ss.sssZ`).
3. **JSON Column Serialization:** Structured nested subdocuments and arrays are serialized into valid JSON strings via `toJsonText()`, ensuring compatibility with SQLite's native `json_extract()` functions.
4. **Relational Inheritance for Legacy Chat Messages:** In v2.5.0, `chat_messages` did not carry `project` or `scope`. The engine resolves the parent `room_id`, looks up the owning `chat_rooms` metadata, and assigns the correct project and scope to guarantee project isolation.
5. **Unmapped Field Preservation:** Any source document fields that do not map to defined SQLite schema columns are stored in `metadata._migration` so that no historical data is lost.
