# Repository Inventory — Instance A vs Instance B

**Audit Date:** 2026-11-05  
**Canonical Project:** local-mcp-memory  

---

## 1. Instance Overview

| Attribute | Instance A (Stable Usage) | Instance B (Authoritative Dev) |
|---|---|---|
| **Location** | `C:\Code_Works\HTML_CSS_JS\workProjects\website\local-mcp-memory` | `C:\Code_Works\HTML_CSS_JS\workProjects\projects\local-mcp-memory` |
| **Version** | v2.5.0 | v2.6.0 |
| **Role** | Active Global MCP Runtime for Antigravity & User Work | Authoritative Development & Deployment Target |
| **Persistence** | MongoDB native driver (`mongodb://127.0.0.1:27017/mcp_memory`) | Embedded SQLite (`better-sqlite3`, WAL mode, FTS5) |
| **CLI Binaries** | None (Node scripts only: `mcp-server.js`, `server.js`) | Global CLI `bin/cli.js` (`local-mcp-memory`, `mcp-memory`) |
| **Distribution** | Local manual directory setup | npm package (`local-mcp-memory`), 17 CLI commands |
| **Tools Surface** | 54 MCP tools | 57 MCP tools (Base + Registry + Execution + Dynamic) |
| **Test Suites** | 4 suites (feedback, chat, resilience, chaos) | 9 suites (120 test assertions in `npm test` + 19 in resilience) |

---

## 2. Source Tree Inventory (v2.6.0)

```
C:\Code_Works\HTML_CSS_JS\workProjects\projects\local-mcp-memory\
├── package.json                   # Package definition: name=local-mcp-memory, 3 bin aliases
├── package-lock.json              # Lockfile
├── mcp-server.js                  # Stdio MCP server entry point (JSON-RPC)
├── mcp-shim.js                    # Dynamic project-identity forwarding shim
├── server.js                      # Express HTTP API & Dashboard server
├── startMemoryServer.js           # Subprocess & in-process server launcher
├── agent-instruction.js           # Master agent instruction contract (GLOBAL_AGENT_INSTRUCTION)
├── mcp-integration-tools.js       # Integration tool definitions
├── mcp.config.json                # Project runtime config flags
├── .env.example                   # Template environment variables
├── README.md                      # Main project documentation
├── CHANGELOG.md                   # Versioned change log
├── LICENSE                        # MIT License
├── AGENTS.md                      # Agent rules and operational pipeline
│
├── bin/                           # Executables
│   └── cli.js                     # Commander CLI (17 commands)
│
├── dashboard/                     # Web Dashboard
│   ├── index.html                 # Single Page Application
│   └── routes.js                  # Express dashboard routes
│
├── src/                           # Modular Core Architecture
│   ├── core/
│   │   ├── auth/                  # PBKDF2 authentication & JWT token service
│   │   ├── cli/                   # Doctor diagnostic runner, install-state, API client
│   │   ├── config/                # Load-env, user-config persistence
│   │   ├── database/sqlite/       # Schema (31 tables), collection adapter, FTS5
│   │   ├── execution/             # Sandbox state machine, policy, audit, approval
│   │   ├── mcp/                   # Tool registry, executor
│   │   ├── mcp-registry/          # External MCP server registry, proxy, AES-256-GCM crypto
│   │   ├── migration/             # MongoDB-to-SQLite migration pipeline
│   │   ├── paths/                 # Cross-platform runtime path resolution
│   │   ├── session/               # Session context & port isolation
│   │   └── setup/                 # Multi-agent setup adapters (JSONC AST parser)
│   ├── domains/                   # 10 Domain Services (memory, tasks, issues, etc.)
│   └── interfaces/                # API routes & MCP tool definitions
│
├── tools/                         # MCP Tool Implementations
│   ├── browserTools.js            # Playwright browser automation
│   ├── chatTools.js               # Multi-agent chat rooms
│   ├── emulatorTools.js           # Android emulator control
│   ├── executionTools.js          # Execution sandbox tools
│   ├── feedbackTools.js           # Feedback & voting tools
│   ├── mcpRegistryTools.js        # MCP registry & proxy tools
│   ├── notificationTools.js       # Sound notifications
│   └── store_context.js           # Memory persistence handler
│
├── tests/                         # Automated Verification Suites (29 files)
├── docs/                          # GitHub Pages Documentation Site
└── .reports/                      # Audit and release readiness documentation
```

---

## 3. Package Manifest Verification (`package.json`)

- **Name**: `local-mcp-memory` (Verified canonical)
- **Version**: `2.6.0`
- **Type**: `module` (ESM)
- **Binaries**:
  - `local-mcp-memory`: `./bin/cli.js` (Canonical)
  - `mcp-memory`: `./bin/cli.js` (Convenience alias)
  - `local-memory-mcp`: `./bin/cli.js` (Legacy compatibility alias)
- **Files Included**: 127 files packed into 307.5 kB tarball.
