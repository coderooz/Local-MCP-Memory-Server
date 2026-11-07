# Report 13: Cross-Document and Configuration Consistency Audit

**Project:** `local-mcp-memory`  
**Target Release:** `v2.6.1`  
**Date:** 2026-11-07  
**Auditor:** Google Antigravity  

---

## 1. Discrepancy Matrix: Implementation vs. Documentation

Our cross-reference audit evaluated agreements and conflicts across source code, configuration files, and documentation:

| Dimension | Implementation Reality (Code) | Documentation Claim | Source of Conflict | Authoritative Source of Truth (SSOT) |
| :--- | :--- | :--- | :--- | :--- |
| **Default Port** | `server.js:3140` uses dynamic port or `PORT || 3799` | `README.md:133` lists `PORT=4000` | Stale example in README | `server.js` (`3799` default) |
| **Supported Versions** | v2.6.x active, v2.5.x stable | `SECURITY.md:7` lists `2.4.x` as supported | Outdated table in SECURITY.md | `package.json` (`2.6.x` supported) |
| **API Authentication** | Full JWT & API-key auth in `src/core/auth/` | `SECURITY.md:30` claims "no built-in authentication" | Stale security model description | `src/core/auth/index.js` (Auth active) |
| **Credential Encryption**| AES-256-GCM in `src/core/mcp-registry/crypto.js` | `SECURITY.md:19` claims "no encryption at rest" | Stale security model description | `src/core/mcp-registry/crypto.js` |
| **Supported Agents** | 8 agents in `agent-configs.js` (including Antigravity & Roo) | `README.md:83` lists only 6 agents | Omission in README Quickstart | `src/core/setup/agent-configs.js` (8 agents) |
| **Version Literals** | `package.json` = `2.6.0` | `mcp-server.js:1826` & `server.js:2049` hardcode `'2.6.0'` | Uncentralized version strings | `package.json` |
| **Workflow Build Step**| ESM module (`"type": "module"`) | `.github/workflows/ci.yml:128` calls `require('./package.json')` | CommonJS call in ESM repo | `package.json` ESM standards |
| **CLI Command Count** | 17 commands registered in `bin/cli.js` | `README.md:97` lists 17 commands | Correct count, but omits `config` subcommands | `bin/cli.js` |

---

## 2. Terminology Standardization Plan for v2.6.1

To ensure naming consistency across all human and agent materials:
- **Canonical Package Name:** `local-mcp-memory` (never `local-memory-mcp` or `local-mcp-server` except as backward-compatible CLI aliases).
- **Canonical Protocol:** Model Context Protocol (MCP) JSON-RPC 2.0 (specification version `2024-11-05`).
- **Canonical Database Engine:** Embedded SQLite 3 (`better-sqlite3`, WAL mode).
- **Canonical Agent Workspace:** `.agent/` (Universal instructions, policies, context, maps).
- **Canonical Engineering Workspace:** `.workspace/` (Reports, resources, ADRs, specifications, plans, PRI, LFI).
