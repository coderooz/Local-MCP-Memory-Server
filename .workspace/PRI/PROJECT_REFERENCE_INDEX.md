# Project Reference Index (PRI)

**Project:** local-mcp-memory
**Version:** 2.6.0
**Last Updated:** 2026-10-17
**Status:** Active

---

## Reference Metadata

| Field              | Value                                                                    |
| ------------------ | ------------------------------------------------------------------------ |
| Created            | 2026-09-19                                                               |
| Last Updated       | 2026-10-17                                                               |
| Last Verified      | 2026-10-17                                                               |
| Verification Type  | FULL                                                                     |
| Canonical Location | `.workspace/PRI/PROJECT_REFERENCE_INDEX.md`                              |
| Companion          | `.workspace/LFI/LOGIC_FLOW_INDEX.md`                                     |
| Legacy Location    | `.opencode/reference/PROJECT_REFERENCE_INDEX.md` (deprecated, preserved) |

---

## Project Identity

| Field         | Value                                                                              |
| ------------- | ---------------------------------------------------------------------------------- |
| Name          | local-mcp-memory                                                                   |
| Version       | 2.6.0                                                                              |
| Description   | Persistent multi-agent memory server implementing the Model Context Protocol (MCP) |
| Author        | Ranit Saha (contact@coderooz.in)                                                   |
| License       | MIT                                                                                |
| Repository    | https://github.com/coderooz/Local-MCP-Memory-Server                                |
| Homepage      | https://coderooz.github.io/Local-MCP-Memory-Server/                                |
| Runtime       | Node.js >=20.0.0                                                                   |
| Module System | ESM (ES2022+)                                                                      |

---

## Technology Stack

| Component          | Technology              | Version  |
| ------------------ | ----------------------- | -------- |
| Runtime            | Node.js                 | >=20.0.0 |
| Framework          | Express                 | 5.x      |
| Database           | SQLite (better-sqlite3) | ^13.0.3  |
| Language           | JavaScript (ESM)        | ES2022+  |
| Testing            | node:test               | Built-in |
| Linting            | ESLint                  | 8.x      |
| Formatting         | Prettier                | 3.x      |
| Docs               | GitHub Pages            | -        |
| Browser Automation | Playwright              | ^1.49.1  |

---

## Root Structure

```
local-mcp-memory/
├── mcp-server.js              # MCP stdio server entry (2879 lines)
├── server.js                  # Express HTTP API server (3314 lines)
├── mcp-shim.js                # MCP shim/bridge between MCP and API
├── startMemoryServer.js       # Shared memory server startup logic
├── agent-instruction.js       # Global agent instructions for MCP
├── mcp-integration-tools.js   # Integration tool definitions
├── migrate-project-id.js      # Project ID migration utility
│
├── bin/                       # CLI entry point
│   └── cli.js                 # Commander-based CLI (13 commands)
│
├── dashboard/                 # Visual dashboard interface
│   ├── index.html             # Dashboard web UI
│   └── routes.js              # Express routes for dashboard
│
├── src/                       # New modular source architecture
│   ├── core/                  # Core infrastructure
│   │   ├── auth/              # Authentication system (JWT + API keys)
│   │   │   ├── index.js       # AuthManager class + middleware
│   │   │   └── routes.js      # Auth HTTP routes
│   │   ├── database/          # SQLite database layer
│   │   └── mcp/               # MCP protocol infrastructure
│   ├── domains/               # Domain services (10 domains)
│   └── interfaces/            # API routes + MCP tool definitions
│
├── core/                      # Legacy core framework
│   ├── config/                # Configuration modules
│   ├── discovery/             # Project auto-discovery
│   ├── mcp/                   # Data models
│   ├── plugin/                # Plugin manager
│   └── integrations/          # Optional integrations (browser, knowledge, redis)
│
├── tools/                     # MCP tool implementations (7 files)
├── utils/                     # Shared utilities (15 files)
├── shared/utils/              # Logger, response formatter
├── plugins/emulator/          # Android emulator plugin
├── tests/                     # 23 test files
├── scripts/                   # Build/setup scripts
├── docs/                      # GitHub Pages site
├── prompt/                    # Prompt templates
├── assets/                    # Static assets (alert.mp3)
├── data/                      # Runtime data directory
├── .github/                   # CI/CD, issue templates, dependabot, CODEOWNERS
├── .opencode/                 # OpenCode project reference (legacy PRI)
└── .workspace/                 # PRI/LFI governance reference (canonical)
```

