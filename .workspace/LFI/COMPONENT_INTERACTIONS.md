# Component Interactions — Logic Flow Index

**Project:** local-mcp-memory
**Version:** 2.6.0
**Last Updated:** 2026-11-05

---

## MCP Server (`mcp-server.js`)

**Purpose:** MCP stdio server entry point. Bridges MCP clients to the internal HTTP API.

**Inputs:**

- MCP JSON-RPC messages on stdin

**Outputs:**

- MCP JSON-RPC responses on stdout

**Dependencies:**

- `startMemoryServer.js` — Starts internal HTTP server
- `server.js` — Express HTTP API (via HTTP)
- `agent-instruction.js` — Global agent instructions
- `utils/projectIdentity.js` — Project identity resolution
- `tools/browserTools.js` — Browser tool handlers
- `tools/notificationTools.js` — Notification tools
- `mcp-integration-tools.js` — Integration tool definitions
- `core/config/runtime-state.js` — Runtime state management
- `core/config/connectionResolver.js` — Connection resolution
- `core/config/project-config-loader.js` — Configuration loading

**Dependents:**

- MCP clients (opencode, editors, AI agents)

**Error Behavior:**

- Circuit breaker pattern (5 failures → open, 10s cooldown)
- Safe retry for read-only operations
- Argument size validation (max 256KB)
- Agent ID sanitization

---

## HTTP API Server (`server.js`)

**Purpose:** Express HTTP API server. Handles all business logic and database operations.

**Inputs:**

- HTTP requests (from mcp-server.js or direct clients)

**Outputs:**

- HTTP JSON responses

**Dependencies:**

- `src/core/database/sqlite/index.js` — SQLite database
- `core/mcp/models.js` — Data models
- `src/domains/*` — 10 domain services
- `utils/*` — Shared utility engines
- `core/plugin/plugin-manager.js` — Plugin system

**Dependents:**

- `mcp-server.js` (via HTTP)
- Direct HTTP clients

**Error Behavior:**

- Express error middleware catches unhandled errors
- Database connection retry on startup
- Graceful shutdown on SIGTERM/SIGINT

---

## Tool Registry (`src/core/mcp/tool-registry.js`)

**Purpose:** Central registry for MCP tool definitions and handlers.

**Inputs:**

- Tool registration calls
- Tool lookup queries

**Outputs:**

- Tool definitions
- Tool handlers

**Dependencies:**

- None (standalone module)

**Dependents:**

- `mcp-server.js` — Tool lookup
- `src/core/mcp/tool-executor.js` — Handler retrieval
- `tools/index.js` — Tool registration

**Error Behavior:**

- Returns null/undefined for unknown tools
- No side effects on failed lookups

---

## Tool Executor (`src/core/mcp/tool-executor.js`)

**Purpose:** Executes MCP tools with middleware pipeline support.

**Inputs:**

- Tool name + arguments
- Execution context

**Outputs:**

- Tool execution result

**Dependencies:**

- `src/core/mcp/tool-registry.js` — Handler lookup

**Dependents:**

- `mcp-server.js` — Tool execution

**Error Behavior:**

- Throws `Error('Tool handler not found: ${name}')` for unknown tools
- Middleware chain can intercept and transform errors

---

## MCP Registry (`src/core/mcp-registry/`)

**Purpose:** Register, connect, proxy, and health-track external MCP servers; expose their tools.

**Inputs:**

- MCP tool calls dispatched from `tools/mcpRegistryTools.js` (9 tools)
- HTTP requests to `/mcp/*` handled by `routes.js`
- JSON-RPC responses from upstream HTTP(S) servers

**Outputs:**

- `mcp_servers` rows with `auth_config` encrypted as `enc:v1:`
- Discovered tool lists injected into `tools/list`
- Proxied JSON-RPC results; masked credentials on every external read

**Dependencies:**

- `src/core/database/sqlite/` — persistence (`mcp_servers` table)
- `src/core/auth/` — route auth (JWT/API key) and project scoping
- `crypto.js` (`node:crypto`) — AES-256-GCM encrypt/decrypt keyed by `MCP_MASTER_SECRET`
- `proxy.js` — JSON-RPC forwarding, timeout policy, per-server circuit breaker

