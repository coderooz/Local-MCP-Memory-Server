# Logic Flow Index (LFI)

**Project:** local-mcp-memory
**Version:** 2.6.0
**Last Updated:** 2026-10-17
**Status:** Active

---

## Reference Metadata

| Field                 | Value                                       |
| --------------------- | ------------------------------------------- |
| Created               | 2026-09-19                                  |
| Last Updated          | 2026-09-19                                  |
| Last Verified         | 2026-09-19                                  |
| Verification Type     | FULL                                        |
| Canonical Location    | `.workspace/LFI/LOGIC_FLOW_INDEX.md`        |
| Companion (Structure) | `.workspace/PRI/PROJECT_REFERENCE_INDEX.md` |

---

## System Overview

### What the Project Does

local-mcp-memory is a **persistent multi-agent memory server** that implements the Model Context Protocol (MCP). It provides:

- **Memory persistence** — Store, search, update, and version context across agent sessions
- **Task management** — Create, assign, track, and coordinate tasks between agents
- **Issue tracking** — Log bugs, notes, blockers, and insights linked to memory and tasks
- **Agent coordination** — Register agents, heartbeats, inter-agent messaging
- **Soft locks** — Resource contention management for collaborative editing
- **Activity streams** — Near-real-time project activity tracking
- **Project intelligence** — Project descriptors and codebase maps
- **Browser automation** — Playwright-based browser control via MCP tools
- **Chat system** — Room-based inter-agent communication
- **Feedback system** — Structured feedback with voting and resolution
- **CLI interface** — Command-line management via `bin/cli.js`
- **Visual dashboard** — Web-based UI for managing all features
- **Authentication** — JWT-based auth, API keys, role-based access control

### Primary Entry Points

| Entry Point     | Trigger                     | Protocol         |
| --------------- | --------------------------- | ---------------- |
| `mcp-server.js` | stdio (MCP client connects) | MCP over stdio   |
| `server.js`     | HTTP request                | Express HTTP API |
| `bin/cli.js`    | CLI command                 | HTTP to API      |
| `dashboard/`    | Browser request             | Express HTTP     |

### Data Flow Summary

```
Agent/Client
    │
    ├──[MCP stdio]──→ mcp-server.js ──→ HTTP ──→ server.js ──→ SQLite
    │
    ├──[HTTP direct]──→ server.js ──→ SQLite
    │
    ├──[CLI]──→ bin/cli.js ──→ HTTP ──→ server.js ──→ SQLite
    │
    └──[Browser]──→ dashboard/index.html ──→ HTTP ──→ server.js ──→ SQLite
```

Both entry points converge on the same Express HTTP API server (`server.js`), which handles all business logic and database operations via SQLite.

---

## Execution Paths

### 1. MCP Server Startup

**Entry:** `mcp-server.js:1`

**Flow:**

1. Load environment variables from `.env`
2. Resolve project identity (`utils/projectIdentity.js`)
3. Start internal HTTP memory server (`startMemoryServer.js` → `server.js`)
4. Initialize connection resolver (`core/config/connectionResolver.js`)
5. Set up readline interface for stdio communication
6. Wait for MCP requests on stdin
7. Route requests to appropriate tool handlers
8. Return responses on stdout

**State Transitions:**

```
IDLE → STARTING → READY → PROCESSING → READY
                        └→ ERROR → RETRY → READY
```

### 2. HTTP API Server Startup

**Entry:** `server.js:1`

**Flow:**

1. Load environment variables
2. Initialize SQLite database (`src/core/database/sqlite/index.js`)
3. Initialize plugin manager (`core/plugin/plugin-manager.js`)
4. Register Express middleware (CORS, JSON parsing, error handling)
5. Register API routes (`src/interfaces/api/routes.js`)
6. Start listening on port (dynamic or configured)
7. Begin health check polling
8. Accept HTTP requests

**State Transitions:**

```
INIT → DB_READY → PLUGINS_LOADED → ROUTES_REGISTERED → LISTENING → HEALTHY
```

### 3. MCP Tool Execution

**Entry:** `mcp-server.js` → tool handler

**Flow:**

