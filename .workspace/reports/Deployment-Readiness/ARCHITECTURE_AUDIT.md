# Architecture Audit — v2.6.0 Technical Architecture

**Audit Date:** 2026-11-05  
**Version:** 2.6.0  
**Stack:** Node.js (ESM), Express 5, SQLite (`better-sqlite3`), MCP Protocol (2024-11-05)  

---

## 1. System Topology

The target architecture operates as a centralized multi-agent developer service:

```
                           +------------------------+
                           |  Developer Workspaces  |
                           |  (OpenCode / Claude /  |
                           |   Cursor / Windsurf)   |
                           +-----------+------------+
                                       |
                             [stdio MCP JSON-RPC]
                                       |
                                       v
                           +------------------------+
                           |     mcp-server.js      |
                           | (Tool Registry, Proxy) |
                           +-----------+------------+
                                       |
                              [HTTP internal loop]
                                       |
                                       v
                           +------------------------+
                           |       server.js        |
                           |  Express 5 API Engine  |
                           |  (Dynamic port 47000)  |
                           +-----------+------------+
                                       |
                        +--------------+--------------+
                        |                             |
                        v                             v
               +-----------------+           +-----------------+
               |  SQLite Engine  |           |  Domain Modules |
               | (31 Tables, WAL)|           | (Tasks, Locks,  |
               | (FTS5 Indexing) |           |  Memory, Audit) |
               +-----------------+           +-----------------+
```

---

## 2. Subsystem Audit Findings

### 2.1 Database & Persistence Subsystem
- **Engine**: SQLite via `better-sqlite3`.
- **Concurrency Mode**: `PRAGMA journal_mode = WAL`.
- **Integrity**: `PRAGMA foreign_keys = ON`, `PRAGMA integrity_check = ok`.
- **Search**: SQLite FTS5 virtual tables (`contexts_fts`, `project_descriptors_fts`) with automatic INSERT, UPDATE, and DELETE triggers.
- **Table Count**: 31 domain tables (including `contexts`, `context_versions`, `tasks`, `issues`, `agents`, `messages`, `activity`, `resource_locks`, `mcp_servers`, `execution_jobs`, `chat_rooms`, `feedback`, `users`, `api_keys`).

### 2.2 MCP Protocol Layer
- **Transport**: Stdio transport via readline interface, pure JSON-RPC on stdout.
- **Circuit Breaker**: Auto-trips after 5 consecutive upstream failures, cools off for 30s.
- **External Registry**: Supports registering external HTTP/stdio MCP servers; HTTP servers are dynamically proxied, and discovered tools are cached and exposed under `mcp__<serverId>__<toolName>`.

### 2.3 Express HTTP API & Dashboard
- **Framework**: Express 5.
- **Port Management**: Dynamic allocation range `47000..47020` with port congruence validation (`portMatches`) and runtime file announcement.
- **Dashboard**: SPA shell served at `/dashboard`, `/dashboard/*` with client-side hash routing (`location.hash`).

### 2.4 CLI & Setup Engine
- **Commands**: 17 production commands (`init`, `start`, `stop`, `status`, `doctor`, `config`, `update`, `uninstall`, `migrate`, etc.).
- **Adapters**: AST-preserving comment-safe JSONC parser for zero-loss agent configuration.

---

## 3. Structural Observations & Debt

- **Dead Code / Unreachable Stubs**: `plugins/emulator/index.js` and `core/integrations/redis/` exist from v2.5.0, but are optional plugins not loaded in default SQLite mode.
- **Circular Dependencies**: Zero circular imports detected across core modules.
- **Fail-Closed Sandbox**: Phase 1 execution sandbox (`src/core/execution/`) deliberately returns `isAvailable() = false` for Docker, preventing execution on host without real container infrastructure.
