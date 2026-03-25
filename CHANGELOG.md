# Changelog

All notable changes to this project will be documented in this file.

This project follows a structured change history to track architectural evolution, MCP protocol updates, and system-level improvements.

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
