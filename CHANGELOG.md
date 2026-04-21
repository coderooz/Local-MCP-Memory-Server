# Changelog

All notable changes to this project will be documented in this file.

This project follows a structured change history to track architectural evolution, MCP protocol updates, and system-level improvements.

---

## [v2.5.0] - Release Hardening & Cleanup

### Removed
- Generated/broken MCP test configs: `mcp-broken-*.project-mcp.json`, `mcp-stdio-test-*.project-mcp.json`, `shim-test-*.project-mcp.json`, `tmp-*.project-mcp.json`
- Temporary runtime file: `.mcp-runtime.json`

### Documentation Updates
- Static docs site (docs/) remains GitHub Pages ready
- reliability.md aligned with chaos testing methodology
- connection-lifecycle.md reflects current runtime state management

---

## [v2.4.0] - Identity Resolution & Reset System

### Added
- Standalone release chaos script: `scripts/chaos-test.js`
  - 50-100 parallel mixed MCP tool calls
  - controlled invalid-input ratio
  - retry-aware read scenarios
  - multi-session isolation verification
  - structured JSON pass/fail summary output

### Reliability Improvements
- MCP HTTP call path now includes:
  - request timeout + abort handling
  - safe-operation retries only
  - circuit-breaker fast-fail behavior
  - health-probe throttling/deduplication under load
- Tool call input validation hardened against malformed schemas/oversized payloads
- MCP JSON-RPC error payloads standardized with structured `error.data`
- Parse-error handling for malformed stdin input now returns JSON-RPC `-32700`

### Observability
- `/health` now includes session visibility (`active`, `idle`, `total`) alongside uptime, DB, and connection status

### Validation
- `tests/mcp-stdio-stabilization-test.js` passes
- `tests/mcp-chaos-resilience-test.js` passes
- `scripts/chaos-test.js` passes and returns release gate `READY`

---

## [v2.5.0] - Runtime-Free + Config-Driven Architecture

### Critical Architectural Change
**REMOVED ALL FILE-BASED RUNTIME STATE + NEW CONFIG SYSTEM**

The MCP system now operates completely without runtime files AND uses a unified project-level config.

### What Changed
- Removed `.mcp-runtime.json` - no longer created or read
- All runtime state now stored only in-memory
- Discovery now uses health-based verification instead of file reading
- Unified `[project].project-mcp.json` as single source of truth
- Config auto-generated if missing

### Discovery Mechanism
- Agents scan ports from config `connection.preferredPortRange` (default: 4000-4010)
- Fallback to config `connection.fallbackPorts` if range scan fails
- Call `/health` endpoint on each port
- Validate response includes `service: "MCP"` AND `project` matches config
- Connect to validated MCP server
- Cache last-known port in-memory only (5s TTL)

### MCP Health Endpoint
MCP server returns identity verification in `/health`:
```json
{
  "service": "MCP",
  "status": "ok",
  "version": "2.5.0",
  "project": "local-mcp-memory"
}
```

### Connection Strategy
- Uses config `connection.strategy` (default: "fast-discovery")
- Config-driven retry settings from `connection.retry`
- Health check timeout from `connection.healthCheck.timeout`
- All connection parameters loaded from config

### Multi-Agent Support
- Multiple agents can independently discover and connect to ONE MCP server
- No shared filesystem state required
- Each agent has own in-memory runtime state
- MCP identity validated before connection

### New Config Structure
```json
{
  "project": { "name": "", "scope": "project", "environment": "development" },
  "connection": {
    "strategy": "fast-discovery",
    "preferredPortRange": [4000, 4010],
    "fallbackPorts": [3000, 4000, 5000, 8080, 8888],
    "retry": { "maxRetries": 5, "backoff": "exponential", "baseDelay": 200 }
  },
  "agent": { "autoRegister": true, "permissions": { "allowToolExecution": true } },
  "behavior": { "ignore": [...], "askBefore": [...], "autoApprove": [...] },
  "features": { "multiAgent": true, "chat": true, "emulator": true, ... }
}
```

### Config Validation
- FORBIDDEN keys: port, pid, runtime, password, secret_, token, etc.
- Auto-migrates old `mcp.*` config format to new `connection.*` format
- Falls back to defaults if config invalid