1. Receive MCP request on stdin
2. Parse JSON-RPC message
3. Validate tool name exists in registry
4. Check circuit breaker state
5. Validate argument size (max 256KB payload)
6. Sanitize agent ID fields
7. Execute HTTP request to internal server
8. Internal server routes to domain service
9. Domain service performs business logic
10. SQLite executes query
11. Response flows back through the chain
12. MCP response returned on stdout

**Decision Points:**

- Tool exists? → YES: continue, NO: return error
- Circuit breaker open? → YES: return error, NO: continue
- Argument valid? → YES: continue, NO: return validation error
- Server healthy? → YES: forward request, NO: attempt retry

### 4. Memory CRUD Operations

**Entry:** `utils/memoryEngine.js` / `src/domains/memory/memory.service.js`

**Flow:**

1. Validate input (project, agent, content)
2. Resolve scope (private/project/global)
3. Check for conflicts (optimistic concurrency)
4. Execute database operation:
   - CREATE: Generate UUID, insert into `contexts` table
   - READ: Query `contexts` with filters (project, agent, scope, text search)
   - UPDATE: Apply version tracking, update `contexts` + create `context_versions` entry
   - DELETE: Soft-delete (lifecycle → archived)
5. Record activity
6. Return result

**State Transitions (Memory Lifecycle):**

```
ACTIVE → ARCHIVED (soft delete)
ACTIVE → UPDATED (version incremented)
ARCHIVED → ACTIVE (restore)
```

### 5. Task Coordination Flow

**Entry:** `utils/coordinationEngine.js` / `src/domains/task/task.service.js`

**Flow:**

1. Create task with title, description, priority, dependencies
2. Auto-assign based on agent capabilities and workload
3. Track status transitions
4. Check dependencies before completion
5. Update task and notify related agents
6. Record activity

**State Transitions:**

```
PENDING → IN_PROGRESS → COMPLETED
    └→ BLOCKED → IN_PROGRESS
    └→ CANCELLED
```

### 6. Soft Lock Acquisition

**Entry:** `utils/collaborationEngine.js`

**Flow:**

1. Check if resource already locked
2. If locked by same agent → refresh TTL
3. If locked by different agent → warn (soft lock, not blocking)
4. If unlocked → acquire lock with TTL
5. Set expiry timer
6. Return lock status

**State Transitions:**

```
UNLOCKED → LOCKED (with TTL)
LOCKED → EXPIRED (TTL elapsed)
LOCKED → RELEASED (explicit release)
```

### 7. Plugin System Initialization

**Entry:** `core/plugin/plugin-manager.js:17`

**Flow:**

1. Read plugin list from project config
2. For each plugin:
   a. Dynamic import plugin module
   b. Call plugin.initialize() if available
   c. Register plugin in map
3. Run INIT hook for all plugins
4. Mark manager as initialized

**Supported Plugins:**

- `redis` — Redis adapter (optional)
- `browser` — Browser controller (Playwright)
- `knowledgeBase` — Knowledge store
- `emulator` — Android emulator

### 8. Browser Automation Flow

**Entry:** `tools/browserTools.js`

**Flow:**

1. Open browser session (Playwright)
2. Navigate to URL
3. Interact with DOM (click, fill, screenshot)
4. Evaluate JavaScript
5. Capture page state
6. Return results
7. Close session

### 9. CLI Command Execution

**Entry:** `bin/cli.js`

**Flow:**

1. Parse command-line arguments (Commander)
2. Resolve server URL from environment or config
3. Make HTTP request to appropriate API endpoint
4. Format and display response
5. Exit with appropriate status code

**Supported Commands:**

- `start` — Start MCP server (spawns `node mcp-server.js`)
- `stop` — Stop running server
- `status` — GET `/health`
- `search <query>` — POST `/context/search`
- `create-task <title>` — POST `/task/create`
- `list-tasks` — GET `/task/list`
- `create-issue <title>` — POST `/issue/create`
- `list-issues` — GET `/issue/list`
- `list-agents` — GET `/agent/list`
- `health` — GET `/health`
- `store <content>` — POST `/context/store`
- `config` — Display resolved configuration
- `init` — Initialize new project config

