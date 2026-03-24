# Changelog

All notable changes to this project will be documented in this file.

This project follows a structured change history to track architectural evolution, MCP protocol updates, and system-level improvements.

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