### Files Modified
- `core/config/runtime-state.js` - in-memory only, uses config for ports
- `core/config/project-config-loader.js` - complete rewrite with new structure
- `utils/mcp-port-registry.js` - health-based discovery
- `utils/mcp-setup-manager.js` - config-driven setup
- `utils/mcp-connection-manager.js` - config-driven retry/health
- `server.js` - added `service: "MCP"` to health endpoint
- `local-mcp-memory.project-mcp.json` - new config format

### Test Results
All 19 resilience tests pass ✅

---

## [v2.5.2] - Multi-Node Connection Support

### Fixed
- Multi-node MCP connection issue - enable multiple terminals to connect to single MCP server
- Isolation layer was incorrectly blocking port discovery across nodes
- Runtime cache never refreshed - added TTL-based cache invalidation (500ms)
- PID validation failed for cross-node connections - now port check is primary, PID optional
- Removed strict PID validation blocking valid connections

### Root Cause
1. **Cache never refreshed**: Each node cached runtime state forever, so Node B couldn't see Node A's port
2. **PID check was too strict**: `process.kill(pid, 0)` fails for cross-parent PIDs
3. **Validation blocked all**: If PID was invalid, connection was rejected even if port was alive

### Architecture Changes
- Runtime cache now auto-refreshes after 500ms TTL
- `isValidPID()` no longer blocks connection if port is alive
- `validateRuntime()` prioritizes port liveness over PID validation
- Shared `.mcp-runtime.json` is now read fresh across all nodes

---

## [v2.5.1] - Connection Lifecycle & Recovery Fix

### Fixed
- MCP error -32603: Cannot read properties of null (reading 'port')
- Added runtime validation layer with `validateRuntime()` function
- Added `isValidPID()` - validates PID before use
- Added `isPortAlive()` - validates port is actually listening
- Added `invalidateRuntime()` - safely clears stale runtime state
- Implemented automatic runtime cleanup on stale detection
- Added shutdown hooks to both server.js and mcp-server.js
- Port registry now validates PID + port liveness before returning

### Root Cause
Stale `.mcp-runtime.json` contained valid-looking PID/port but process was dead or port not listening. System didn't validate before using.

---

## [v2.5.0] - Configuration Refactoring & Stability

### Critical Architectural Changes

**Configuration System Overhaul**

* Created unified configuration system with single source of truth
* Implemented `.project-mcp.json` as primary static configuration
* Split configuration into static config and runtime state:
  * Static: `[project].project-mcp.json` - version controlled
  * Runtime: `.mcp-runtime.json` - auto-generated, git-ignored
* Added `core/config/project-config-loader.js` for centralized config loading
* Added `core/config/runtime-state.js` for runtime state management
* Configuration validation with forbidden keys (no secrets in config)
* Default fallback when config missing

**Port & Connection System Stabilization**

* Fixed null port crashes - eliminated `Cannot read properties of null (reading 'port')`
* Normalized port return types from objects to number|null
* Added `ensurePort()` validation utility
* Implemented `waitForPort()` with exponential backoff retry
* Implemented `waitForMcpServer()` with health check
* Removed duplicate `discoverPort()` methods
* Port registry now returns clean number types

**Concurrency & Reliability Hardening**

* Task assignment now atomic with version check
* Task ownership validation - only assigned agent can update
* Task retry with backoff (max 3 attempts)
* Message ordering with sequence counter
* Message idempotency with `idempotencyKey`
* Agent isolation enforced at project level

**Null Safety**

* All port getters are null-safe
* Connection manager handles missing port gracefully
* Fallback port discovery on file missing
* Runtime state recovery on file corruption

### New Features

* `local-mcp-memory.project-mcp.json` - new static config format
* `.mcp-runtime.json` - runtime state tracking
* `ensurePort()` - strict port validation
* `waitForPort()` - retry-enabled port discovery
* `waitForMcpServer()` - health check with retry
* Runtime state functions: `setMcpRunning()`, `setMcpStopped()`, `isMcpRunning()`

### Changed

* Connection manager now reads from runtime state
* Port registry returns number types only
* Task service uses atomic operations
* Chat service includes sequence ordering