---

## Directory Reference

### `src/`

Type: New modular source architecture

Purpose: Domain-driven source code organized by business capability.

Contains:

- `core/` — Database, MCP protocol, session management
- `domains/` — 10 domain services (activity, agent, browser, chat, feedback, issue, memory, metrics, project, task)
- `interfaces/` — Express API routes and MCP tool definitions

Related:

- `core/` — Legacy core framework (being superseded)
- `utils/` — Shared utilities

### `src/core/database/`

Type: Database abstraction layer

Purpose: Provides MongoDB-compatible API over SQLite.

Contains:

- `connection.js` — Connection manager (connect, disconnect, getDb, getCollection)
- `models.js` — Data models (MongoDB-compatible API)
- `sqlite/` — SQLite embedded module
  - `connection.js` — SQLite connection (WAL, busy timeout, foreign keys)
  - `schema.js` — Schema definitions (19 tables + FTS5)
  - `query-builder.js` — MongoDB→SQLite query translator
  - `collection.js` — MongoDB-compatible Collection class
  - `index.js` — Main DB wrapper

### `src/core/auth/`

Type: Authentication system

Purpose: JWT-based authentication, API key management, and middleware.

Contains:

- `index.js` — AuthManager class (JWT tokens, API keys, password hashing, middleware)
- `routes.js` — Auth HTTP routes (login, register, refresh, API key CRUD)

Features:

- JWT token generation and verification
- API key creation and management
- PBKDF2 password hashing
- Role-based access control (admin, agent, user)
- Rate limiting on auth endpoints

### `src/core/mcp/`

Type: MCP protocol infrastructure

Purpose: Tool registration and execution for MCP protocol.

Contains:

- `tool-registry.js` — Tool registration (ToolRegistry class)
- `tool-executor.js` — Tool execution with middleware pipeline

### `src/core/mcp-registry/`

Type: MCP server registry (v2.6.0)

Purpose: Register, connect, proxy, and health-track external MCP servers; expose their tools.

Contains:

- `index.js` — Registry core (CRUD, connect/disconnect, tool discovery, HTTP proxy, health, dynamic tool cache)
- `routes.js` — 11 HTTP endpoints under `/mcp/*` (writes require JWT/API key, reads use optional auth)
- `proxy.js` — JSON-RPC forwarding for HTTP/HTTPS servers (stdio servers are metadata-only)
- `crypto.js` — AES-256-GCM credential encryption (`enc:v1:` prefix, keyed by `MCP_MASTER_SECRET`)
- `../../../tools/mcpRegistryTools.js` — 9 MCP tool definitions + handler dispatcher

### `src/core/execution/`

Type: Execution Sandbox domain (NEW — Local Execution Sandbox, Phase 1)

Purpose: Orchestrates approved-task and restricted-script execution behind policy, approval,
durable job state, and audit. **Fail-closed:** in Phase 1 no process is ever spawned; real
execution is gated on a Docker isolation backend (Phase 2) and a feature flag
(`features.executionSandbox`, default `false`).

Modules:

- `errors.js` — Stable error codes (`IDENTITY_REQUIRED`, `POLICY_DENIED`, `SANDBOX_START_FAILED`, …)
- `state-machine.js` — Validated 15-state job lifecycle + transition table
- `policy.js` — Deterministic effective-policy computation (requested perms can only narrow)
- `runtime-registry.js` — Trusted runtime allowlist (python/node); never client-supplied paths
- `tasks-registry.js` — Versioned approved-task definitions (read-only)
- `repository.js` — Durable `execution_jobs` persistence, optimistic concurrency, idempotency
- `approval.js` — Hash-bound, expiring, replay-proof approvals; self-approval forbidden
- `sandbox-adapter.js` — Replaceable backend abstraction (Docker stub, fail-closed)
- `workspace.js` — Isolated-workspace manager interface (containment in Phase 3)
- `result-collector.js` — Bounded result normalization + redaction
- `audit.js` — Narrow adapter over existing activity/metrics services (redaction + truncation)
- `index.js` — Execution service orchestrating the above
- `service-bridge.js` — Bridges tool handlers to the collection-wrapped `getDb`

