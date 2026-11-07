# Report 02: Published npm Package Verification

**Campaign:** 13 — Controlled Global Installation, MCP Cutover & Safe v2.5.0 Retirement  
**Target Package:** `local-mcp-memory@2.6.1`  
**Date:** 2026-11-07  
**Author:** AI Quality & Release Verification Auditor  

---

## 1. Executive Summary

This report documents the independent verification of the public npm package `local-mcp-memory@2.6.1` published to the official npm registry. Verification was performed in an isolated clean-room sandbox before installing the package globally.

---

## 2. Registry Metadata Verification

```bash
npm view local-mcp-memory
```

- **Package Name**: `local-mcp-memory`
- **Published Version**: `2.6.1`
- **Dist-Tags**: `latest: 2.6.1`
- **Publisher**: `coderooz <viewersweb02@gmail.com>`
- **Tarball URL**: `https://registry.npmjs.org/local-mcp-memory/-/local-mcp-memory-2.6.1.tgz`
- **SHA512 Integrity**: `sha512-tpkDbh2D1OLRvr4t/QIl6pHXyX6/ygeb+gkuxvoFmOq0ZNXL4qTDJWu8xa4zDB0orT4OEXe5hB064gQ92rm6LQ==`
- **SHA1 Shasum**: `2c1e6573cdf48b2b240f16dcf963a9284aabcd05`
- **Declared Binaries**: `local-mcp-memory`, `mcp-memory`, `local-memory-mcp`
- **Dependencies**: 8 runtime dependencies (`better-sqlite3`, `commander`, `dotenv`, `express`, `jsonwebtoken`, `mongodb`, `playwright`, `uuid`)

---

## 3. Clean-Room Sandbox Execution & Results

An isolated sandbox directory `C:\Users\ranit\AppData\Local\Temp\mcp-pub-verify-h7HAFO` was created and tested:

| Verification Step | Target / Command | Result | Status |
| :--- | :--- | :--- | :---: |
| **Clean Install** | `npm install local-mcp-memory@2.6.1` | 99 packages added, 0 vulnerabilities | **PASS** |
| **Package Metadata** | `node_modules/local-mcp-memory/package.json` | Exact match `local-mcp-memory@2.6.1` | **PASS** |
| **CLI Aliases** | `bin/cli.js` mappings | All 3 aliases resolve to executable file | **PASS** |
| **CLI Help** | `node bin/cli.js --help` | Valid CLI usage output | **PASS** |
| **CLI Version** | `node bin/cli.js --version` | Outputs `2.6.1` | **PASS** |
| **MCP Initialize** | JSON-RPC `initialize` request | `mcp-memory-server@2.6.1` response | **PASS** |
| **Tool Discovery** | JSON-RPC `tools/list` request | Exactly 63 registered MCP tools discovered | **PASS** |
| **Store Context** | `tools/call` (`store_context`) | Context stored with UUID | **PASS** |
| **Search Context** | `tools/call` (`search_context`) | FTS5 search returned stored record | **PASS** |
| **Process Restart**| New process against test DB | Record persisted across process restart | **PASS** |

**Gate B Verdict**: **PASSED 100%**. The published package is fully self-contained, valid, and operational without any dependency on the local source repository.