### 10. Dashboard Serving Flow

**Entry:** `dashboard/routes.js`

**Flow:**

1. Request arrives at `/dashboard`, `/ui`, or a deeper path under `/dashboard`
2. If `/ui`, redirect 302 to `/dashboard`
3. Read `dashboard/index.html` from disk
4. Return HTML with `Content-Type: text/html`
5. Any deeper path (e.g. `/dashboard/memory`) serves the same app shell instead of 404ing
6. Browser renders single-page application
7. SPA resolves its initial view from `location.hash` via `viewFromHash()`; an empty or unknown hash falls back to `overview`
8. Nav clicks are plain anchor navigation — the browser changes the hash and drives `loadView()` through `hashchange`, so Back/Forward and refresh restore the same view
9. SPA makes API calls to same server for data

### 11. Authentication Login Flow

**Entry:** `src/core/auth/routes.js` → POST `/auth/login`

**Flow:**

1. Receive username + password in request body
2. Validate input fields present
3. Query `users` table by username
4. Verify password hash (PBKDF2)
5. Generate JWT token (24h expiry)
6. Return token + user info
7. Client stores token in localStorage

**State Transitions:**

```
UNAUTHENTICATED → AUTHENTICATED (valid credentials)
UNAUTHENTICATED → REJECTED (invalid credentials)
AUTHENTICATED → EXPIRED (JWT TTL exceeded)
```

### 12. API Key Management Flow

**Entry:** `src/core/auth/routes.js` → `/auth/api-keys`

**Flow:**

1. Client sends request with JWT in Authorization header
2. Auth middleware validates JWT
3. For CREATE: Generate random API key, hash it, store in `api_keys` table
4. For LIST: Query `api_keys` by user_id
5. For DELETE: Soft-delete API key
6. Return result

### 13. Auth Middleware Flow

**Entry:** `src/core/auth/index.js` → `requireAuth()`, `requireApiKey()`, `optionalAuth()`

**Flow:**

1. Extract token from `Authorization: Bearer <token>` header
2. If `requireAuth` and no token → 401 Unauthorized
3. If token present → verify JWT signature
4. If JWT invalid → 401 Unauthorized
5. If JWT valid → attach `req.user` with decoded payload
6. For `requireApiKey`: check `x-api-key` header against `api_keys` table
7. For `optionalAuth`: proceed without error if no token
8. Continue to route handler

---

### 14. MCP Registry Flow (register → connect → discover → proxy)

**Entry:** `tools/mcpRegistryTools.js` (MCP) and `src/core/mcp-registry/routes.js` (HTTP `/mcp/*`)

**Flow:**

1. `register_mcp_server` — validate name/type, project-scope the record, encrypt `auth_config` as `enc:v1:` (AES-256-GCM, keyed by `MCP_MASTER_SECRET`), insert into `mcp_servers`
2. `list_mcp_servers` / `get_mcp_server` — read back with credentials masked
3. `connect_mcp_server` — open an HTTP/HTTPS transport, call the server's `tools/list`, cache discovered tools in memory
4. `discover_mcp_tools` — inspect the cached tool set for a connected server
5. `proxy_mcp_call` — forward a JSON-RPC call through `src/core/mcp-registry/proxy.js`; this is the only path that reads unmasked credentials
6. `mcp-server.js` injects discovered tools into `tools/list` and routes calls via `isProxiedTool()` / `callProxiedTool()` using the `mcp__<serverId>__<toolName>` naming scheme
7. `disconnect_mcp_server` — clear the tool cache
8. `get_mcp_health` — status, latency, error count

**stdio servers:** registered for metadata only — never proxied.

**Error paths:** see `ERROR_PATHS.md` → `## Registry Errors` (`E-REG-001` … `E-REG-004`).

### 15. Execution Sandbox Flow (submit → approve → execute → collect)

**Entry:** `tools/executionTools.js` (MCP: `execution_submit/status/result/list/cancel/approve`) → `src/core/execution/index.js`

**Flow:**

