# Report 02: Repository Baseline and Environment Audit

**Project:** `local-mcp-memory`  
**Current Development Version:** `2.6.0`  
**Proposed Hardening Target:** `2.6.1`  
**Date:** 2026-11-07  
**Auditor:** Google Antigravity  

---

## 1. Physical Environment & Repository Boundaries

| Environment | Authoritative Path | Role | Git Tracking Status | Protection Policy |
| :--- | :--- | :--- | :--- | :--- |
| **Development Instance** | `C:\Code_Works\HTML_CSS_JS\workProjects\projects\local-mcp-memory` | Target for v2.6.1 hardening | Tracked on `main` | Active development |
| **Stable Usage Instance** | `C:\Code_Works\HTML_CSS_JS\workProjects\website\local-mcp-memory` | Live stable v2.5.0 MCP server | Local deployment directory | **Strictly Untouched** |
| **Production MongoDB** | `mongodb://127.0.0.1:27017/mcp_memory` | Live v2.5.0 memory store | Daemon database (29,834 records) | **Strictly Read-Only** |
| **Global Client Config**| `%USERPROFILE%\.gemini\antigravity\mcp_config.json` | Active global Antigravity MCP config | User configuration | **Strictly Untouched** |

---

## 2. Git State & Commit Baseline

- **Current Branch:** `main`
- **Upstream Status:** Up to date with `origin/main`
- **HEAD Commit:** `5962431` (*Add isolation contract and gap detector tests, and implement execution tool handlers*)
- **Previous Release Commit:** `91990f5` (*release(v2.5.0): cleanup artifacts and update changelog*)
- **Existing Git Tags:**
  - `v1.1.0`
  - `v2.0.0`
  - `v2.1.0`
  - `v2.2.1`
  - `v2.4.0`
  *(Note: Neither `v2.5.0` nor `v2.6.0` was tagged on remote Git; v2.5.0 exists as commit `91990f5`)*.
- **Working Tree Check:** `git diff --check` passes with zero errors/warnings.

---

## 3. Package Manifest & Runtime Metadata

- **Package Name:** `local-mcp-memory`
- **Current Version:** `2.6.0`
- **Module System:** Strict ESM (`"type": "module"`)
- **Node.js Engines:** `>=20.0.0`
- **CLI Binary Mappings:**
  - `local-mcp-memory`: `./bin/cli.js`
  - `mcp-memory`: `./bin/cli.js`
  - `local-memory-mcp`: `./bin/cli.js`
- **Core Production Dependencies:**
  - `better-sqlite3`: `^13.0.3` (Synchronous SQLite engine)
  - `express`: `^5.0.1` (HTTP/SSE transport)
  - `cors`: `^2.8.5`
  - `dotenv`: `^16.4.7`
  - `commander`: `^12.1.0`

---

## 4. Repository Structure Inventory

```text
local-mcp-memory/
├── .agent/                   # Canonical AI Agent Workspace (38 files)
├── .github/                  # GitHub Workflows & Issue Templates (15 files)
├── .workspace/               # Canonical Engineering Workspace
│   ├── decisions/            # Architecture Decision Records (ADRs)
│   ├── specifications/       # Technical Specifications
│   ├── plans/                # Execution & Migration Plans
│   ├── reports/              # Consolidated Historical & Current Reports
│   ├── resources/            # 33 Deep Domain Architectural Guides
│   ├── templates/            # Engineering Document Templates
│   ├── archive/              # Deprecated Artifacts
│   ├── PRI/                  # Project Reference Index
│   └── LFI/                  # Logic Flow Index
├── bin/                      # CLI Entry Point (cli.js — 17 commands)
├── core/                     # Legacy Config, Integrations & Models
├── dashboard/                # Express Dashboard Web UI & Routes
├── docs/                     # GitHub Pages Documentation Site
├── plugins/                  # Emulator Plugins
├── src/                      # Modular Source Architecture (auth, db, mcp, migration, domains)
├── tests/                    # Automated Test Suites (23 test files)
├── tools/                    # MCP Tool Implementations (63 tools across 7 files)
├── utils/                    # Coordination, Isolation & Port Management Utilities
├── mcp-server.js             # Stdio MCP Server Entry
└── server.js                 # Express HTTP/SSE API Server Entry
```
