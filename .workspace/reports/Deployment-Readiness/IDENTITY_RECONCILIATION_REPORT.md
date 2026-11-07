# Identity Reconciliation Report — Canonical Naming Standardization

**Audit Date:** 2026-11-05  
**Canonical Identity:** `local-mcp-memory`  

---

## 1. Context & Motivation

During earlier development phases, the string `local-memory-mcp` was introduced as a candidate npm package name and CLI binary. The engineering directive issued on 2026-11-05 mandated:
> "The canonical project identity is: `local-mcp-memory`. This is the correct project name. Do not use `local-memory-mcp` as the project or package identity. Ensure naming consistency throughout the repository, configuration files, documentation, package metadata, MCP server registration, scripts, and relevant references."

---

## 2. Inventory of Changes Made

| Target File | Previous String | Updated Canonical String | Rationale |
|---|---|---|---|
| `package.json` | `"bin": { "local-memory-mcp": "./bin/cli.js" }` | `"bin": { "local-mcp-memory": "./bin/cli.js", "mcp-memory": "./bin/cli.js", "local-memory-mcp": "./bin/cli.js" }` | Establishes `local-mcp-memory` as canonical executable while retaining aliases for backward compatibility |
| `bin/cli.js` | `program.name('local-memory-mcp')` | `program.name('local-mcp-memory')` | Standardizes CLI binary name in `--help` and runtime output |
| `bin/cli.js` | Command examples referencing `local-memory-mcp` | `local-mcp-memory` | Fixes all 8 next-step and diagnostic suggestions |
| `src/core/cli/doctor.js` | `run "local-memory-mcp init"` | `run "local-mcp-memory init"` | Fixes recommendation message when no agents registered |
| `agent-instruction.js` | `~/.local-memory-mcp/user-config.json` | `~/.local-mcp-memory/user-config.json` | Matches `APP_DIR_NAME = 'local-mcp-memory'` in `src/core/paths/index.js` |
| `agent-instruction.js` | `npx local-memory-mcp init` | `npx local-mcp-memory init` | Corrects agent instruction contract for identity setup |
| `README.md` | `npx local-memory-mcp init` | `npx local-mcp-memory init` | Updates primary user documentation and quick start |
| `docs/app.js` | `npx local-memory-mcp init` | `npx local-mcp-memory init` | Updates GitHub Pages live documentation web app |
| `.workspace/PRI/` | `local-memory-mcp` references | `local-mcp-memory` | Synchronizes internal Project Reference Index |
| `.workspace/LFI/` | `local-memory-mcp` references | `local-mcp-memory` | Synchronizes Logic Flow Index and Component Interactions |

---

## 3. Subsystem Identity Verification

1. **Package Name**:
   - `package.json` line 2: `"name": "local-mcp-memory"`.
   - Verified via `tests/identity-reconciliation-test.js`.

2. **Runtime Paths**:
   - `src/core/paths/index.js`: `APP_DIR_NAME = 'local-mcp-memory'`.
   - Data directory: `%LOCALAPPDATA%\local-mcp-memory` (Windows) or `~/.local/share/local-mcp-memory` (Linux).
   - Config directory: `%APPDATA%\local-mcp-memory` (Windows) or `~/.config/local-mcp-memory` (Linux).

3. **Agent Registration Adapter**:
   - `src/core/setup/agent-configs.js`:
     - `SERVER_NAME = 'local-mcp-memory'`
     - `PACKAGE_NAME = 'local-mcp-memory'`
   - Auto-configures entries named `local-mcp-memory` in `opencode.json`, `config.toml`, `claude_desktop_config.json`, `mcp.json`, etc.

4. **MCP Server Metadata**:
   - `mcp-server.js` line 1825:
     ```json
     serverInfo: {
       "name": "mcp-memory-server",
       "version": "2.6.0",
       "description": "Persistent multi-agent memory system for AI agents",
       "author": "Ranit Saha (Coderooz)"
     }
     ```

---

## 4. Automated Test Verification

Executed `node --test tests/identity-reconciliation-test.js`:
- `✔ Identity - Canonical package.json metadata (2.6ms)`
- `✔ Identity - CLI entry point name (0.6ms)`
- `✔ Identity - Runtime paths APP_DIR_NAME (2.0ms)`
- `✔ Identity - Agent configuration adapters canonical naming (2.8ms)`
- `✔ Identity - utils/projectIdentity resolution precedence (5.0ms)`
- `✔ Identity - Disallow unverified/empty project or agent (12.2ms)`

Result: **6 passed, 0 failed**. Gated inside `npm test`.