Integrations: `src/interfaces/mcp-tools/execution-tool-definitions.js` (6 tool schemas) and
`tools/executionTools.js` (handlers), registered additively in `mcp-server.js`. Persistence in
`src/core/database/sqlite/schema.js` (`execution_jobs`, `execution_approvals` + indexes).

### `src/domains/`

Type: Domain services

Purpose: Business logic organized by domain.

Domains:

- `activity/` — Activity stream tracking
- `agent/` — Agent registration and heartbeats
- `browser/` — Browser automation (Playwright)
- `chat/` — Chat room system
- `feedback/` — Feedback management
- `issue/` — Issue tracking
- `memory/` — Memory CRUD + versioning + conflict detection
- `metrics/` — Metrics collection
- `project/` — Project descriptors and maps
- `task/` — Task management and coordination

### `src/interfaces/`

Type: Interface layer

Purpose: External-facing interfaces (API + MCP).

Contains:

- `api/routes.js` — Express HTTP API route handlers
- `mcp-tools/tool-definitions.js` — MCP tool schema definitions

### `core/`

Type: Legacy core framework

Purpose: Configuration, discovery, models, plugins, integrations.

Contains:

- `config/` — connectionResolver, portManager, project-config-loader, runtime-state
- `discovery/` — discovery-module.js (project auto-discovery)
- `mcp/` — models.js (all data models)
- `plugin/` — plugin-manager.js (dynamic plugin loading)
- `integrations/` — browser/, knowledge/, redis/ (optional integrations)

### `core/plugin/`

Type: Plugin system

Purpose: Dynamic plugin loading and lifecycle management.

Contains:

- `plugin-manager.js` — PluginManager class with init/register/shutdown lifecycle

Supported plugins: redis, browser, knowledgeBase, emulator

### `bin/`

Type: CLI entry point

Purpose: Command-line interface for interacting with the MCP memory server.

Contains:

- `cli.js` — Commander-based CLI with 13 commands:
  - `start` — Start the MCP server
  - `stop` — Stop the MCP server
  - `status` — Show server status
  - `search` — Search memory
  - `create-task` — Create a new task
  - `list-tasks` — List tasks
  - `create-issue` — Create an issue
  - `list-issues` — List issues
  - `list-agents` — List registered agents
  - `health` — Check server health
  - `store` — Store context in memory
  - `config` — Show configuration
  - `init` — Initialize a new project

Usage:

```bash
# Via npm
npx mcp-memory start
npx mcp-memory status

# Via npm script
npm run cli -- start
npm run cli -- status
```

### `dashboard/`

Type: Visual dashboard interface

Purpose: Web-based UI for managing memory, tasks, issues, and agents.

Contains:

- `index.html` — Dashboard web UI (single-page application with client-side hash router)
- `routes.js` — Express routes serving the app shell plus a `/dashboard/*` SPA fallback (54 lines)

Features:

- Client-side hash routing (`#/overview`, `#/memory`, `#/tasks`, …) — deep-linkable, refresh-safe, and Back/Forward-aware; unknown hashes fall back to Overview
- Server-side SPA fallback: any path under `/dashboard` serves the app shell instead of 404
- Overview dashboard with stats (tasks, issues, agents, activity)
- Memory search interface
- Task management view
- Issue tracking view
- Agent monitoring view
- Activity stream view
- Settings view
- Authentication integration (JWT login)

Access:

```bash
# Start server with dashboard
npm run start:dashboard

# Or access via browser
open http://localhost:PORT/dashboard
```

### `tools/`

Type: MCP tool implementations

Purpose: Concrete implementations of MCP tool handlers.

Contains:

- `index.js` — Tool aggregator
- `browserTools.js` — Browser automation tools (24 tools)
- `chatTools.js` — Chat system tools
- `emulatorTools.js` — Android emulator tools
- `feedbackTools.js` — Feedback tools
- `mcpRegistryTools.js` — MCP server registry tools (9 tools + handler dispatcher)
- `executionTools.js` — Execution Sandbox tools (6 tools: execution_submit/status/result/list/cancel/approve + handler dispatcher)
- `notificationTools.js` — Notification/alert tools
- `store_context.js` — Memory storage tool

### `utils/`