### Security Improvements

* No database credentials in config files
* No static ports hardcoded
* Agent isolation enforced
* Input sanitization validated

---

## [v2.4.0] - Identity Resolution & Reset System

### Critical Fixes

**Identity Resolution System Overhaul**

* Completely rewrote `utils/projectIdentity.js` to enforce strict configuration hierarchy:
  * Priority 1: Project-level config (.mcp-project, .mcp-project.json)
  * Priority 2: Global config (~/.mcp/config.json)
  * Priority 3: Environment variables (MCP_PROJECT, MCP_AGENT)
  * Priority 4: THROWS MCPSetupRequiredError if no config found
* Added `MCPSetupRequiredError` custom error class for missing configuration
* Added `CONFIG_HIERARCHY` enum for tracking configuration source
* Added `checkConfigExists()` function for pre-flight configuration validation
* Added `setupMCP()` function for auto-configuration generation
* Added `getSetupPrompt()` function for interactive setup guidance
* Added `resolveIdentity()` function with strict mode (throws on missing config)
* Fixed agent/project resolution to NOT silently fall back to "unknown"/"default"
* Added agent and scope resolution to project identity (previously only resolved project)
* Added source and hierarchy tracking to all identity returns

**Agent Instructions Update**

* Updated `agent-instruction.js` to include:
  * Configuration hierarchy documentation
  * Setup flow for missing configuration
  * MCP Reset System documentation
  * Strict identity validation rules
* Added requirement: "NEVER operate with agent='unknown' or project='default'"
* Added workflow step 0: Verify identity resolution succeeded

### New Features

**MCP Reset System**

* Added `utils/resetEngine.js` - Complete reset management system with safety locks
* Added reset levels:
  * MINOR: Clean logs, temp contexts, stale sessions (preserves tasks/agents)
  * MODERATE: Clean completed tasks, archived contexts
  * MAJOR: Clean most data except active tasks and agents
  * SEVERE: Complete wipe - REQUIRES explicit "MCP_RESET_CONFIRM" code
* Added safety features:
  * Severe resets require explicit "MCP_RESET_CONFIRM" confirmation
  * All reset operations are logged to activity stream
  * Detailed summary returned for all operations
  * `estimateResetImpact()` for preview before reset
* Added API endpoints:
  * POST /reset - Execute reset operation
  * GET /reset/estimate - Preview reset impact
  * GET /config/status - Check configuration status
* Added `reset_mcp` MCP tool for agent-accessible reset operations

**Function Documentation**

* Added comprehensive JSDoc documentation to all core functions:
  * `utils/projectIdentity.js`: All functions documented with examples
  * `utils/resetEngine.js`: All functions documented with parameters and return values
* Added `@param`, `@returns`, `@throws`, `@example` to all public functions
* Added `@readonly` and `@enum` annotations for constants

### Breaking Changes

* Identity resolution now THROWS `MCPSetupRequiredError` instead of silently using "unknown"/"default"
* Server will not start without valid configuration (unless NODE_ENV=test)
* Severe reset now requires explicit project target (cannot wipe entire database)

### Migration Guide

1. **For existing projects**: Create `.mcp-project` file or set MCP_PROJECT/MCP_AGENT env vars
2. **For agents**: Update to handle `MCPSetupRequiredError` and prompt for setup if thrown
3. **For severe resets**: Must now provide project target AND "MCP_RESET_CONFIRM" code

### Security Improvements

