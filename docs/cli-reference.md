# CLI Reference — `local-mcp-memory`

The `local-mcp-memory` Command Line Interface (CLI) provides comprehensive tools for managing the MCP server lifecycle, automatically configuring AI agent environments, and executing memory and task operations.

Binary aliases: `local-mcp-memory`, `mcp-memory`, `local-memory-mcp`.

---

## Global Options

All commands inherit standard Commander options:
- `-V, --version` — Output the version number (e.g. `2.6.0`).
- `-h, --help` — Display help for command.

---

## 1. Setup & Lifecycle Commands

### `init`
Initializes storage directories, generates encryption secrets, and automatically configures installed AI coding agents.

```bash
local-mcp-memory init [options]
```

- **Options:**
  - `-c, --client <agents...>`: Specify one or more client adapters to configure (e.g. `antigravity`, `cursor`, `claude`).
  - `-a, --all`: Automatically detect and configure all supported clients found on the machine.
  - `--dry-run`: Preview configuration changes without writing files.
  - `--no-backup`: Skip creating `.bak` files when editing client configs.
- **Examples:**
  - *PowerShell:*
    ```powershell
    # Auto-detect and configure all installed agents
    local-mcp-memory init --all
    # Configure specific agents in dry-run mode
    local-mcp-memory init -c antigravity cursor --dry-run
    ```
  - *POSIX Shell:*
    ```bash
    # Auto-detect and configure all installed agents
    local-mcp-memory init --all
    # Configure specific agents
    local-mcp-memory init -c claude opencode
    ```

---

### `start`
Starts the MCP memory server in either background daemon mode or foreground stdio mode.

```bash
local-mcp-memory start [options]
```

- **Options:**
  - `-d, --daemon`: Run the server as a background process.
  - `-p, --port <number>`: Override port for HTTP API server.
  - `--dashboard`: Open web dashboard UI upon startup.
  - `--foreground`: Run directly in current shell (default).
- **Examples:**
  - *PowerShell:*
    ```powershell
    # Start in background with dashboard
    local-mcp-memory start --daemon --dashboard
    ```
  - *POSIX Shell:*
    ```bash
    # Start on custom port in background
    local-mcp-memory start -d -p 3799
    ```

---

### `stop`
Gracefully stops active background server processes.

```bash
local-mcp-memory stop [options]
```

- **Options:**
  - `-p, --port <number>`: Stop server running on a specific port.
  - `--all`: Terminate all active `local-mcp-memory` instances.
- **Examples:**
  - *PowerShell / Bash:*
    ```bash
    local-mcp-memory stop --all
    ```

---

### `status`
Displays server status, PID, port, database location, and active connection counts.

```bash
local-mcp-memory status [options]
```

- **Options:**
  - `-p, --port <number>`: Target specific server port.
  - `--json`: Output raw JSON status data.
- **Examples:**
  - *PowerShell / Bash:*
    ```bash
    local-mcp-memory status
    local-mcp-memory status --json
    ```

---

### `doctor`
Runs comprehensive diagnostic checks on Node.js environment, SQLite database, file permissions, and client adapter configurations.

```bash
local-mcp-memory doctor [options]
```

- **Options:**
  - `--json`: Output full diagnostic report in JSON format.
  - `--verbose`: Include detailed system and adapter paths.
- **Examples:**
  - *PowerShell / Bash:*
    ```bash
    local-mcp-memory doctor
    local-mcp-memory doctor --verbose
    ```

---

### `config`
Inspects or modifies persistent user configuration in `user-config.json`.

```bash
local-mcp-memory config <subcommand>
```

- **Subcommands:**
  - `config path`: Prints the absolute path to `user-config.json`.
  - `config get <key>`: Retrieves a configuration value by key.
  - `config set <key> <value>`: Updates a configuration value.
- **Examples:**
  - *PowerShell / Bash:*
    ```bash
    local-mcp-memory config path
    local-mcp-memory config get defaultAgent
    local-mcp-memory config set logging.level verbose
    ```

---

### `update`
Checks for package updates and verifies SQLite schema migrations.

```bash
local-mcp-memory update [options]
```

- **Options:**
  - `--check`: Check update status without applying changes.
  - `--dry-run`: Simulate database migration checks.
- **Examples:**
  - *PowerShell / Bash:*
    ```bash
    local-mcp-memory update --check
    ```

---

### `uninstall`
Safely removes `local-mcp-memory` from AI agent configuration files.

```bash
local-mcp-memory uninstall [options]
```

- **Options:**
  - `-c, --client <agents...>`: Remove from specific agents.
  - `-a, --all`: Remove from all supported agent configurations.
  - `--purge`: Remove database, configuration, and log files.
  - `--dry-run`: Preview configuration edits without modifying files.
- **Examples:**
  - *PowerShell / Bash:*
    ```bash
    local-mcp-memory uninstall --all --dry-run
    ```

---

### `migrate`
Performs data migration from legacy MongoDB to the v2.6.0 SQLite storage engine.

```bash
local-mcp-memory migrate [options]
```

