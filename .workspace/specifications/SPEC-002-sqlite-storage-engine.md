# SPEC-002: SQLite Storage Engine and Schema

## Overview
The v2.6.0 storage layer uses embedded SQLite via `better-sqlite3`.

## Pragmas
- `journal_mode = WAL`
- `synchronous = NORMAL`
- `foreign_keys = ON`
- `busy_timeout = 5000`

## Tables (16)
1. `contexts` — Core memory and context items.
2. `tasks` — Coordination tasks.
3. `locks` — Advisory soft locks.
4. `activities` — Activity stream events.
5. `issues` — Issue tracking.
6. `agents` — Registered AI agent instances.
7. `projects` — Registered projects.
8. `branches` — Branch metadata.
9. `code_reviews` — Automated and manual reviews.
10. `checkpoints` — State snapshots.
11. `documents` — Attached documentation.
12. `metrics` — Performance and execution metrics.
13. `mcp_servers` — External registered MCP servers.
14. `mcp_tools` — Dynamically injected external tools.
15. `mcp_resources` — Registered MCP resources.
16. `schema_version` — Migration tracking table.
