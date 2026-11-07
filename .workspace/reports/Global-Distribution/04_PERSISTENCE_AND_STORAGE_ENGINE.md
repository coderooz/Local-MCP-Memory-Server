# Persistence and Storage Engine: Embedded SQLite Architecture

## 1. Engine Rationale & Comparison

| Criterion | Legacy Architecture (MongoDB) | Modern Architecture (SQLite) |
|---|---|---|
| **Dependency Footprint** | External service daemon (`mongod.exe`) required | Self-contained Node native addon (`better-sqlite3`) |
| **User Setup Overhead** | User must install, configure, start, and maintain MongoDB | Zero configuration; created on demand |
| **Memory Footprint** | ~200MB - 500MB idle background RAM | < 15MB in-process RAM |
| **Data Integrity** | Prone to unhandled network disconnections, IPv6/IPv4 binding conflicts | In-process synchronous WAL journal; ACID compliant |
| **Full-Text Search** | Requires MongoDB `$text` indices and text search queries | SQLite FTS5 virtual tables with automated trigger sync |
| **Platform Portability** | Complex Windows service configuration | Single cross-platform `.db` file; trivial to backup or move |

---

## 2. Relational Schema & Table Definitions (31 Tables)

The database schema ([`src/core/database/sqlite/schema.js`](file:///C:/Code_Works/HTML_CSS_JS/workProjects/projects/local-mcp-memory/src/core/database/sqlite/schema.js)) defines 31 tables, covering all domain concepts:

1. `contexts`: Master memory context store (id, agent, project, scope, type, content, summary, embedding, importance, lifecycle, tags, metadata, createdAt, updatedAt).
2. `memory_versions`: Append-only history of context revisions and diffs with foreign key cascade to `contexts`.
3. `tasks`: Project coordination tasks (id, title, description, status, assigned_to, created_by, priority, blocker, idempotencyKey).
4. `issues`: Project blockers, bugs, and tracked defects.
5. `agents`: Registered AI agents, heartbeats, status, capabilities, and system roles.
6. `actions`: Recorded planning actions, code executions, and tool calls.
7. `messages`: Cross-agent direct communication messages.
8. `project_map`: Architectural code map, symbol references, and file metadata.
9. `activity`: Stream of agent events, tool calls, and state changes.
10. `resource_locks`: Collaborative soft locks (unique constraint on `project + resource + locked_by`).
11. `metrics`: Performance, latency, and system telemetry records.
12. `feedbacks`: Automated and human feedback entries with severity clamping.
13. `chat_rooms`: Multi-agent shared channels (PK = room_id).
14. `chat_messages`: Channel messages with sequence ordering and task linkage.
15. `sessions`: Connected MCP transport sessions and client capability records.
16. `mcp_servers`: External MCP servers registered with the registry subsystem.
17. `mcp_discovered_tools`: Tools exposed by external upstream MCP servers.
18. `mcp_proxy_logs`: Telemetry logs of proxied tool calls.
19. `logs`: System application logs.
20. `users`: Dashboard user authentication accounts.
21. `api_keys`: Scoped API keys for programmatic access.
22..31. Additional domain helper, relationship, and audit tables.

---

## 3. Full-Text Search (FTS5) Virtual Tables & Triggers

To enable instantaneous context and symbol searching without external search infrastructure, SQLite FTS5 tables are created alongside synchronization triggers:

```sql
CREATE VIRTUAL TABLE IF NOT EXISTS contexts_fts USING fts5(
  id UNINDEXED,
  content,
  summary,
  tags
);

CREATE TRIGGER IF NOT EXISTS contexts_ai AFTER INSERT ON contexts BEGIN
  INSERT INTO contexts_fts(rowid, id, content, summary, tags)
  VALUES (new.rowid, new.id, new.content, new.summary, new.tags);
END;

CREATE TRIGGER IF NOT EXISTS contexts_ad AFTER DELETE ON contexts BEGIN
  INSERT INTO contexts_fts(contexts_fts, rowid, id, content, summary, tags)
  VALUES ('delete', old.rowid, old.id, old.content, old.summary, old.tags);
END;

CREATE TRIGGER IF NOT EXISTS contexts_au AFTER UPDATE ON contexts BEGIN
  INSERT INTO contexts_fts(contexts_fts, rowid, id, content, summary, tags)
  VALUES ('delete', old.rowid, old.id, old.content, old.summary, old.tags);
  INSERT INTO contexts_fts(rowid, id, content, summary, tags)
  VALUES (new.rowid, new.id, new.content, new.summary, new.tags);
END;
```

---

## 4. Query Builder & MongoDB API Compatibility

The query translation layer ([`src/core/database/sqlite/query-builder.js`](file:///C:/Code_Works/HTML_CSS_JS/workProjects/projects/local-mcp-memory/src/core/database/sqlite/query-builder.js)) and collection wrapper ([`collection.js`](file:///C:/Code_Works/HTML_CSS_JS/workProjects/projects/local-mcp-memory/src/core/database/sqlite/collection.js)) allow existing business logic to execute familiar MongoDB calls:

```javascript
// This MongoDB syntax is translated transparently to SQLite SQL statements:
const results = await db.collection('contexts').find({
  $and: [
    { project: 'my-project' },
    { $or: [{ scope: 'project' }, { scope: 'global' }] },
    { $text: { $search: '"refactor-auth"' } }
  ]
}).sort({ importance: -1 }).limit(10).toArray();
```
- SQL Generated: Uses `contexts_fts MATCH ?` inside an inner select with parameter binding.
- Handles `$set`, `$inc`, `$push`, `$addToSet`, `$regex` (via custom user-defined function `REGEXP`), and `$in`.
