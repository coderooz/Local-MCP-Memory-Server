# Configuration Guide — `local-mcp-memory`

`local-mcp-memory` uses a hierarchical configuration architecture designed for local development and multi-agent coordination.

---

## 1. Configuration Precedence

Settings resolve in the following strict order (highest priority first):
1. **Command-Line Arguments & Flags** (e.g. `--port`, `--project`, `--mongo-uri`)
2. **Project-Level Configuration File** (`.mcp-project` or `<project-slug>.project-mcp.json`)
3. **Environment Variables** (from `.env` or system environment)
4. **Global User Configuration** (`~/.local-mcp-memory/user-config.json` or `%LOCALAPPDATA%\local-mcp-memory\user-config.json`)
5. **System Defaults**

---

## 2. Environment Variables Reference

| Variable | Type | Default | Sensitive | Description |
|---|---|---|---|---|
| `MCP_DB_PATH` | String (Path) | Auto-resolved | No | Path to the SQLite database file (`mcp-memory.db`). |
| `PORT` | Number | `0` (Dynamic) | No | HTTP API listening port. Set `0` for dynamic port allocation. |
| `MCP_BASE_PORT` | Number | `47000` | No | Starting port for dynamic port allocation scanning (`47000-47020`). |
| `MCP_PORT_STRATEGY`| String | `dynamic` | No | Port selection strategy: `dynamic`, `fixed`, or `runtime-first`. |
| `MCP_PROJECT` | String | Dir basename | No | Project namespace identifier for context and task isolation. |
| `MCP_AGENT` | String | `codex` / Client | No | Active agent identifier recorded in activity logs and locks. |
| `MCP_SCOPE` | String | `project` | No | Memory scope boundary: `project` or `global`. |
| `MCP_PROJECT_ROOT` | String (Path) | CWD | No | Absolute root path of the project being worked on. |
| `NODE_ENV` | String | `development` | No | Node execution environment (`development`, `test`, `production`). |
| `LOG_LEVEL` | String | `info` | No | Logging verbosity (`debug`, `info`, `warn`, `error`). |
| `MCP_DEBUG` | Boolean | `false` | No | Enable verbose protocol and lifecycle debugging output. |
| `MCP_DEBUG_SQLITE` | Boolean | `false` | No | Enable detailed SQL query logging on stderr. |
| `MCP_MASTER_SECRET`| String | `null` | **YES** | 32+ char secret for AES-256-GCM encryption of external server tokens. |
| `JWT_SECRET` | String | Auto-generated | **YES** | Secret key for signing HTTP API / Dashboard JWT tokens. |
| `JWT_EXPIRY` | String | `7d` | No | Token expiration duration (e.g. `24h`, `7d`). |
| `MCP_MAX_ARGUMENT_PAYLOAD_BYTES` | Number | `1048576` (1MB) | No | Max byte size allowed for an individual MCP tool argument. |
| `MCP_NOTIFICATION_SOUND_PATH` | String (Path) | `assets/alert.mp3` | No | Path to sound file triggered by notification tools. |
| `MONGO_URI` | String (URI) | `mongodb://127.0.0.1:27017/mcp_memory` | **YES** | Read-only connection URI for legacy data migration. |
| `MONGO_DB_NAME` | String | `mcp_memory` | No | Source MongoDB database name for migration. |

---

## 3. Storage Locations

The application isolates user configuration, runtime state, and databases into dedicated platform paths:

### Windows (`%LOCALAPPDATA%\local-mcp-memory`):
- Database: `%LOCALAPPDATA%\local-mcp-memory\mcp-memory.db`
- Configuration: `%LOCALAPPDATA%\local-mcp-memory\user-config.json`
- Security Secrets: `%LOCALAPPDATA%\local-mcp-memory\secrets.json` (Mode 0600)
- API Keys: `%LOCALAPPDATA%\local-mcp-memory\api-keys.json`
- Runtime State: `%LOCALAPPDATA%\local-mcp-memory\run\<project>.mcp-runtime.json`

### Linux & macOS (`~/.local-mcp-memory`):
- Database: `~/.local-mcp-memory/mcp-memory.db`
- Configuration: `~/.local-mcp-memory/user-config.json`
- Security Secrets: `~/.local-mcp-memory/secrets.json` (Mode 0600)
- API Keys: `~/.local-mcp-memory/api-keys.json`
- Runtime State: `~/.local-mcp-memory/run/<project>.mcp-runtime.json`