Type: Shared utilities

Purpose: Cross-cutting concerns used by multiple modules.

Contains:

- `activityTracker.js` — Activity stream management
- `collaborationEngine.js` — Soft lock system
- `coordinationEngine.js` — Task scheduling, auto-assignment
- `eventBus.js` — Event system
- `memoryEngine.js` — Memory CRUD, versioning, conflict detection
- `metrics.js` — Metrics collection
- `projectIdentity.js` — Project identity resolution
- `rate-limiter.js` — Rate limiting
- `resetEngine.js` — System reset with safety locks
- `routeHandler.js` — Express route handler abstraction
- `security-validators.js` — Input sanitization
- `mcp-agent-client.js` — MCP agent client
- `mcp-connection-manager.js` — MCP connection management
- `mcp-port-registry.js` — MCP port registry
- `mcp-setup-manager.js` — MCP setup management

### `tests/`

Type: Test suite

Purpose: Automated tests for all subsystems.

Contains 25 test files covering: app E2E (DB→UI), browser, chaos, chat, conflict detection, database integrity, emulator, **execution policy (24)**, **execution integration (16)**, feedback, integration, MCP architecture, MCP chaos resilience, MCP registry, MCP resilience, MCP stdio stabilization, multi-agent coordination, multi-node, multi-project isolation, persistent agent registry, session isolation, stress, validation, vulnerability.

`npm test` runs `npm run check` (syntax) plus 5 suites — feedback (7), chat (9), mcp-registry (24), database integrity (34), app E2E (15) — 89 tests total. The two Execution Sandbox suites are run standalone: `npm run test:execution` (policy 24 + integration 16 = 40 tests, no process spawned). The `npm test` aggregate gate is unchanged by the sandbox work; app E2E (15) is red for the pre-existing environmental runtime-identity reason (see `FAILURE_REGISTER.md` FR-003).

### `docs/`

Type: GitHub Pages documentation site

Purpose: Public-facing documentation and API reference.

Contains: HTML/CSS/JS site with connection lifecycle docs, reliability docs.

### `.github/`

Type: GitHub configuration

Purpose: CI/CD, community, and repository management.

Contains:

- `workflows/` — 7 workflow files (ci, auto-tag, release, security, labeler, stale, welcome)
- `CODEOWNERS` — Code ownership
- `dependabot.yml` — Dependency updates
- `FUNDING.yml` — Sponsorship
- `ISSUE_TEMPLATE/` — Issue templates
- `PULL_REQUEST_TEMPLATE.md` — PR template
- `labeler.yml` — Auto-labeling rules

---

## Entry Points

| File                   | Purpose                         | How to Run                        |
| ---------------------- | ------------------------------- | --------------------------------- |
| `mcp-server.js`        | MCP stdio server                | `npm start`                       |
| `server.js`            | Express HTTP API                | `npm run start:api`               |
| `mcp-shim.js`          | MCP shim for editor integration | `node /path/to/mcp-shim.js`       |
| `startMemoryServer.js` | Shared startup logic            | Used by other entry points        |
| `bin/cli.js`           | CLI interface                   | `npx mcp-memory`                  |
| `dashboard/index.html` | Visual dashboard UI             | `http://localhost:PORT/dashboard` |

---

## MCP Tool Surface

### Memory Tools

- `store_context` — Store persistent memory
- `search_context` — Search stored memory
- `update_context` — Update memory with version tracking
- `get_full_context` — Retrieve context with all actions
- `get_connected_context` — Retrieve context with related entities
- `optimize_memory` — Run memory optimization

### Project Intelligence Tools

- `set_project_descriptor` — Store/update project descriptor
- `get_project_descriptor` — Fetch project descriptor
- `create_project_map` — Store project-map entries
- `fetch_project_map` — Fetch project-map entries

### Task Tools

- `create_task` — Create coordination tasks
- `fetch_tasks` — Fetch tasks with filters
- `assign_task` — Claim/assign tasks
- `update_task` — Update task status/blockers

### Issue Tools

- `create_issue` — Create issues/notes/blockers
- `resolve_issue` — Resolve issues
- `fetch_issues` — Fetch issues with filters

### Agent Tools

- `register_agent` — Register agents
- `heartbeat_agent` — Send agent heartbeats
- `list_agents` — List registered agents

