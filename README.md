# Local MCP Memory Server

![GitHub stars](https://img.shields.io/github/stars/coderooz/Local-MCP-Memory-Server)
![GitHub forks](https://img.shields.io/github/forks/coderooz/Local-MCP-Memory-Server)
![GitHub issues](https://img.shields.io/github/issues/coderooz/Local-MCP-Memory-Server)
![GitHub closed issues](https://img.shields.io/github/issues-closed/coderooz/Local-MCP-Memory-Server)
![License](https://img.shields.io/github/license/coderooz/Local-MCP-Memory-Server)
![Node.js Version](https://img.shields.io/node/v/local-mcp-memory)
![npm Version](https://img.shields.io/npm/v/local-mcp-memory)
[![CI](https://github.com/coderooz/Local-MCP-Memory-Server/actions/workflows/ci.yml/badge.svg)](https://github.com/coderooz/Local-MCP-Memory-Server/actions)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

**Local MCP Memory Server** is a persistent multi-agent memory and coordination engine implementing the [Model Context Protocol (MCP)](https://modelcontextprotocol.io). Powered by embedded SQLite (`better-sqlite3`), it provides AI agents and humans with a shared, persistent context layer featuring full-text search, soft resource locks, project descriptors, task orchestration, issue tracking, and external MCP server proxying.

- **Current Version:** `v2.6.0`
- **Documentation Hub:** [docs/README.md](docs/README.md)
- **Official Web Docs:** https://coderooz.github.io/Local-MCP-Memory-Server/

---

## Key Capabilities

- **Persistent Agent Memory:** Store, retrieve, update, and rank context entries across agent sessions with full SQLite FTS5 full-text indexing.
- **Multi-Agent Coordination:** Prevent conflicts using soft resource locks (`acquire_resource_lock`, `release_resource_lock`) and live activity streams (`record_activity`).
- **Task & Issue Management:** Priority scoring, dependency tracking, and capability-aware task auto-assignment.
- **External MCP Server Registry:** Register, connect, discover, and proxy calls to third-party MCP servers with AES-256-GCM encrypted credentials at rest.
- **CLI & Auto-Configuration:** Automated setup for 8 AI coding agents (Antigravity, OpenCode, Codex, Claude, Cursor, Windsurf, Cline, Roo Code).
- **Embedded Zero-Config Storage:** Uses local SQLite via `better-sqlite3` with Write-Ahead Logging (WAL) and enforced foreign key constraints. No external database server required.
- **Security & Access Control:** Dual JWT and programmatic API-key authentication for HTTP APIs, loopback binding by default, and fail-closed local execution sandboxing.

---

## Quickstart

### Option 1: Global CLI Auto-Configuration (Recommended)

Initialize the database and automatically configure all installed AI coding agents:

```bash
npx local-mcp-memory init
```

Or install globally:

```bash
npm install -g local-mcp-memory
local-mcp-memory init
```

> **Installation Source Note**:
> - **npm Registry**: `npm install -g local-mcp-memory`
> - **GitHub Release (Direct)**: You can also install directly from the tagged GitHub release via:
>   ```bash
>   npm install -g https://github.com/coderooz/Local-MCP-Memory-Server.git#v2.6.1
>   ```

The `init` command automatically:
1. Detects your operating system and Node.js environment (`>=22.0.0`).
2. Creates the per-user application directory (`~/.local-mcp-memory` or `%LOCALAPPDATA%\local-mcp-memory`) and initializes the SQLite database (`mcp-memory.db`).
3. Auto-generates persistent security secrets (`MCP_MASTER_SECRET` and JWT signing secret).
4. Auto-detects and configures **all 8 supported AI coding agents**:
   - **Google Antigravity** (`mcp_config.json`)
   - **OpenCode** (`opencode.json`)
   - **OpenAI Codex CLI** (`config.toml`)
   - **Claude Desktop** (`claude_desktop_config.json`)
   - **Cursor** (`mcp.json`)
   - **Windsurf** (`mcp_config.json`)
   - **Cline** (`cline_mcp_settings.json`)
   - **Roo Code** (`mcp_settings.json`)
5. Preserves existing configuration comments and keys using an AST-safe parser, creating timestamped `.bak` backups.

Run system diagnostics anytime to verify your environment:

```bash
local-mcp-memory doctor
```

---

### Option 2: Local Developer Setup

Clone the repository and run the server locally:

```bash
git clone https://github.com/coderooz/Local-MCP-Memory-Server.git
cd Local-MCP-Memory-Server
npm install
```

Configure your local environment (`.env`):

```bash
cp .env.example .env
```

```env
# Runtime database location (defaults to local data directory)
MCP_DB_PATH=./data/mcp-memory.db

# Optional port override (default is dynamic allocation 47000-47020)
PORT=3799

# Project and agent context
MCP_PROJECT=local-mcp-memory
MCP_AGENT=antigravity
MCP_SCOPE=project

# Optional master encryption secret for MCP registry tokens (AES-256-GCM)
MCP_MASTER_SECRET=your-32-byte-master-secret-here
```

Start the MCP stdio server:

```bash
npm start
```

Start the HTTP API server with optional Web Dashboard:

```bash
npm run start:api
# Or start with visual dashboard:
npm run start:dashboard
```

Run the automated test suite (249 passing assertions):

```bash
npm test
```

---

## CLI Command Summary (17 Commands)

The `local-mcp-memory` CLI provides complete management and data operations:

| Command | Category | Description |
|---|---|---|
| `init` | Setup | Initialize storage and auto-configure AI agent clients |
| `start` | Lifecycle | Start the MCP server in foreground or background |
| `stop` | Lifecycle | Stop running MCP server processes gracefully |
| `status` | Lifecycle | Check server health, active PID, and listening port |
| `doctor` | Diagnostics | Run comprehensive system and agent configuration diagnostics |
| `config` | Configuration | View or modify global configuration (`path`, `get`, `set`) |
| `update` | Maintenance | Verify database schema migrations and installation status |
| `uninstall` | Maintenance | Safely remove MCP server from agent configurations |
| `migrate` | Migration | Read-only inspection or execution of MongoDB-to-SQLite migration |
| `search <query>` | Data | Query stored memory using SQLite FTS5 full-text search |
| `store <content>` | Data | Store durable context or memory entry |
| `create-task <title>` | Data | Create a project-scoped coordination task |
| `list-tasks` | Data | List project tasks with optional status filtering |
| `create-issue <title>` | Data | Log an issue, bug, or coordination blocker |
| `list-issues` | Data | List open and resolved issues |
| `list-agents` | Data | List registered agents and active heartbeat statuses |
| `health` | Diagnostics | Probe the HTTP API server health endpoints |

> For complete syntax, options, and PowerShell / POSIX examples for all 17 commands, see [CLI Reference](docs/cli-reference.md).

---

## Core MCP Tools (63 Tools Discovered)

When connected to an AI agent via MCP, `local-mcp-memory` exposes 63 tools, including:

- **Context & Memory:** `store_context`, `search_context`, `update_context`, `get_connected_context`, `delete_context`
- **Project Intelligence:** `get_project_descriptor`, `set_project_descriptor`, `create_project_map`, `fetch_project_map`
- **Coordination & Locks:** `acquire_resource_lock`, `release_resource_lock`, `fetch_resource_locks`, `record_activity`, `fetch_activity`
- **Tasks & Issues:** `create_task`, `fetch_tasks`, `assign_task`, `update_task`, `create_issue`, `resolve_issue`, `fetch_issues`
- **Agent Registry:** `register_agent`, `heartbeat_agent`, `list_agents`
- **External MCP Registry:** `register_mcp_server`, `connect_mcp_server`, `discover_mcp_tools`, `proxy_mcp_call`, `get_mcp_health`

> For full integration details, client configuration snippets, and tool parameters, see [MCP Integration Guide](docs/mcp-integration.md).

---

## Documentation Directory

| Document | Purpose |
|---|---|
| [Documentation Hub](docs/README.md) | Centralized index of all user and developer documentation |
| [CLI Reference](docs/cli-reference.md) | Complete reference for all 17 CLI commands with copy-pasteable examples |
| [Configuration Guide](docs/configuration.md) | Exhaustive reference of environment variables and configuration files |
| [MCP Integration Guide](docs/mcp-integration.md) | Client setup instructions for all 8 supported AI coding agents |
| [Security Policy](SECURITY.md) | Security model, JWT/API-key auth, AES-256-GCM encryption, and reporting |
| [Contributing Guide](CONTRIBUTING.md) | Guidelines for developers, PR lifecycle, and coding standards |
| [Testing Guide](docs/development/testing-guide.md) | Instructions for running unit, conformance, resilience, and chaos tests |
| [Adding an MCP Tool](docs/development/adding-mcp-tool.md) | Step-by-step developer guide for creating and registering new MCP tools |
| [Adding an Agent Adapter](docs/development/adding-agent-adapter.md) | Guide for extending CLI `init` to support new AI agent clients |

---

## License

This project is licensed under the [MIT License](LICENSE).
