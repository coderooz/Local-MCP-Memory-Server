# Project Rules — local-mcp-memory

## Purpose

Persistent multi-agent memory server implementing the Model Context Protocol (MCP).
Provides cross-agent memory, task management, project context, soft locks, and activity streams.
Consumed by opencode as a globally-configured MCP server.

## Tech Stack

- **Runtime:** Node.js 20+ (ESM modules, no CommonJS)
- **Framework:** Express 5
- **Database:** SQLite (better-sqlite3, embedded)
- **Language:** JavaScript (no TypeScript)
- **Testing:** Custom Node.js test runner (node:test)
- **Linting:** ESLint 8 (`.eslintrc.json`)
- **Formatting:** Prettier 3 (`.prettierrc`)
- **Docs:** GitHub Pages (docs/ folder)

## Architecture

- Plugin-based architecture with dynamic loading
- MCP protocol spec: tools, resources, prompts, sampling, roots, transports
- Soft lock system for resource contention
- Memory versioning with optimistic concurrency
- Activity streams for live project tracking
- SSE/HTTP transport layer (Express 5)
- MCP Server Registry for external MCP server management
- Dynamic tool injection from connected servers

## Key Features

- **Memory System:** Store, search, update, and version persistent memory
- **Task Management:** Create, assign, and track coordination tasks
- **Issue Tracking:** Create and resolve issues/notes/blockers
- **Activity Streams:** Real-time activity tracking across agents
- **Soft Locks:** Advisory resource locking for concurrency control
- **Project Intelligence:** Project descriptors and codebase maps
- **MCP Registry:** Register and manage external MCP servers
- **Dynamic Tools:** Auto-discover and proxy tools from connected servers

## Pipeline

```
SEQUENTIAL GROUP 1: analyzer → tracker → watchdog
SEQUENTIAL GROUP 2: planner → tracker → watchdog
SEQUENTIAL GROUP 3: validator → tracker → watchdog
SEQUENTIAL GROUP 4: coder → tracker → watchdog
PARALLEL GROUP 5: code-reviewer + db-specialist → tracker → watchdog
SEQUENTIAL GROUP 6: validator → tracker → watchdog
PARALLEL GROUP 7: tester + security-auditor → tracker → watchdog
PARALLEL GROUP 8: documenter + setup → project-builder
```

## Roles

### analyzer

Analyzes plugin architecture, middleware chain, MCP tool handlers, SQLite query patterns.

### planner

Plans implementation of MCP endpoints, Express routes, SQLite schemas, plugin interfaces.

### validator

Validates architecture plan before coding and code quality after review.

### coder

Implements MCP tool endpoints, Express routes, SQLite CRUD operations, event handlers.

### code-reviewer

Reviews Node.js ESM patterns, async error handling, MCP protocol compliance, Express 5 middleware.

### tester

Chaos testing, protocol integrity checks, multi-session isolation tests, memory CRUD validation.

### db-specialist

SQLite indexes, FTS5 search, query optimization (better-sqlite3, no ORM).

### security-auditor

MCP protocol security, input sanitization, rate limiting, auth middleware, injection prevention.

### documenter

Documents MCP tool endpoints, API routes, SQLite schemas, setup/configuration, interface contracts.

### setup

Initializes project structure, SQLite indexes, GitHub Pages, CI/CD, environment configuration.

### tracker

Tracks project progress, updates AGENTS.md, manages milestones, monitors sub-agent task completion.

### watchdog

Monitors agent health, detects task paralysis, checks git staleness, enforces phase timeouts, recommends checkpoints.

## Key Files

- `mcp-server.js` — Main MCP server entry point
- `server.js` — HTTP API server
- `src/` — Source modules
- `src/core/database/sqlite/` — SQLite adapter (schema, collection, query-builder, connection, FTS5)
- `src/core/mcp-registry/` — MCP server registry (CRUD, connection, HTTP proxy, health, dynamic tool cache)
- `core/` — Core framework (plugin loader, middleware, MCP protocol)
- `tools/` — MCP tool definitions (incl. `mcpRegistryTools.js`, 9 registry tools)
- `plugins/` — Plugin system
- `tests/` — Test suites (23 files; `npm test` runs 5 suites / 89 tests)
  - `tests/mcp-registry-test.js` — Registry suite (24 tests)
  - `tests/database-integrity-test.js` — DB integrity suite (34 tests)
  - `tests/app-e2e-test.js` — DB→UI application E2E suite (15 tests)
- `docs/` — GitHub Pages documentation

## Scripts

- `npm start` — Start MCP server
- `npm run start:api` — Start API server
- `npm run lint` — ESLint
- `npm run format` — Prettier
- `npm test` — Syntax check + test suites
- **opencode build:watch** — Run watchdog health check (opencode command, not npm)