### Communication Tools

- `send_message` — Send messages between agents
- `request_messages` — Fetch messages for current agent

### Collaboration Tools

- `record_activity` — Append activity entries
- `fetch_activity` — Fetch activity stream
- `acquire_resource_lock` — Acquire soft locks
- `release_resource_lock` — Release soft locks
- `fetch_resource_locks` — Fetch active locks

### System Tools

- `fetch_metrics` — Fetch task/memory metrics
- `log_action` — Log actions for traceability
- `get_logs` — Retrieve system logs
- `get_agent_instructions` — Get agent instructions
- `reset_mcp` — Execute reset operations
- `estimate_reset_impact` — Preview reset impact

### MCP Registry Tools (9 tools)

- Registration: `register_mcp_server`, `unregister_mcp_server`
- Discovery: `list_mcp_servers`, `get_mcp_server`, `discover_mcp_tools`
- Connection: `connect_mcp_server`, `disconnect_mcp_server`
- Proxy: `proxy_mcp_call` — forward a JSON-RPC call to a connected HTTP server
- Health: `get_mcp_health` — status, latency, error count

### Browser Automation Tools (24 tools)

- Session: `open_browser`, `close_browser`, `get_active_sessions`
- Navigation: `navigate_to_url`, `reload_page`, `go_back`, `go_forward`
- DOM: `click_element`, `fill_input`, `get_element_text`, `get_elements`, `wait_for_selector`
- Page Info: `get_page_title`, `get_current_url`, `get_page_content`
- Control: `set_viewport`, `clear_cookies`, `get_cookies`, `set_cookies`
- Execution: `evaluate_javascript`, `take_screenshot`, `wait_for_timeout`

---

## Database Tables (SQLite)

19 tables, created by `src/core/database/sqlite/schema.js` (`createSchema()`), asserted by
`tests/database-integrity-test.js`.

| Table             | Purpose                        | Key Indexes                                                                  |
| ----------------- | ------------------------------ | ---------------------------------------------------------------------------- |
| `contexts`        | Memory entries (FTS5 indexed)  | project, type, lifecycle, agent, session, importance, updated                |
| `memory_versions` | Memory version history         | context_id, project, changedAt                                               |
| `actions`         | Action logging                 | contextRefs, session, (agent, project)                                       |
| `sessions`        | Session tracking               | session, status, (agent, project)                                            |
| `agents`          | Agent registry                 | agent_id, (project, status), session                                         |
| `tasks`           | Coordination tasks             | task_id, (project, status, priority), (project, assigned_to), idempotencyKey |
| `messages`        | Inter-agent messages           | message_id, (project, to_agent), session                                     |
| `issues`          | Issues/notes/blockers          | issue_id, (project, status, type), relatedTasks, relatedContexts             |
| `project_map`     | Codebase intelligence (FTS5)   | (project, type), file_path, session                                          |
| `activity`        | Activity stream                | (project, timestamp), (project, related_task, timestamp), (agent, timestamp) |
| `resource_locks`  | Soft locks                     | (project, resource) UNIQUE, locked_by, expiresAt                             |
| `metrics`         | System metrics                 | (project, metric_type, name), session, recordedAt                            |
| `feedbacks`       | Feedback + voting              | (project, status, type), feedback_id, voters                                 |
| `chat_rooms`      | Chat rooms                     | (project, room_scope), participants, room_id                                 |
| `chat_messages`   | Chat messages                  | room_id, from_agent, idempotencyKey                                          |
| `logs`            | Operational logs               | created, session, (type, created)                                            |
| `emulators`       | Android emulator registry      | emulator_id, (project, status)                                               |
| `connections`     | MCP client connections         | connectionId, clientId, (state, lastActivityAt)                              |
| `mcp_servers`     | MCP server registry (external) | (project, status), server_id, type                                           |

### Full-Text Search (FTS5)

- `contexts_fts` — Full-text search on contexts
- `project_map_fts` — Full-text search on project_map

---

## Configuration

### Environment Variables