**Dependents:**

- `tools/mcpRegistryTools.js` — 9 tool handlers
- `mcp-server.js` — tool injection via `getDiscoveredTools()` / `isProxiedTool()` / `callProxiedTool()`
- `server.js` — mounts the `/mcp/*` routes

**Error Behavior:**

- stdio servers are metadata-only: connect/discover/proxy are refused (see `E-REG-003`)
- breaker opens after 5 consecutive failures, 30s cool-off, 1 half-open probe (`E-REG-002`)
- masked reads never expose full credentials; unmasking happens only on the internal proxy path (`E-REG-004`)

---

## Database Connection (`src/core/database/connection.js`)

**Purpose:** Database connection manager. Provides MongoDB-compatible API over SQLite.

**Inputs:**

- `connect(dbPath)` — Initialize connection
- `getCollection(name)` — Get collection handle

**Outputs:**

- Database instance
- Collection handles

**Dependencies:**

- `src/core/database/sqlite/index.js` — SQLite implementation

**Dependents:**

- `server.js` — Database initialization
- `utils/memoryEngine.js` — Memory operations
- `utils/coordinationEngine.js` — Task operations
- `utils/collaborationEngine.js` — Lock operations
- All domain services

**Error Behavior:**

- Throws `Error('Database not ready')` if called before initialization
- Connection failure throws with descriptive message
- Singleton pattern prevents multiple connections

---

## SQLite Module (`src/core/database/sqlite/`)

**Purpose:** SQLite database implementation with MongoDB-compatible query interface.

**Inputs:**

- SQL queries (via query builder)
- MongoDB-style queries (translated to SQL)

**Outputs:**

- Query results
- Database state

**Dependencies:**

- `better-sqlite3` — SQLite driver

**Dependents:**

- `src/core/database/connection.js` — Connection wrapper
- All domain services (via collection API)

**Error Behavior:**

- WAL mode for read concurrency
- Busy timeout for write contention
- Foreign key constraint enforcement
- FTS5 errors on malformed queries

---

## Memory Domain (`src/domains/memory/`)

**Purpose:** Memory CRUD operations with versioning and conflict detection.

**Inputs:**

- Memory create/update/search/delete requests

**Outputs:**

- Memory entries
- Version history
- Conflict detection results

**Dependencies:**

- `src/core/database/connection.js` — Database access
- `core/mcp/models.js` — ContextModel, MemoryVersionModel

**Dependents:**

- `server.js` — API routes
- `utils/memoryEngine.js` — Engine functions
- MCP tool handlers

**Error Behavior:**

- Optimistic concurrency conflicts (version mismatch)
- Scope-based access control (private/project/global)
- Lifecycle state machine enforcement

---

## Task Domain (`src/domains/task/`)

**Purpose:** Task creation, assignment, and status management.

**Inputs:**

- Task create/update/fetch requests

**Outputs:**

- Task entries
- Assignment results

**Dependencies:**

- `src/core/database/connection.js` — Database access
- `core/mcp/models.js` — TaskModel

**Dependents:**

- `server.js` — API routes
- `utils/coordinationEngine.js` — Scheduling and auto-assignment
- MCP tool handlers

**Error Behavior:**

- Dependency validation (blocked if deps unmet)
- Assignment conflicts (already assigned)
- Status transition enforcement

---

## Collaboration Engine (`utils/collaborationEngine.js`)

**Purpose:** Soft lock system for resource contention management.

**Inputs:**

- Lock acquire/release/fetch requests

**Outputs:**

- Lock status
- Lock warnings (locked by other agent)

**Dependencies:**

- `src/core/database/connection.js` — Database access

**Dependents:**

- `server.js` — Lock API routes
- MCP tool handlers

**Error Behavior:**

- Soft locks warn but don't block
- TTL-based auto-expiry
- Same-agent lock refresh

---

## Coordination Engine (`utils/coordinationEngine.js`)

**Purpose:** Task scheduling, auto-assignment, and priority scoring.

**Inputs:**

- Task scheduling requests
- Agent capability data

**Outputs:**

- Task schedules
- Auto-assignment results
- Priority scores

