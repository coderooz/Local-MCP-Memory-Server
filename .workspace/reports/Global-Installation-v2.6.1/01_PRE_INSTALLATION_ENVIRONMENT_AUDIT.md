# Report 01: Pre-Installation Environment Audit

**Campaign:** 13 — Controlled Global Installation, MCP Cutover & Safe v2.5.0 Retirement  
**Target Package:** `local-mcp-memory@2.6.1`  
**Date:** 2026-11-07  
**Author:** AI Lead Systems & Release Auditor  

---

## 1. Executive Summary

This report documents the baseline pre-installation audit of the Windows host environment, Node.js runtime, npm configuration, global packages, MCP client configurations, and database services before initiating the global migration.

---

## 2. Host and Runtime Environment Baseline

| Audit Parameter | Observed Value | Verification Status |
| :--- | :--- | :--- |
| **Operating System** | Windows 11 (`Microsoft Windows NT 10.0.26200.0`) | Supported |
| **Node.js Runtime** | `v24.21.0` | Active LTS / Modern Engine (>=22.0.0 satisfied) |
| **npm CLI Version** | `12.1.0` | Modern npm client |
| **npm Registry** | `https://registry.npmjs.org/` | Official public registry active |
| **Global npm Root** | `C:\Users\ranit\AppData\Roaming\npm\node_modules` | Standard Windows Roaming path |
| **Global npm Bin Dir**| `C:\Users\ranit\AppData\Roaming\npm` | Registered in system PATH |

---

## 3. Pre-Existing Package and Binary Status

Prior to installation:
- `where.exe local-mcp-memory` -> `Could not find files for the given pattern(s)`
- `where.exe mcp-memory` -> `Could not find files for the given pattern(s)`
- `where.exe local-memory-mcp` -> `Could not find files for the given pattern(s)`
- `npm list -g --depth=0` -> Confirmed `local-mcp-memory` was not globally installed.

---

## 4. Pre-Existing Client Configuration Inventory

Two configuration files were identified on the host:
1. `C:\Users\ranit\.gemini\antigravity\mcp_config.json`:
   - Configured `local-mcp-memory` with `node C:/Code_Works/HTML_CSS_JS/workProjects/website/local-mcp-memory/mcp-shim.js`
   - Pointed to `MONGO_URI: mongodb://127.0.0.1:27017/mcp_memory`
2. `C:\Users\ranit\.gemini\config\mcp_config.json`:
   - Configured `firebase-mcp-server` (active third-party server)
   - Configured `local-mcp-memory` referencing the old `website/local-mcp-memory/mcp-shim.js`

---

## 5. Pre-Existing Database Services

### 5.1 MongoDB Service & Database
- **Service Name**: `MongoDB` (`MongoDB Server (MongoDB)`)
- **Status**: `Running` on `127.0.0.1:27017`
- **Database**: `mcp_memory`
- **Collection Count**: 16 collections
- **Document Count**: 29,853 documents verified

### 5.2 SQLite Storage
- **Path**: `C:\Users\ranit\AppData\Local\local-mcp-memory\mcp-memory.db`
- **Integrity**: `ok` (WAL mode enabled, 31 tables present)
