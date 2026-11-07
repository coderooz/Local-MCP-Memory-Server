# Sprint A — npm Package Hygiene

**Campaign:** Campaign 10.2 — Sprint A: Repository Hygiene, Package Consistency & Version SSOT  
**Document ID:** `05_NPM_PACKAGE_HYGIENE.md`  
**Date:** 2026-11-07  
**Author:** Google Antigravity (Advanced Agentic Coding)  
**Status:** COMPLETE & VERIFIED  

---

## 1. Objective

Establish a multi-layer packaging strategy ensuring that npm package distributions contain all required runtime entry points and assets while strictly preventing sensitive configuration, local databases, development tools, and internal reports from entering public tarballs.

---

## 2. Packaging Architecture: Dual Allowlist / Denylist Model

npm packaging in `local-mcp-memory` employs a two-tier defense-in-depth model:

1. **Layer 1: Explicit Allowlist (`package.json` `"files"` array)**:
   - Only explicitly declared functional directories and files are included in the tarball.
   - Declared entries:
     - `bin/` (CLI entry point)
     - `src/` (Domain services, database, auth, mcp-registry, cli, setup)
     - `core/` (Legacy models, runtime-state, connection resolver)
     - `utils/` (Coordination, collaboration, memory engine, rate limiter)
     - `tools/` (MCP tool handlers and registries)
     - `plugins/` (Emulator and agent plugins)
     - `dashboard/` (Web UI assets)
     - `shared/` (Logger, response formatters)
     - Root entry points (`mcp-server.js`, `server.js`, `startMemoryServer.js`, `mcp-shim.js`, `agent-instruction.js`, `mcp-integration-tools.js`)
     - Distribution assets (`assets/alert.mp3`, `.env.example`, `mcp.config.json`)
     - Standard metadata (`README.md`, `LICENSE`, `CHANGELOG.md`)

2. **Layer 2: Fail-Safe Denylist (`.npmignore`)**:
   - Because npm recursively packages subdirectories listed in `"files"`, any accidental file created inside `src/` or `tools/` (such as `src/temp.db` or `tools/.env`) would otherwise be bundled.
   - `.npmignore` acts as an absolute boundary that guarantees sensitive filetypes are excluded even within allowed directories.

---

## 3. Implemented `.npmignore` Specification

A dedicated `.npmignore` was created at the package root:

```ini
# Fail-safe defense-in-depth exclusions for npm packaging
# Prevents sensitive or ephemeral files within allowed directories from being packaged

# Environment files and credentials
.env
.env.*
!.env.example
*.pem
*.key
*.cert
*.crt

# Databases, WAL/SHM files, locks
*.db
*.db-journal
*.db-wal
*.db-shm
*.sqlite
*.sqlite3
*.sqlite-wal
*.sqlite-shm
*.dump
*.bson
data/

# Ephemeral scratch and test files
scratch/
temp/
tmp/
*.tmp
*.log
logs/
.backups/
backups/

# Git and IDE metadata
.git/
.github/
.vscode/
.idea/
.DS_Store
Thumbs.db
```

---

## 4. Preservation of Consumer Runtime Requirements

Verification confirmed that no necessary runtime resource is excluded:
- CLI binary `bin/cli.js` is included with appropriate executable permissions.
- Audio alert asset `assets/alert.mp3` (60.7 kB) is preserved for notification tools.
- Sample environment template `.env.example` is retained for user setup.
- Web UI assets in `dashboard/index.html` (22.6 kB) and `dashboard/routes.js` are preserved.
- Full SQLite migration and schema scripts under `src/core/database/sqlite/` are included.
- Tests directory (`tests/`), engineering workspace (`.workspace/`), agent instructions (`.agent/`), and scripts (`scripts/`) are excluded from npm distribution.
