# CLI Architecture and Command Specification

## 1. Overview and Binary Entries

The `local-mcp-memory` package exports two executable command binaries:
1. `local-memory-mcp`: The primary brand and npm command name.
2. `mcp-memory`: Backward-compatible alias for existing automated workflows.

Entry point: [`bin/cli.js`](file:///C:/Code_Works/HTML_CSS_JS/workProjects/projects/local-mcp-memory/bin/cli.js)  
Engine: Commander v15.0.0 (Node.js 20+ ESM)

---

## 2. Global Installation & Commands Specification

### 2.1 `init` — Environment Initialization & Agent Integration
Prepares per-user directory trees, initializes configuration, and registers the MCP server with detected AI agents.

```bash
local-memory-mcp init [options]
```
**Options:**
- `-a, --agent <ids...>`: Client IDs to register explicitly (`opencode`, `codex`, `claude`, `cursor`, `windsurf`, `cline`).
- `--all`: Register every supported client, creating configuration files when missing.
- `--dry-run`: Preview changes without modifying files or client configurations.
- `--local`: Configure clients to launch the local working directory checkout rather than the global npm binary.
- `--skip-agents`: Only create config and directories; do not touch any client configs.
- `-p, --port <port>`: Preferred HTTP port (0 for dynamic allocation 47000..47020).
- `--project <project>`: Default project identifier.
- `--scope <scope>`: Default memory scope (`project` or `global`).
- `--json`: Output machine-readable JSON summary.

### 2.2 `start` — Server Execution
Launches the Local MCP Memory HTTP / MCP server.

```bash
local-memory-mcp start [options]
```
**Options:**
- `-d, --daemon`: Run in the background detached from the current shell.
- `-p, --port <port>`: Explicit TCP port to listen on.
- `--dashboard`: Open the interactive dashboard in the default browser upon launch.
- `--silent`: Suppress non-essential standard error logging.

### 2.3 `stop` — Server Termination
Stops active background server instances.

```bash
local-memory-mcp stop [options]
```
**Options:**
- `-p, --project <project>`: Target project server to terminate.
- `--all`: Terminate all active Local MCP Memory background servers on the host.

### 2.4 `status` — System & Topology Report
Displays active daemon status, database sizes, registered ports, and AI client integration status.

```bash
local-memory-mcp status [options]
```
**Options:**
- `--json`: Output comprehensive status telemetry as JSON.

### 2.5 `doctor` — Diagnostic Suite
Executes a multi-point verification of system dependencies, permissions, database integrity, and client configs.

```bash
local-memory-mcp doctor [options]
```
**Diagnostic Checks:**
1. Node.js runtime version compatibility (>= 20.0.0).
2. Data directory readability & write access (`%LOCALAPPDATA%` / `~/.local/share`).
3. Configuration directory access (`%APPDATA%` / `~/.config`).
4. Database schema verification (31 tables, WAL mode, foreign key enforcement, integrity check).
5. Secrets encryption & master secret configuration.
6. AI client configuration files syntax & MCP registration status.
7. Active port collision and listening server health probe.

### 2.6 `config` — User Settings Management
Inspects or updates persistent user settings.

```bash
local-memory-mcp config get <key>
local-memory-mcp config set <key> <value>
local-memory-mcp config list
local-memory-mcp config reset
```

### 2.7 `migrate` — MongoDB to SQLite Migration
Transfers historical data from MongoDB (v2.5.0) into embedded SQLite (v2.6.0).

```bash
local-memory-mcp migrate [options]
```
**Options:**
- `--from <uri>`: Source MongoDB connection string (defaults to `MONGO_URI` environment).
- `--db <name>`: Source database name (defaults to `mcp_memory`).
- `--apply`: Commit changes (default is a safe read-only dry run).
- `--backup <dir>`: Custom destination directory for the pre-migration snapshot.
- `--report <file>`: Write full JSON migration report.
- `--resume`: Resume a previously interrupted migration without duplicating records.
- `--on-duplicate <policy>`: Duplicate key handling policy (`error`, `first`, or `last`).
- `--orphans <policy>`: Orphan foreign key reference handling (`error`, `skip`, or `nullify`).
- `--db-path <path>`: Destination SQLite database path.
- `--rollback`: Restore destination database from an earlier migration snapshot.

### 2.8 `update` — Package Upgrade Utility
Checks the npm registry for newer versions and guides package upgrade.

```bash
local-memory-mcp update
```

### 2.9 `uninstall` — Cleanup & Deregistration
Removes AI client registrations and optionally purges database stores.

```bash
local-memory-mcp uninstall [--purge] [--yes]
```
**Options:**
- `--purge`: Delete all stored databases, settings, and secrets (destroys data).
- `--yes`: Bypass interactive confirmation prompt.

---

## 3. Data Subcommands (CLI Client Mode)

The CLI also includes quick-access tools for developers working directly in the terminal:
- `local-memory-mcp search <query>`: Full-text context search.
- `local-memory-mcp store <content>`: Store a persistent memory note.
- `local-memory-mcp create-task <title>`: Create a tracked coordination task.
- `local-memory-mcp tasks`: List current tasks by project/status.
- `local-memory-mcp activity`: Stream recent agent coordination activities.