- **Options:**
  - `--mongo-uri <uri>`: Source MongoDB connection string (defaults to `mongodb://127.0.0.1:27017/mcp_memory`).
  - `--dry-run`: Inspect and reconcile records without writing to SQLite (default).
  - `--apply`: Authorize live write execution to destination SQLite database.
  - `--resume`: Skip existing records by identifier and resume partial migration.
  - `--duplicate-policy <policy>`: Conflict resolution strategy (`skip`, `error`, `overwrite`).
  - `--orphan-policy <policy>`: Handling for dangling child records (`skip`, `orphan`, `error`).
  - `--backup-dir <dir>`: Custom destination for pre-migration verified backups.
- **Examples:**
  - *PowerShell / Bash:*
    ```bash
    # Read-only dry-run census and inspection
    local-mcp-memory migrate --dry-run
    # Controlled live application with resume capability
    local-mcp-memory migrate --apply --resume
    ```

---

## 2. Memory & Context Data Commands

### `store <content>`
Persists a durable context or memory entry into SQLite with FTS5 indexing.

```bash
local-mcp-memory store <content> [options]
```

- **Options:**
  - `-p, --port <number>`: HTTP API server port.
  - `-t, --type <type>`: Context type (e.g. `architecture`, `decision`, `convention`, `note`). Default: `note`.
  - `--tags <tags...>`: List of metadata tags.
  - `--project <project>`: Project identifier override.
  - `--importance <1-5>`: Priority weighting (1=low, 5=critical). Default: `3`.
- **Examples:**
  - *PowerShell:*
    ```powershell
    local-mcp-memory store "Use better-sqlite3 with WAL mode for all queries" -t convention --tags sqlite database --importance 4
    ```
  - *POSIX Shell:*
    ```bash
    local-mcp-memory store "Use better-sqlite3 with WAL mode for all queries" -t convention --tags sqlite database --importance 4
    ```

---

### `search <query>`
Queries stored context entries using full-text search with relevance ranking.

```bash
local-mcp-memory search <query> [options]
```

- **Options:**
  - `-p, --port <number>`: HTTP API server port.
  - `-l, --limit <number>`: Maximum number of results to return. Default: `10`.
  - `--project <project>`: Filter results by project identifier.
  - `--json`: Output raw JSON search results.
- **Examples:**
  - *PowerShell / Bash:*
    ```bash
    local-mcp-memory search "WAL mode"
    local-mcp-memory search "database" --limit 5 --json
    ```

---

## 3. Task & Coordination Commands

### `create-task <title>`
Creates a project task with priority and optional auto-assignment.

```bash
local-mcp-memory create-task <title> [options]
```

- **Options:**
  - `-p, --port <number>`: HTTP API server port.
  - `--description <desc>`: Detailed task description.
  - `--priority <p>`: Priority level (`low`, `medium`, `high`, `critical`). Default: `medium`.
  - `--assignee <agent>`: Assign task to specific agent name.
  - `--project <project>`: Project identifier override.
- **Examples:**
  - *PowerShell / Bash:*
    ```bash
    local-mcp-memory create-task "Implement CI workflow" --priority high --assignee coder
    ```

---

### `list-tasks`
Lists project tasks with status filtering.

```bash
local-mcp-memory list-tasks [options]
```

- **Options:**
  - `-p, --port <number>`: HTTP API server port.
  - `-s, --status <status>`: Filter by status (`pending`, `in_progress`, `completed`, `blocked`).
  - `--project <project>`: Project identifier override.
  - `--json`: Output raw JSON data.
- **Examples:**
  - *PowerShell / Bash:*
    ```bash
    local-mcp-memory list-tasks -s in_progress
    ```

---

### `create-issue <title>`
Logs a bug, blocker, or architectural issue linked to project context.

```bash
local-mcp-memory create-issue <title> [options]
```

- **Options:**
  - `-p, --port <number>`: HTTP API server port.
  - `--description <desc>`: Issue description.
  - `--severity <s>`: Severity level (`low`, `medium`, `high`, `critical`). Default: `medium`.
  - `--project <project>`: Project identifier override.
- **Examples:**
  - *PowerShell / Bash:*
    ```bash
    local-mcp-memory create-issue "Port conflict on startup" --severity high
    ```

---

### `list-issues`
Lists active and resolved issues.

```bash
local-mcp-memory list-issues [options]
```

- **Options:**
  - `-p, --port <number>`: HTTP API server port.
  - `-s, --status <status>`: Filter by status (`open`, `investigating`, `resolved`).
  - `--project <project>`: Project identifier override.
  - `--json`: Output raw JSON data.
- **Examples:**
  - *PowerShell / Bash:*
    ```bash
    local-mcp-memory list-issues -s open
    ```

---

### `list-agents`
Lists all registered AI agents and their current heartbeat status.

```bash
local-mcp-memory list-agents [options]
```

- **Options:**
  - `-p, --port <number>`: HTTP API server port.
  - `--json`: Output raw JSON agent records.
- **Examples:**
  - *PowerShell / Bash:*
    ```bash
    local-mcp-memory list-agents
    ```

---

### `health`
Probes HTTP API server health and displays status, database connection, and uptime.

```bash
local-mcp-memory health [options]
```

- **Options:**
  - `-p, --port <number>`: Target port (auto-discovered if omitted).
  - `--detailed`: Include port registry, session counts, and memory statistics.
  - `--json`: Output raw JSON health payload.
- **Examples:**
  - *PowerShell / Bash:*
    ```bash
    local-mcp-memory health
    local-mcp-memory health --detailed
    ```