| Variable      | Required | Default                | Purpose                 |
| ------------- | -------- | ---------------------- | ----------------------- |
| `MCP_DB_PATH` | No       | `./data/mcp-memory.db` | SQLite database path    |
| `PORT`        | No       | `0` (dynamic)          | API server port         |
| `MCP_PROJECT` | No       | directory name         | Project identifier      |
| `MCP_AGENT`   | No       | `unknown`              | Agent identifier        |
| `MCP_SCOPE`   | No       | `project`              | Memory visibility scope |
| `NODE_ENV`    | No       | `development`          | Environment mode        |

### Config Files

| File                                | Purpose                | Gitignored |
| ----------------------------------- | ---------------------- | ---------- |
| `.env`                              | Environment variables  | Yes        |
| `.env.example`                      | Environment template   | No         |
| `local-mcp-memory.project-mcp.json` | MCP project config     | No         |
| `mcp.json`                          | MCP server config      | No         |
| `mcp.config.json`                   | MCP config template    | No         |
| `opencode.jsonc`                    | OpenCode configuration | No         |

---

## Scripts & Commands

```bash
# Start MCP stdio server
npm start

# Start Express HTTP API
npm run start:api

# Start with dashboard
npm run start:dashboard

# CLI commands
npm run cli -- start
npm run cli -- status
npm run cli -- search "query"
npm run cli -- create-task "title"
npm run cli -- list-tasks
npm run cli -- health

# Syntax validation
npm run check

# Linting
npm run lint
npm run lint:fix

# Formatting
npm run format
npm run format:check

# Full test suite
npm test

# Specific tests
npm run test:feedback
npm run test:chat
npm run test:emulator

# Chaos resilience testing
npm run chaos:test
npm run test:chaos:resilience

# Project ID migration
npm run migrate:project-id

# Documentation screenshots
npm run docs:screenshots
```

---

## CI/CD

| Workflow       | Trigger         | Purpose                |
| -------------- | --------------- | ---------------------- |
| `ci.yml`       | Push/PR         | Lint, test, build      |
| `auto-tag.yml` | Version push    | Auto-tag releases      |
| `release.yml`  | Manual          | Create GitHub releases |
| `security.yml` | Schedule        | Security scanning      |
| `labeler.yml`  | PR              | Auto-label PRs         |
| `stale.yml`    | Schedule        | Mark stale issues      |
| `welcome.yml`  | New contributor | Welcome message        |

---

## Key Dependencies

| Package          | Purpose                    | Version |
| ---------------- | -------------------------- | ------- |
| `express`        | HTTP framework             | ^5.2.1  |
| `better-sqlite3` | Database driver            | ^13.0.3 |
| `playwright`     | Browser automation         | ^1.49.1 |
| `dotenv`         | Environment loading        | ^17.3.1 |
| `uuid`           | Unique identifiers         | ^13.0.0 |
| `commander`      | CLI framework              | ^15.0.0 |
| `jsonwebtoken`   | JWT authentication         | ^9.0.3  |
| `mongodb`        | Legacy dependency (unused) | ^7.1.0  |

---

## External Dependencies

| Service             | Purpose            | Required       |
| ------------------- | ------------------ | -------------- |
| SQLite (embedded)   | Primary database   | Yes (embedded) |
| Node.js 20+         | Runtime            | Yes            |
| Playwright browsers | Browser automation | Optional       |

---

## Architectural Relationships

```
mcp-server.js (MCP stdio entry)
  ├── startMemoryServer.js → server.js (Express HTTP API)
  ├── agent-instruction.js (global instructions)
  ├── tools/ (MCP tool handlers)
  │   └── src/interfaces/mcp-tools/tool-definitions.js (schemas)
  ├── src/core/mcp/tool-registry.js → tool-executor.js
  └── utils/ (shared engines)

server.js (Express HTTP API)
  ├── src/core/database/sqlite/index.js (DB layer)
  ├── src/domains/ (10 domain services)
  ├── core/mcp/models.js (data models)
  ├── utils/ (engines: memory, coordination, collaboration, etc.)
  └── core/plugin/plugin-manager.js (plugin system)

Database Flow:
  Request → API Route → Domain Service → Models → SQLite
  MCP Tool → Tool Handler → Domain Service → Models → SQLite
```

---

## Known Limitations

1. Auth guards only the `/mcp/*` registry routes (JWT + API keys); core API routes are unauthenticated by default
2. No encryption at rest (use filesystem-level encryption)
3. Browser automation requires Playwright browser installation
4. Single-process architecture (no horizontal scaling)
5. SQLite is embedded (no network access, single-writer)
6. Legacy MongoDB dependency still in package.json (unused)

