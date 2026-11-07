# Sprint B — CLI Reference and Configuration Remediation Report

**Campaign:** Campaign 10.3 — Sprint B: Documentation Synchronization & Gap Remediation  
**Document ID:** `05_CLI_REFERENCE_AND_CONFIGURATION.md`  
**Date:** 2026-11-07  
**Author:** Google Antigravity (Advanced Agentic Coding)  
**Status:** COMPLETE & INDEPENDENTLY VERIFIED  

---

## 1. Executive Summary

This report documents the creation of two core user reference manuals: `docs/cli-reference.md` and `docs/configuration.md`. Every CLI command and configuration variable was reconciled directly against `bin/cli.js`, `src/core/paths/index.js`, and `.env.example`.

---

## 2. CLI Re-Enumeration & Verification

Direct inspection of `bin/cli.js` confirmed exactly **17 top-level CLI commands**:

```
+----+----------------------+--------------------------+---------------------------------------+
| #  | Command Signature    | Subsystem Category       | Verification Status                   |
+----+----------------------+--------------------------+---------------------------------------+
| 1  | `init`               | Setup & Auto-Config      | Verified (4 options: client, all, etc)|
| 2  | `start`              | Server Lifecycle         | Verified (daemon, port, dashboard)    |
| 3  | `stop`               | Server Lifecycle         | Verified (port, all)                  |
| 4  | `status`             | Diagnostics & Health     | Verified (port, json)                 |
| 5  | `doctor`             | Diagnostic Engine        | Verified (json, verbose)              |
| 6  | `config`             | Configuration (3 subcmds)| Verified (path, get, set)             |
| 7  | `update`             | Update & Schema Check    | Verified (check, dry-run)             |
| 8  | `uninstall`          | Teardown & Purge         | Verified (client, all, purge, dry-run)|
| 9  | `migrate`            | MongoDB to SQLite Migr.  | Verified (7 options: apply, resume, etc|
| 10 | `search <query>`     | Memory Data Operation    | Verified (FTS5 query, limit, project) |
| 11 | `store <content>`    | Memory Data Operation    | Verified (type, tags, importance)     |
| 12 | `create-task <title>`| Task Management          | Verified (description, priority, etc) |
| 13 | `list-tasks`         | Task Management          | Verified (status filtering, json)     |
| 14 | `create-issue <title>`| Issue Tracking          | Verified (description, severity)      |
| 15 | `list-issues`        | Issue Tracking           | Verified (status filtering, json)     |
| 16 | `list-agents`        | Agent Coordination       | Verified (heartbeat output, json)     |
| 17 | `health`             | Network & Protocol Probe | Verified (detailed, json)             |
+----+----------------------+--------------------------+---------------------------------------+
```

---

## 3. Configuration & Variable Reconciliation

19 environment variables were audited and documented in `docs/configuration.md`.
- **Secret Identification:** `MCP_MASTER_SECRET`, `JWT_SECRET`, and `MONGO_URI` were explicitly flagged as sensitive.
- **Path Resolution:** Multi-platform directories for Windows (`%LOCALAPPDATA%`) and Linux/macOS (`~/.local-mcp-memory`) were verified against `src/core/paths/index.js`.
- **Precedence Rules:** Fully documented to prevent confusion between CLI flags, environment variables, and config files.