1. `execution_submit` — resolve trusted identity/project (server-injected `CONFIG.agent`/`CONFIG.project`; caller identity ignored), replay by idempotency key, hash the script (`sha256`), resolve the runtime via the trusted allowlist, compute the effective policy (requested perms can only narrow), persist an `execution_jobs` row (`validating`), then route: pre-approved task → `queued`; approval-required → `awaiting_approval` (returns a hash-bound approval binding). Audited via `audit.js`.
2. `execution_approve` — reject self-approval (`POLICY_DENIED`), grant a `(scriptHash, project, runtime, permissions)`-bound expiring approval (replay-proof), transition `awaiting_approval` → `queued`. Audited.
3. `execution_cancel` — idempotent: non-terminal job → `cancelling` (audited); terminal/cancelling → no-op returning current state.
4. `executeJob` — **Phase 1 ALWAYS refuses (fail-closed):** the Docker backend `isAvailable()` is false and no code runs in-process; the job transitions to `failed` with `SANDBOX_START_FAILED`. Audited + metric recorded. **No process is ever spawned.**
5. `execution_status` / `execution_result` / `execution_list` — project-scoped reads of the durable job record (bounded).

**State machine:** 15 states in `src/core/execution/state-machine.js`; invalid transitions throw `INVALID_STATE_TRANSITION`; transitions are concurrency-safe (optimistic `version`). `failed` is reachable from `validating`/`awaiting_approval`/`queued`/`running`.

**Isolation (Phase 2+):** real execution targets a Docker container via the replaceable `sandbox-adapter.js`; the original working tree is never mounted writable. Blocked while the Docker daemon is down.

**Error paths:** stable codes in `src/core/execution/errors.js` (`IDENTITY_REQUIRED`, `PROJECT_SCOPE_DENIED`, `POLICY_DENIED`, `APPROVAL_REQUIRED`, `APPROVAL_EXPIRED`, `SANDBOX_START_FAILED`, `INVALID_STATE_TRANSITION`, `JOB_NOT_FOUND`, `IDEMPOTENCY_CONFLICT`, …).

---

## State Management

### Application States

| State            | Description                                         | Persistence                   |
| ---------------- | --------------------------------------------------- | ----------------------------- |
| Memory Lifecycle | active, archived                                    | SQLite `contexts.lifecycle`   |
| Task Status      | pending, in_progress, blocked, completed, cancelled | SQLite `tasks.status`         |
| Issue Status     | open, resolved                                      | SQLite `issues.status`        |
| Agent Status     | active, inactive                                    | SQLite `agents.status`        |
| Lock State       | locked, expired, released                           | SQLite `resource_locks` + TTL |
| Session Status   | active, paused, completed                           | SQLite `sessions.status`      |
| Circuit Breaker  | closed, open, half-open                             | In-memory (`mcp-server.js`)   |

### State Triggers

| Current State | Trigger             | Next State  |
| ------------- | ------------------- | ----------- |
| active        | archive()           | archived    |
| archived      | restore()           | active      |
| pending       | assign()            | in_progress |
| in_progress   | complete()          | completed   |
| in_progress   | block(reason)       | blocked     |
| blocked       | unblock()           | in_progress |
| open          | resolve()           | resolved    |
| unlocked      | acquire(agent, ttl) | locked      |
| locked        | release()           | unlocked    |
| locked        | TTL elapsed         | expired     |

---

## External Interactions

### Outbound API Calls

- None (self-contained local server)

### Inbound Endpoints (Express HTTP API)

