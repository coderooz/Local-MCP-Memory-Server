# API, Dashboard & CLI Audit Report

**Audit Date:** 2026-11-05  
**Version:** 2.6.0  

---

## 1. HTTP API Layer (`server.js`)

Mounted on dynamic port (`47000..47020`) or configured `PORT`.

### Verified Route Categories:
1. **Health & Status**:
   - `GET /health`: JSON status containing uptime, database integrity, active connection counts, and registered agent count.
2. **Context & Memory**:
   - `POST /context`: Store memory.
   - `POST /context/search`: Full-text memory search.
   - `POST /context/update`: Version-controlled update.
   - `GET /context/:id/connected`: Context graph linking tasks and actions.
3. **Tasks & Issues**:
   - `POST /task`, `GET /task/list`, `POST /task/update`, `POST /task/assign`.
   - `POST /issue`, `GET /issue/list`, `POST /issue/resolve`.
4. **Collaboration Primitives**:
   - `POST /activity`, `GET /activity`: Chronological audit log.
   - `POST /lock/acquire`, `POST /lock/release`, `GET /lock/list`: Soft lock coordination.
5. **Authentication**:
   - `POST /auth/register`, `POST /auth/login`, `GET /auth/me`, `POST /auth/refresh`, `GET /auth/health`.
   - `POST /auth/api-keys`, `GET /auth/api-keys`, `DELETE /auth/api-keys/:key`.
6. **MCP Registry**:
   - `GET /mcp/servers`, `POST /mcp/servers`, `GET /mcp/servers/:id`, `DELETE /mcp/servers/:id`.
   - `POST /mcp/servers/:id/connect`, `POST /mcp/servers/:id/disconnect`, `GET /mcp/servers/:id/tools`.

---

## 2. Web Dashboard Interface (`dashboard/`)

- Served directly by Express at `/dashboard`.
- Client-side Single Page Application (HTML/CSS/JS) with SPA fallback for `/dashboard/*`.
- Client-side routing via `location.hash` with clean view resolution (`overview`, `memory`, `tasks`, `issues`, `agents`, `activity`, `registry`, `login`, `register`).
- Back/Forward browser navigation works smoothly without page reloads.

---

## 3. CLI Executable (`bin/cli.js`)

- Primary binary name: `local-mcp-memory`.
- Verified 17 operational commands:
  - `init`: Automated user directory initialization and AST-safe AI agent registration (OpenCode, Codex, Claude, Cursor, Windsurf, Cline) with `--dry-run` support.
  - `start`: Foreground or background (`--daemon`) server startup.
  - `stop`: Gracefully terminates daemonized background process using PID file.
  - `status`: Diagnostic dump of runtime paths, database size, and running processes.
  - `doctor`: Automated 7-point health check (Node version, paths, database, secrets, agents, port availability).
  - `config`: View or set hierarchical user configuration values.
  - `update`: Checks package drift and re-applies agent adapters.
  - `uninstall`: Removes agent registrations cleanly, preserving database unless `--purge --yes` specified.
  - `migrate`: Runs MongoDB-to-SQLite schema and batch data transfer pipeline.
  - `search`, `store`, `create-task`, `list-tasks`, `create-issue`, `list-issues`, `list-agents`, `health`.