---

## Governance Files

| File                  | Purpose                  | Location                         |
| --------------------- | ------------------------ | -------------------------------- |
| `AGENTS.md`           | Project rules for agents | Root                             |
| `BEHAVIOR.md`         | Behavioral instructions  | Root                             |
| `GOVERNANCE.md`       | Global governance rules  | `~/.config/opencode/`            |
| `PROJECT_WORKFLOW.md` | Global project workflow  | `~/.config/opencode/governance/` |
| `LOGIC_FLOW_INDEX.md` | Behavioral map (LFI)     | `.workspace/LFI/`                |

---

## Reference Maintenance Log

### 2026-10-17

**Change:** Post-snapshot sync with commit `643fa30` — dashboard routing + line-count refresh

**Classification:** UPDATED

**Updated:**

- Root Structure: corrected stale line counts `mcp-server.js` 2766 → 2879, `server.js` 3291 → 3314
- `### dashboard/`: documented the client-side hash router in `index.html` and the `/dashboard/*` SPA fallback in `routes.js` (now 54 lines)
- `### dashboard/` Features: added hash routing (deep links, refresh, Back/Forward, unknown-hash fallback → Overview) and the server-side fallback
- Last Updated / Last Verified: 2026-10-07 → 2026-10-17

**Verification:** SPOT (line counts vs disk; dashboard section vs `dashboard/routes.js` and `dashboard/index.html`)

### 2026-10-07

**Change:** Registry governance closeout (gap G13) — PRI sync with the v2.6.0 MCP registry work

**Classification:** UPDATED

**Updated:**

- Database Tables: replaced the stale 18-row table (phantom `context_versions`, `project_descriptors`, `decisions`, `constraint_violations`, `migrations`) with the 19 real tables asserted by `tests/database-integrity-test.js`, including `mcp_servers`
- `src/core/database/`: corrected `schema.js` "18 tables" → 19 tables
- Added `### src/core/mcp-registry/` module section (`index.js`, `routes.js`, `proxy.js`, `crypto.js` — verified on disk)
- Added `tools/mcpRegistryTools.js` to the `tools/` inventory
- Added "MCP Registry Tools (9 tools)" to MCP Tool Surface using the actual registered names
- Tests: corrected 20 → 23 test files; documented `npm test` = `check` + 5 suites / 89 tests
- Project Identity: corrected stale `Version 2.5.0` → `2.6.0` (matches `package.json`)
- Documentation sync: replaced MongoDB-era claims with SQLite in `README.md`, `DEVELOPMENT.md`, `BEHAVIOR.md`, `CONTRIBUTING.md`, `SUPPORT.md`, `.env.example`, and `.github/ISSUE_TEMPLATE/general.md`; added the 9 registry tools + dashboard/auth to README
- `Known Limitations` #1: corrected to reflect the implemented `src/core/auth/` (JWT + API keys, enforced on `/mcp/*` by `requireAuth`)
- Version drift: corrected remaining `2.5.0` strings (`bin/cli.js`, `mcp-server.js`, `server.js` ×2, `DEVELOPMENT.md`, 3 LFI headers) → `2.6.0`

**Flagged, not changed (out of scope):**

- `.opencode/reference/PROJECT_REFERENCE_INDEX.md` (deprecated) still carries draft registry tool names and awaits migration per governance

**Verification:** SPOT (tables/indexes vs `schema.js`, file existence vs disk, tool names vs `tools/mcpRegistryTools.js`, test counts vs `tests/`)

### 2026-09-19

**Change:** Migrated PRI from `.opencode/reference/` to `.workspace/PRI/` (governance v2.0 compliance)

**Classification:** MOVED

**Updated:**

- Canonical location: `.opencode/reference/` → `.workspace/PRI/`
- Tech Stack: corrected `better-sqlite3` version from `11.x` → `^13.0.3`
- Added `mongodb` as legacy unused dependency in Key Dependencies
- Added Reference Metadata section with `last_verified` field
- Added Architectural Relationships section
- Added LFI cross-reference in Governance Files
- Added Companion field in Reference Metadata

**Verification:** FULL

---

_Prior maintained as part of the project's governance compliance. Update when project structure changes significantly._