| Endpoint Pattern | Method              | Domain                 |
| ---------------- | ------------------- | ---------------------- |
| `/context/*`     | POST/GET/PUT        | Memory                 |
| `/task/*`        | POST/GET/PUT        | Tasks                  |
| `/issue/*`       | POST/GET/PUT        | Issues                 |
| `/agent/*`       | POST/GET            | Agents                 |
| `/message/*`     | POST/GET            | Messages               |
| `/activity/*`    | GET                 | Activity               |
| `/locks/*`       | POST/GET/DELETE     | Resource Locks         |
| `/project/*`     | POST/GET            | Project Descriptors    |
| `/metrics`       | GET                 | Metrics                |
| `/logs`          | GET                 | Logs                   |
| `/feedback/*`    | POST/GET/PUT        | Feedback               |
| `/chat/*`        | POST/GET/DELETE     | Chat Rooms             |
| `/reset`         | POST                | System Reset           |
| `/auth/login`    | POST                | Authentication         |
| `/auth/register` | POST                | User Registration      |
| `/auth/me`       | GET                 | Current User           |
| `/auth/refresh`  | POST                | Token Refresh          |
| `/auth/api-keys` | POST/GET/DELETE     | API Key Management     |
| `/auth/health`   | GET                 | Auth Health            |
| `/dashboard`     | GET                 | Dashboard UI           |
| `/dashboard/*`   | GET                 | Dashboard SPA Fallback |
| `/ui`            | GET                 | Dashboard Redirect     |
| `/mcp/*`         | POST/GET/PUT/DELETE | MCP Registry           |

### Database Operations

- SQLite via `better-sqlite3` (synchronous, embedded)
- WAL mode for concurrent reads
- Foreign key constraints enabled
- FTS5 for full-text search

### Plugin Interactions

- Redis (optional): caching, pub/sub
- Browser (Playwright): web automation
- Knowledge Base: semantic search
- Emulator: Android device control

---

## Cross-References

| Flow               | Diagrams                     | Component Map                              | Error Paths                     | Visualizer                          |
| ------------------ | ---------------------------- | ------------------------------------------ | ------------------------------- | ----------------------------------- |
| MCP Startup        | `DIAGRAMS.md#startup-flow`   | `COMPONENT_INTERACTIONS.md#mcp-server`     | `ERROR_PATHS.md#startup-errors` | `FLOW_VISUALIZER.md#master-flow`    |
| Tool Execution     | `DIAGRAMS.md#tool-execution` | `COMPONENT_INTERACTIONS.md#tool-registry`  | `ERROR_PATHS.md#tool-errors`    | `FLOW_VISUALIZER.md#task-execution` |
| Memory CRUD        | `DIAGRAMS.md#memory-flow`    | `COMPONENT_INTERACTIONS.md#memory-domain`  | `ERROR_PATHS.md#memory-errors`  | `FLOW_VISUALIZER.md#pri-lifecycle`  |
| Task Coordination  | `DIAGRAMS.md#task-flow`      | `COMPONENT_INTERACTIONS.md#task-domain`    | `ERROR_PATHS.md#task-errors`    | `FLOW_VISUALIZER.md#lfi-lifecycle`  |
| Soft Locks         | `DIAGRAMS.md#lock-flow`      | `COMPONENT_INTERACTIONS.md#collaboration`  | `ERROR_PATHS.md#lock-errors`    | `FLOW_VISUALIZER.md#error-recovery` |
| Plugin System      | `DIAGRAMS.md#plugin-flow`    | `COMPONENT_INTERACTIONS.md#plugin-manager` | `ERROR_PATHS.md#plugin-errors`  | `FLOW_VISUALIZER.md#dev-access`     |
| Browser Automation | `DIAGRAMS.md#browser-flow`   | `COMPONENT_INTERACTIONS.md#browser-domain` | `ERROR_PATHS.md#browser-errors` | `FLOW_VISUALIZER.md#governance`     |

---

## Source Code References