**Dependencies:**

- `src/core/database/connection.js` — Database access

**Dependents:**

- `server.js` — Task API routes
- Task domain services

**Error Behavior:**

- Graceful degradation when agent data incomplete
- Priority score recalculation on changes

---

## Plugin Manager (`core/plugin/plugin-manager.js`)

**Purpose:** Dynamic plugin loading and lifecycle management.

**Inputs:**

- Plugin initialization requests
- Hook registrations

**Outputs:**

- Loaded plugins
- Hook execution results

**Dependencies:**

- `core/config/project-config-loader.js` — Plugin configuration

**Dependents:**

- `server.js` — Plugin initialization
- Plugin modules (redis, browser, knowledgeBase, emulator)

**Error Behavior:**

- Failed plugin loads logged and skipped (non-fatal)
- Hook errors caught and logged (non-fatal)
- Unknown plugin names warned and skipped

---

## Activity Tracker (`utils/activityTracker.js`)

**Purpose:** Near-real-time activity stream recording.

**Inputs:**

- Activity recording requests (type, message, metadata)

**Outputs:**

- Activity entries

**Dependencies:**

- `src/core/database/connection.js` — Database access

**Dependents:**

- All domain services (activity recording)
- `server.js` — Activity API routes
- MCP tool handlers

**Error Behavior:**

- Activity recording failures are non-fatal (logged)
- Never blocks the originating operation

---

## Event Bus (`utils/eventBus.js`)

**Purpose:** Internal event system for decoupled communication.

**Inputs:**

- Event emissions
- Event subscriptions

**Outputs:**

- Event notifications

**Dependencies:**

- None (standalone module)

**Dependents:**

- Various modules (event-driven coordination)

**Error Behavior:**

- Subscriber errors caught and logged
- Does not propagate subscriber failures

---

## Security Validators (`utils/security-validators.js`)

**Purpose:** Input sanitization and validation.

**Inputs:**

- Raw user input
- Validation rules

**Outputs:**

- Validated/sanitized data
- Validation errors

**Dependencies:**

- None (standalone module)

**Dependents:**

- `mcp-server.js` — Input validation
- `server.js` — Request validation
- All tool handlers

**Error Behavior:**

- Returns structured error responses
- Never throws (returns error objects)
- Rejects malformed input gracefully

---

## Global CLI & Diagnostics (`bin/cli.js`, `src/core/cli/*`)

**Purpose:** CLI entry point (`local-mcp-memory`, aliases: `mcp-memory`, `local-memory-mcp`) providing 17 commands for server control, agent initialization, diagnostics, migration, and memory operations.

**Inputs:**

- CLI arguments and command flags (Commander 12)
- Local runtime state (`.mcp-runtime.json`)
- System environment (`process.env`, OS info)

**Outputs:**

- Formatted ANSI console summaries
- JSON diagnostic results (`doctor`)
- Subprocess spawning for `start` / `stop`
- HTTP calls to local API server

**Dependencies:**

- `src/core/paths/runtime-paths.js` — OS runtime paths
- `src/core/config/user-config.js` — Global user configuration
- `src/core/setup/agent-configs.js` — AI agent configuration adapters
- `src/core/cli/doctor.js` — Diagnostic checks
- `src/core/migration/mongo-to-sqlite.js` — Migration pipeline

**Dependents:**

- End users running `npx local-mcp-memory <cmd>` or global `local-mcp-memory`
- AI agents executing automated self-checks and configuration

**Error Behavior:**

- Structured error messages printed to stderr
- Non-zero exit codes on fatal failures
- `--dry-run` flag in `init` prevents partial or corrupt file writes

---

## Runtime Path Resolution (`src/core/paths/runtime-paths.js`)

**Purpose:** Cross-platform resolution and provisioning of application data, configuration, log, and database directories.

**Inputs:**

- Operating system (`process.platform`)
- Environment variables (`LOCALAPPDATA`, `APPDATA`, `XDG_DATA_HOME`, `HOME`, `MCP_DB_PATH`)

**Outputs:**

- Standardized directory paths: `dataDir`, `configDir`, `logsDir`, `runtimeDir`
- Database path resolution with precedence: `MCP_DB_PATH` > config file > default SQLite path

