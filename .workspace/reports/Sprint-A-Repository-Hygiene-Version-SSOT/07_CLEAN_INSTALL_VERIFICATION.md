# Sprint A — Clean-Room Installation and Smoke Testing

**Campaign:** Campaign 10.2 — Sprint A: Repository Hygiene, Package Consistency & Version SSOT  
**Document ID:** `07_CLEAN_INSTALL_VERIFICATION.md`  
**Date:** 2026-11-07  
**Author:** Google Antigravity (Advanced Agentic Coding)  
**Status:** COMPLETE & VERIFIED  

---

## 1. Objective

Verify that the generated npm package tarball installs cleanly into an empty, isolated consumer environment and that all CLI, MCP protocol, and storage capabilities operate without errors.

---

## 2. Test Environment Setup

- **Isolated Sandbox Path:** `C:\Users\ranit\AppData\Local\Temp\mcp-pack-test-6afdnr`
- **Methodology:**
  1. Create temporary directory outside workspace.
  2. Pack `local-mcp-memory-2.6.0.tgz` into temporary directory.
  3. Initialize blank consumer project (`npm init -y`).
  4. Install package via tarball: `npm install --no-package-lock local-mcp-memory-2.6.0.tgz`.
  5. Override environment variables (`LOCALAPPDATA`, `APPDATA`, `USERPROFILE`, `HOME`) to point exclusively to the sandbox directory, isolating it from global Antigravity configuration and MongoDB.

---

## 3. Smoke Test Verification Results

### 3.1 Package Installation
- **Command:** `npm install --no-package-lock <tarball>`
- **Result:** Exit code 0. Dependencies resolved and installed cleanly into sandbox `node_modules`.

### 3.2 CLI Executable Availability & Version
- **Command:** `node node_modules/local-mcp-memory/bin/cli.js --version`
- **Result:** Output `2.6.0` (Matches package version SSOT).

### 3.3 CLI Help Screen
- **Command:** `node node_modules/local-mcp-memory/bin/cli.js --help`
- **Result:** Full command hierarchy rendered (1,915 characters). Confirmed all 17 commands visible.

### 3.4 CLI Diagnostics (`doctor`)
- **Command:** `node node_modules/local-mcp-memory/bin/cli.js doctor`
- **Result:** Diagnostic engine executed successfully. Reported Node.js version, platform, and package status without requiring live database connections.

### 3.5 MCP JSON-RPC Stdio Handshake
- **Command:** Spawn `node node_modules/local-mcp-memory/mcp-server.js` with stdio pipes.
- **Request:**
  ```json
  {"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"disposable-pack-verifier","version":"1.0.0"}}}
  ```
- **Response Received:**
  ```json
  {"name":"mcp-memory-server","version":"2.6.0","description":"Persistent multi-agent memory system for AI agents","author":"Ranit Saha (Coderooz)"}
  ```
- **Verification:** Version returned is dynamically resolved `2.6.0`.

### 3.6 Tool Discovery
- **Request:** `tools/list`
- **Result:** Exactly **63 MCP tools** discovered and cataloged.

### 3.7 Storage & Retrieval Round-Trip
- **Action 1 (Store Context):**
  - Invoked `store_context` tool with payload: `Disposable package verification test context record`.
  - Result: Generated UUID `6c8e593c-90cd-45d6-91c2-dd36f07cbec4`. Stored in isolated sandbox SQLite database.
- **Action 2 (Search Context):**
  - Invoked `search_context` tool with query: `Disposable package verification`.
  - Result: Successfully retrieved stored record with relevance ranking via SQLite FTS5.

---

## 4. Isolation Certification

- **MongoDB Production Instance:** Untouched (0 network connections made).
- **Protected Stable Instance (`website/local-mcp-memory`):** Untouched (0 file accesses).
- **Global Antigravity Configuration (`~/.gemini/antigravity/`):** Untouched.
- **Development Working Directory Database:** Untouched (temporary sandbox used its own SQLite instance).