| Flow             | Entry File                           | Key Functions                                                    |
| ---------------- | ------------------------------------ | ---------------------------------------------------------------- |
| MCP Server       | `mcp-server.js:1`                    | main()                                                           |
| HTTP API         | `server.js:1`                        | startServer()                                                    |
| CLI              | `bin/cli.js:1`                       | program.parse()                                                  |
| Dashboard        | `dashboard/routes.js:1`              | registerDashboardRoutes()                                        |
| Auth Login       | `src/core/auth/routes.js:1`          | handleLogin()                                                    |
| Auth Middleware  | `src/core/auth/index.js:1`           | requireAuth(), requireApiKey(), optionalAuth()                   |
| Tool Registry    | `src/core/mcp/tool-registry.js:1`    | register(), getTool(), getAllTools()                             |
| Tool Executor    | `src/core/mcp/tool-executor.js:14`   | execute()                                                        |
| DB Connection    | `src/core/database/connection.js:23` | connect(), disconnect()                                          |
| SQLite Init      | `src/core/database/sqlite/index.js`  | initializeDatabase()                                             |
| Memory Engine    | `utils/memoryEngine.js`              | detectAndResolveMemoryConflicts(), updateContextWithVersioning() |
| Coordination     | `utils/coordinationEngine.js`        | buildTaskSchedule(), autoAssignTask()                            |
| Collaboration    | `utils/collaborationEngine.js`       | acquireResourceLock(), releaseResourceLock()                     |
| Plugin Manager   | `core/plugin/plugin-manager.js:17`   | initialize(), \_loadPlugin()                                     |
| Activity Tracker | `utils/activityTracker.js`           | recordActivity()                                                 |
| Event Bus        | `utils/eventBus.js`                  | createEventBus()                                                 |
| Metrics          | `utils/metrics.js`                   | recordMetric()                                                   |
| Reset Engine     | `utils/resetEngine.js`               | resetMCP(), estimateResetImpact()                                |

---

## Reference Maintenance Log

### 2026-10-18

**Change:** Local Execution Sandbox — Phase 1 (contracts + policy foundation) added

**Classification:** ADDED

**Updated:**

- Added execution path `### 15. Execution Sandbox Flow` (submit → approve → execute → collect, fail-closed)
- Registered `src/core/execution/*`, `tools/executionTools.js`, the 6 execution tool schemas,
  `execution_jobs`/`execution_approvals` tables, and the two execution test suites (PRI)
- Recorded decision D-009 (audit reuses existing activity/metrics services)

**Verification:** FULL (flows vs `src/core/execution/index.js`, `audit.js`, `state-machine.js`; tools vs `tools/executionTools.js`; 40 execution tests green)

### 2026-10-07

**Change:** Registry governance closeout (gap G13) — added the MCP registry execution path

**Classification:** ADDED

**Updated:**

- Added execution path `### 14. MCP Registry Flow` (register → connect → discover → proxy)
- Added `/mcp/*` row to Inbound Endpoints (Express HTTP API)
- Cross-linked the registry error paths added to `ERROR_PATHS.md`

**Verification:** SPOT (tool names vs `tools/mcpRegistryTools.js`, modules vs `src/core/mcp-registry/`)

### 2026-09-19

**Change:** Initial LFI creation

**Classification:** ADDED

**Updated:**

- Created master logic flow index
- Documented all major execution paths
- Mapped state transitions
- Cross-referenced with PRI

**Verification:** FULL

### 2026-09-19

**Change:** Added FLOW_VISUALIZER.md with 8 Mermaid diagrams

**Classification:** ADDED

**Updated:**

- Created visual flow reference for developers
- Added master agent decision architecture flow
- Added PRI/LFI lifecycle diagrams
- Added task execution workflow
- Added cross-reference validation flow
- Added error recovery flow
- Added developer access point diagrams
- Added governance enforcement flow
- Updated cross-references to include visualizer

**Verification:** FULL

### 2026-10-17

**Change:** Dashboard client-side routing (commit `643fa30`)

**Classification:** UPDATED

**Updated:**

- Section 10 (Dashboard Serving Flow): added the `/dashboard/*` SPA fallback, initial-view resolution via `viewFromHash()` (empty/unknown hash → `overview`), and `hashchange`-driven navigation
- Inbound endpoints table: added `GET /dashboard/*` (SPA fallback)
- Last Updated: 2026-09-19 → 2026-10-17

**Verification:** SPOT (flow vs `dashboard/routes.js` and `dashboard/index.html`)

### 2026-09-19

**Change:** Added CLI, Dashboard, and Authentication execution paths

**Classification:** ADDED

**Updated:**

- Added section 9: CLI Command Execution (13 commands)
- Added section 10: Dashboard Serving Flow
- Added section 11: Authentication Login Flow
- Added section 12: API Key Management Flow
- Added section 13: Auth Middleware Flow
- Updated inbound endpoints table (6 new auth routes + 2 dashboard routes)
- Updated source code references (4 new entries)

**Verification:** FULL

---

_This LFI is maintained as part of the project's governance compliance. Update when project behavior changes significantly._