**Dependencies:**

- Node.js built-ins (`node:path`, `node:os`, `node:fs`)

**Dependents:**

- `bin/cli.js`
- `src/core/config/user-config.js`
- `src/core/setup/agent-configs.js`
- `src/core/database/sqlite/index.js`
- `core/config/runtime-state.js`

**Error Behavior:**

- Auto-creates directories recursively if missing (`mkdirSync({ recursive: true })`)
- Throws descriptive path resolution errors on missing home directory

---

## Agent Configuration Adapters (`src/core/setup/agent-configs.js`, `src/core/setup/jsonc.js`)

**Purpose:** Discovery, parsing, registration, and updating of MCP server definitions across 6 major AI agent clients (`opencode`, `codex`, `claude`, `cursor`, `windsurf`, `cline`).

**Inputs:**

- Target agent configuration files (`opencode.json`, `config.toml`, `claude_desktop_config.json`, `mcp.json`, etc.)
- Options (`dryRun`, custom paths, transport parameters)

**Outputs:**

- Updated agent configuration files with `local-mcp-memory` stdio entry
- Timestamped configuration backups (`.bak`)
- Summary report of detected, updated, or skipped agent configs

**Dependencies:**

- `src/core/setup/jsonc.js` — Comment- and formatting-preserving JSONC AST parser
- `src/core/paths/runtime-paths.js` — Standard agent config locations

**Dependents:**

- `bin/cli.js` (`init` and `uninstall` commands)
- `src/core/cli/install-state.js`

**Error Behavior:**

- Validates syntax before overwriting
- Never corrupts existing comments or custom keys
- Restores from backup if atomic write fails
- Supports dry-run execution without modifying target files

---

## MongoDB to SQLite Migration (`src/core/migration/mongo-to-sqlite.js`)

**Purpose:** Schema and data migration pipeline from legacy MongoDB instances to v2.6.0 embedded SQLite.

**Inputs:**

- MongoDB connection URI
- Target SQLite database instance

**Outputs:**

- Transferred collection rows in `contexts`, `tasks`, `issues`, `agents`, `messages`, `activity`
- Re-indexed FTS5 search index
- Structured migration report with counts and timing

**Dependencies:**

- `src/core/database/sqlite/index.js` — SQLite database connection
- MongoDB driver (loaded dynamically if migration invoked)

**Dependents:**

- `bin/cli.js` (`migrate` command)

**Error Behavior:**

- Atomic transactions per collection batch; rolls back on failure
- Read-only on source MongoDB — never drops or alters source collections
- Validates data types and schema mappings before inserting

---

## Reference Maintenance Log

### 2026-11-05

**Change:** Added Global CLI, Runtime Paths, Multi-Agent Setup Adapters, and Migration Components

**Classification:** ADDED

**Updated:**
- Added `## Global CLI & Diagnostics (`bin/cli.js`, `src/core/cli/*`)`
- Added `## Runtime Path Resolution (`src/core/paths/runtime-paths.js`)`
- Added `## Agent Configuration Adapters (`src/core/setup/agent-configs.js`, `src/core/setup/jsonc.js`)`
- Added `## MongoDB to SQLite Migration (`src/core/migration/mongo-to-sqlite.js`)`
- Documented inputs, outputs, dependencies, dependents, and error behavior for all new components

**Verification:** FULL (verified against component implementations and 133 test assertions)

### 2026-10-07

**Change:** Registry governance closeout (gap G13) — added MCP registry component

**Classification:** ADDED

**Updated:**

- Added `## MCP Registry (`src/core/mcp-registry/`)` covering purpose, inputs/outputs, dependencies, dependents, and error behavior
- Linked registry error paths (`E-REG-001` … `E-REG-004`) in `ERROR_PATHS.md`

**Verification:** SPOT (modules and call sites verified against `src/core/mcp-registry/` source)

### 2026-09-19

**Change:** Initial component interactions creation

**Classification:** ADDED

**Updated:**

- Documented 14 major components
- Mapped inputs, outputs, dependencies, dependents
- Documented error behavior patterns

**Verification:** FULL

---

_Update when component interactions change significantly._