* Added explicit confirmation requirement for destructive operations
* Added configuration validation to prevent misconfigured agents
* Added audit trail for all reset operations
* Added input sanitization (`sanitizeIdentifier()`) to strip XSS patterns from agent IDs
* Stripping of `<>`, `javascript:`, and `on*=`` patterns from user inputs

### Bug Fixes

* Fixed `fs.readFileSync(filePath, 0)` encoding bug - Changed to `fs.readFileSync(filePath, "utf8")`
* Fixed agent registration to use resolved identity when project/agent not explicitly provided
* Fixed response format handling for various API endpoints

### Validation Tests Added

* `tests/validation-test.js` - Identity resolution and reset system tests (15/15 passing)
* `tests/multi-project-isolation-test.js` - Multi-project isolation validation (11/11 passing)
* `tests/persistent-agent-registry-test.js` - Agent registry persistence tests
* `tests/multi-agent-coordination-test.js` - Multi-agent workflow simulation
* `tests/conflict-detection-test.js` - Conflict detection and resolution tests
* `tests/vulnerability-test.js` - Security and vulnerability tests

### Validation Results

All validation tests passing:
- ✅ Identity resolution fixed (no more unknown/default)
- ✅ Configuration hierarchy enforced
- ✅ Setup flow implemented
- ✅ Reset system with safety locks
- ✅ Multi-project isolation verified
- ✅ Agent registry persistence working
- ✅ Resource lock conflicts detected
- ✅ Message passing between agents working
- ✅ Activity tracking functional
- ✅ Security hardening applied

---

## [v2.3.0] - Browser Automation Module

### Added

* Added 24 new browser automation MCP tools using Playwright:
  * Session management: `open_browser`, `close_browser`, `get_active_sessions`
  * Navigation: `navigate_to_url`, `reload_page`, `go_back`, `go_forward`
  * DOM interaction: `click_element`, `fill_input`, `get_element_text`, `get_elements`, `wait_for_selector`
  * Page info: `get_page_title`, `get_current_url`, `get_page_content`
  * Browser control: `set_viewport`, `clear_cookies`, `get_cookies`, `set_cookies`
  * Execution: `evaluate_javascript`, `take_screenshot`, `wait_for_timeout`
* Added `tools/browserTools.js` - Production-ready Playwright implementation featuring:
  * Shared browser instance pooling for efficiency
  * Session isolation per agent
  * 5-minute idle auto-cleanup
  * Comprehensive input validation (URLs, selectors, scripts)
  * Security blocking (eval, prototype pollution patterns)
* Added `tools/index.js` - Tool definitions registry with 26 total MCP tools
* Added `tests/browser-test.js` - Comprehensive test suite covering:
  * Basic functional tests (open, navigate, click, fill)
  * Validation tests (URLs, selectors, scripts, cookies)
  * Multi-session tests
  * Failure resilience tests
* Added `mcp.config.json` - MCP server configuration template for local setup

### Changed

* Updated `instruction.md` and `prompt/instruction.md` - Added browser automation documentation section with tool reference and usage patterns
* Updated `mcp-server.js` - Integrated browser tool handlers (24 new tools)
* Updated `docs/index.html` - Simplified to minimal shell structure
* Updated `.gitignore` - Added `CODEBASE.md` and `result.md`
* Updated check script - Added syntax validation for `tools/browserTools.js`, `tools/index.js`, `tools/store_context.js`

### Dependencies

* Added `playwright@1.49.1` - Headless browser automation

---

## [v2.2.1] - Documentation Modularization & Release Readiness

### Changed

* Refactored `docs/app.js` into a more modular, section-driven documentation renderer that is easier to maintain and update.
* Reworked the documentation site copy to present the project with production-ready, professional messaging aligned to the public Coderooz case study.
* Removed incomplete or draft-style references from the published docs experience and simplified the page flow for deployment.
* Simplified the docs runtime by removing the multilingual content layer from `docs/app.js` and focusing the published experience on a polished English release page.

### Updated

* Updated release metadata and public documentation version references to `v2.2.1`.
* Kept the GitHub Pages documentation output aligned with the current package release state.
* Updated the docs site to fetch the displayed release version from the repository `package.json` at runtime, with a safe fallback when the remote version cannot be read.

---

## [v2.2.0] - Collaborative Multi-Agent System 

Human + Agent Collaboration

### Added

* Added a live activity stream with persisted `activity` entries and project-scoped retrieval.
* Added soft resource locks with expiration, release flow, and active-lock listing.
* Added MCP collaboration tools for:
  * `record_activity`
  * `fetch_activity`
  * `acquire_resource_lock`
  * `release_resource_lock`
  * `fetch_resource_locks`
* Added collaboration-aware update warnings based on:
  * active locks
  * task ownership boundaries
  * expected version mismatches
  * expected timestamp mismatches
* Added activity logging hooks across:
  * context updates
  * project descriptor updates
  * actions
  * task changes
  * issue changes
  * messages
  * agent registration and heartbeat
* Added new persistence utilities:
  * `utils/activityTracker.js`
  * `utils/collaborationEngine.js`

### Improved

* Extended the project descriptor system so it remains the baseline project context for collaboration-aware agents.
* Improved context graph retrieval to include related agents alongside memory, tasks, issues, actions, and versions.
* Improved task, issue, and project-map models with conflict reference support for concurrent collaboration traces.
* Updated agent instructions to reflect:
  * project descriptor usage
  * live activity tracking
  * user parallel presence
  * soft locks
  * conflict-aware execution
* Updated the documentation site and README to present the system as a human-plus-agent collaboration platform instead of a memory-only server.

### Fixed

* Fixed missing documentation alignment between the implemented coordination system and the published entry points.
* Fixed release metadata drift by aligning the package and MCP transport version to `v2.2.0`.
* Fixed syntax validation coverage to include the new collaboration and activity utilities.

---

## [v2.1.0] — Documentation Site, Project Identity & Coordination Upgrades

### Added

* Added MCP project intelligence tools:

  * `create_project_map`
  * `fetch_project_map`
  
* Added missing task coordination tools:

  * `assign_task`
  * `update_task`

* Added richer project map persistence fields:

  * `key_details`
  * `related_tasks`
  * `last_verified_at`
* Added a GitHub Pages-ready documentation site in `docs/` with:

  * installation and setup guidance
  * integration walkthroughs
  * MCP tool and API reference
  * project identity guidance
  * copyable examples
  * multilingual language switching
* Added documentation site assets and metadata:

  * `favicon.ico`
  * `favicon.svg`
  * web manifest
  * robots.txt
  * sitemap.xml
* Added project identity migration tooling:

  * `.mcp-project`
  * `migrate-project-id.js`

### Changed

* Scoped `fetch_tasks` to the active project and added filtering by assignment, creator, status, and limit
* Scoped messaging retrieval to the active project to avoid cross-project coordination bleed
* Upgraded project-map storage to upsert by `project + file_path`, making the structure knowledge reusable instead of duplicative
* Unified project identity derivation across `mcp-shim.js` and direct `mcp-server.js` launches with a shared resolver, `MCP_PROJECT_ROOT`, and project-local override support via `.mcp-project`
* Updated agent instructions and README to reflect the task-claiming and project-map workflow
* Updated the validation script to include syntax checking for `docs/app.js`
* Expanded project bootstrap guidance to include the current tool surface and project-map seeding guidance

---

## [v2.0.0] — Multi-Agent System & MCP Evolution

Major architectural upgrade introducing a distributed multi-agent system with tasks, messaging, agent coordination, and project intelligence.

This release transforms the MCP Memory Server from a memory-centric tool into a coordinated system platform.


### 🔄 Changed

#### Agent Instruction System Overhaul

* Completely redesigned global agent instruction (`agent-instruction.js`) to support **multi-agent distributed architecture**
* Introduced strict **execution contract** with:

  * system-aware decision making
  * mandatory workflow (memory → tasks → messages → execution)
* Added explicit definitions for:

  * TASK system
  * MESSAGE system
  * AGENT coordination
  * PROJECT MAP usage
* Replaced legacy “single-agent MCP usage model” with **coordinated multi-agent system model**

#### Instruction Documentation Rewrite

* Fully rewritten `instruction.md` to align with:

  * new multi-agent architecture
  * system-first execution model
* Removed legacy MCP usage explanations and replaced with:

  * structured system workflow
  * coordination rules
  * failure handling model
* Simplified and standardized guidance across all instruction sources

#### MCP Server Configuration

* Improved project detection:

  * fallback to `process.cwd()` directory name when `MCP_PROJECT` is not set
* Enhanced robustness of runtime configuration defaults

#### MCP Shim Process Handling

* Updated stdio handling:

  * switched from `inherit` to fully piped streams
* Added:

  * stdin/stdout/stderr piping
  * signal forwarding (`SIGINT`, `SIGTERM`)
  * error-safe stream handling
* Improved process lifecycle management and stability

#### Search & Ranking Algorithm

* Simplified keyword matching logic
* Optimized scoring calculation:

  * reduced overhead in query parsing
  * improved performance for large datasets
* Minor refactor for readability and consistency

#### Server Architecture Refactor

* Introduced `routeHandler` abstraction for:

  * consistent error handling
  * reduced boilerplate across routes
* Simplified database access patterns:

  * centralized `getDb()` validation
* Refactored multiple endpoints to use shared handler logic

#### Context Search System

* Simplified query builder usage:

  * removed redundant scope/includeGlobal handling in route
* Improved ranking pipeline integration
* Optimized access tracking updates

#### Logging System Adjustments

* Simplified `/log` endpoint:

  * removed unused `stack` field
* Standardized error handling variable usage (`err` instead of `error`)

#### Server Lifecycle Improvements

* Simplified startup and shutdown logic:

  * reduced redundant checks
  * improved cleanup handling
* Updated startup logging:

  * moved from `stderr.write` to `console.log`
* Improved failure recovery during initialization

---

### 🚀 Added

#### Multi-Agent System (Core Feature)

* Introduced full **agent coordination layer** across system 
* New MCP tools:

  * `list_agents`
  * `register_agent`
  * `create_task`
  * `fetch_tasks`
  * `send_message`
  * `request_messages`

#### New Data Models

* Added:

  * `AgentModel`
  * `TaskModel`
  * `MessageModel`
  * `ProjectMapModel`
* Enabled structured representation of:

  * agents
  * work units (tasks)
  * inter-agent communication
  * codebase structure (project map)

#### New API Endpoints

**Agents**

* `POST /agent/register`
* `GET /agent/list`

**Tasks**

* `POST /task`
* `POST /task/assign`
* `GET /task/list`

**Messages**

* `POST /message`
* `GET /message/:agent_id`

**Project Map**

* `POST /project-map`
* `GET /project-map`

#### Database Enhancements

* Added new collections and indexes:

  * `agents`
  * `tasks`
  * `messages`
  * `project_map`
* Optimized query performance with targeted indexing

#### Project Map System

* Introduced persistent **codebase intelligence layer**
* Enables:

  * structural awareness across agents
  * dependency tracking
  * architecture sharing

---

### 🛠 Fixed

#### MCP Shim Stability

* Fixed improper stdio configuration that could break MCP communication
* Ensured proper stream forwarding between parent and child processes

#### Server Initialization Edge Cases

* Improved error handling during DB connection and startup
* Prevented partial initialization states

#### Minor Consistency Fixes

* Standardized error variable naming
* Removed unused imports (`pathToFileURL`)
* Cleaned up redundant logic across server routes

---

### 🧹 Removed

* Removed legacy instruction model assumptions (single-agent focused MCP usage)
* Removed redundant search parameters (`scope`, `includeGlobal`) from route-level handling
* Removed unused fields in logging (`stack`)

---

### 🧠 Internal Improvements

* Transitioned system architecture from:

  ```
  memory-centric MCP server
  ```

  to:

  ```
  coordinated multi-agent system with memory, tasks, messaging, and project intelligence
  ```
* Enforced **system-first execution model**:

  * tasks and messages now precede action
* Strengthened separation between:

  * coordination layer (agents/tasks/messages)
  * memory layer (contexts/logs)
* Improved scalability for:

  * multi-agent collaboration
  * large project environments

---

## [1.1.0] - Major Refactor & MCP Stabilization

### 🚀 Added

#### MCP System Enhancements

* Added `get_agent_instructions` tool for dynamic agent behavior injection
* Added `get_logs` tool for retrieving system logs via MCP
* Introduced `agent-instruction.js` as centralized instruction source
* Embedded instructions into MCP `initialize` response

#### Project Bootstrap & Memory Seeding

* Added `PROJECT_MEMORY_BOOTSTRAP.md` for initializing durable memory
* Defined structured memory patterns for:

  * architecture
  * constraints
  * search behavior
  * tooling

#### Logging System Improvements

* Introduced `/logs` endpoint for querying logs
* Introduced `/log` endpoint for structured logging
* Enabled logs to be:

  * stored in MongoDB
  * accessible via MCP tools
* Automatic conversion of critical errors into memory entries

#### MCP Shim (Global Integration)

* Added `mcp-shim.js` for:

  * automatic project detection
  * environment injection (`MCP_PROJECT`, `MCP_SCOPE`)
  * zero per-project setup
* Added project root detection using:

  * `.git`, `.roo`, `package.json`, Python env files

#### Server Lifecycle Management

* Added `startMemoryServer.js` for:

  * singleton API startup
  * safe reuse across MCP sessions
* Introduced `startServer()` and `stopServer()` lifecycle methods

#### Search & Ranking Improvements

* Added ranking algorithm based on:

  * keyword match
  * importance
  * recency
  * access frequency
* Added automatic access tracking:

  * `accessCount`
  * `lastAccessedAt`

---

### 🔄 Changed

#### Full Migration to ES Modules

* Converted entire codebase from CommonJS → ESM
* Updated:

  * `require` → `import`
  * `module.exports` → `export`
* Added `"type": "module"` in `package.json`

#### MCP Server Refactor

* Introduced:

  * `callMemoryApi()` abstraction
  * `waitForServer()` health check
  * `parseResponse()` for flexible API parsing
* Improved error handling and resilience
* Replaced direct fetch calls with structured API wrapper

#### Logger Improvements

* Converted `logger.js` to ESM
* Added error visibility via `stderr`
* Prevented silent failures in critical paths
* Improved DB safety checks

#### Memory Model Redesign

* Simplified scoring system:

  * replaced `score` object with:

    * `importance`
    * `accessCount`
    * `lastAccessedAt`
* Improved normalization:

  * consistent timestamps
  * default values enforced

#### Query System Improvements

* Replaced regex-only search with MongoDB `$text` search
* Added conditional query building
* Improved scope filtering logic

#### MCP Tool System

* Refactored tool registration into `getTools()` function
* Improved tool definitions and schema clarity
* Standardized tool responses

#### Environment Handling

* Centralized environment loading using `dotenv`
* Added `quiet: true` to prevent MCP stdout corruption
* Improved fallback logic for:

  * agent
  * project
  * server URL

---

### 🛠 Fixed

#### Critical MCP Handshake Issue

* Fixed stdout contamination caused by dotenv logs
* Ensured MCP protocol integrity (JSON-only stdout)

#### Server Initialization Reliability

* Added retry mechanism for API availability
* Prevented race conditions during startup

#### Logger Silent Failures

* Replaced empty `catch {}` blocks with stderr logging
* Ensured visibility of internal logging errors

#### MCP Shim Stability

* Fixed stdio configuration to avoid protocol interference
* Ensured proper child process lifecycle handling

---

### 🧹 Removed

* Removed `.roo/mcp.json` (per-project config)

  * Replaced with global `mcp-shim.js` approach
  * Eliminates need for manual configuration per project

---

### 📦 Package Updates

* Updated `package.json`:

  * Added scripts:

    * `start`
    * `start:api`
    * `check`
    * `test`
  * Updated repository URL
  * Set `"main": "mcp-server.js"`

---

### 🧠 Internal Improvements

* Enforced strict MCP protocol rules:

  * stdout = JSON-RPC only
  * logs moved to stderr / DB
* Improved separation of concerns:

  * MCP transport vs HTTP persistence
* Enhanced multi-agent compatibility
* Strengthened project-aware memory isolation

---

## [1.0.0] - Initial Release

### ✨ Features

* Basic MCP memory server implementation
* MongoDB-backed persistence
* Core tools:

  * `store_context`
  * `search_context`
  * `log_action`
  * `get_full_context`
  * `start_session`
* Basic logging system
* Cross-agent memory support

---

## 🧠 Notes

This release marks the transition from:

```
basic MCP memory server
```

to:

```
production-ready, multi-agent memory infrastructure
```

Key milestones achieved:

* Stable MCP protocol handling
* Persistent and queryable memory
* Observable system via logs
* Global agent instruction system
* Project-aware multi-agent architecture

---

## 🚀 Future Roadmap

* Vector-based semantic search
* Memory importance auto-scoring
* Conflict detection and resolution
* Self-healing server mechanisms
* Agent feedback learning loops

---
