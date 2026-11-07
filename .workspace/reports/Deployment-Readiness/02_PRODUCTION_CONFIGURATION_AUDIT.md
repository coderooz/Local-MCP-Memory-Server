# Production Configuration and Environment Management Audit

**Audit Date:** 2026-11-06  
**Repository Target:** `C:\Code_Works\HTML_CSS_JS\workProjects\projects\local-mcp-memory`  

---

## 1. Environment Variable Catalog

Comprehensive audit of all 47 `process.env` references identified in the source code:

| Variable | Required | Default | Security Level | Purpose |
|---|---|---|---|---|
| `PORT` | Optional | `0` | Low | Port for Express HTTP server (0 enables dynamic ephemeral port) |
| `MCP_BASE_PORT` | Optional | `47000` | Low | Starting range for port conflict scan |
| `MCP_PORT_STRATEGY` | Optional | `dynamic` | Low | Strategy: `dynamic` or `fixed` |
| `MCP_DB_PATH` | Optional | `%LOCALAPPDATA%/local-mcp-memory/mcp-memory.db` | High | Explicit path to SQLite database file |
| `MCP_PROJECT` | Optional | Derived from directory | Low | Active project scope identifier |
| `MCP_AGENT` | Optional | `unknown` | Low | Active agent caller identifier |
| `MCP_SCOPE` | Optional | `project` | Low | Scope filter (`project` or `global`) |
| `MCP_PROJECT_ROOT` | Optional | `process.cwd()` | Low | Project root path anchor |
| `NODE_ENV` | Optional | `development` | Low | Environment (`production`, `development`, `test`) |
| `LOG_LEVEL` | Optional | `info` | Low | Logging verbosity (`debug`, `info`, `warn`, `error`) |
| `MCP_MASTER_SECRET` | Optional* | None (Plaintext warning) | **CRITICAL** | 32+ char key for AES-256-GCM encryption of stored credentials |
| `JWT_SECRET` | Optional* | In-memory dev key | **CRITICAL** | Secret for signing JWT authentication tokens |
| `JWT_EXPIRY` | Optional | `24h` | Medium | Expiration duration for signed JWTs |
| `MCP_MAX_ARGUMENT_PAYLOAD_BYTES` | Optional | `1048576` (1MB) | Medium | Denial-of-service argument size ceiling |
| `MCP_MAX_ARGUMENT_STRING_LENGTH` | Optional | `262144` (256KB) | Medium | String argument length ceiling |
| `MCP_CIRCUIT_FAILURE_THRESHOLD` | Optional | `5` | Low | Consecutive upstream failures before circuit opens |
| `MCP_CIRCUIT_COOLDOWN_MS` | Optional | `30000` | Low | Cooldown time before probing half-open circuit |
| `MCP_HEALTH_CHECK_INTERVAL` | Optional | `60000` | Low | Upstream health sweep frequency |
| `MONGO_URI` | Optional | `mongodb://127.0.0.1:27017` | High | Source database URI for migration CLI only |
| `MCP_RESET_CONFIRM` | Optional | None | High | Confirmation passcode for hard database reset |

*\* Marked optional for development convenience; mandatory for hardened production HTTP deployments.*

---

## 2. Configuration Validation Lifecycle

The configuration lifecycle operates with strict precedence:
1. **Real Process Environment (`process.env`)** — Always takes absolute precedence.
2. **User Configuration (`<configDir>/config.json`)** — Loaded via `src/core/config/user-config.js`. Validates integer ranges (ports 0–65535), valid scope enums, and string paths.
3. **User Secrets File (`<configDir>/.env`)** — Loaded via `dotenv` in `src/core/config/load-env.js`.
4. **Hardcoded Safe Defaults** — Zero external daemon required; database defaults to platform-isolated directories.

### Invariant Checks:
- **No Package Secrets:** The package directory is explicitly **NOT** scanned for `.env` or credentials.
- **Actionable Startup Failures:** Invalid port numbers or malformed configuration throw explicit errors with human-readable remediation suggestions.
- **Path Isolation:** All default paths are resolved via `src/core/paths/index.js` to `%LOCALAPPDATA%` (Windows) or `~/.local-mcp-memory` (Linux/macOS), keeping runtime data completely separate from the package or repository tree.

---

## 3. Persistent Data and Filesystem Layout

| Artifact | Stored Location | Packaged in npm? | Committed in Git? |
|---|---|---|---|
| **SQLite DB** | `%LOCALAPPDATA%/local-mcp-memory/mcp-memory.db` | **NO** (Excluded) | **NO** (Ignored) |
| **WAL & SHM Files** | Beside database file | **NO** (Excluded) | **NO** (Ignored) |
| **System Logs** | `%LOCALAPPDATA%/local-mcp-memory/logs/` | **NO** (Excluded) | **NO** (Ignored) |
| **User Config** | `%LOCALAPPDATA%/local-mcp-memory/config/` | **NO** (Excluded) | **NO** (Ignored) |
| **Runtime Port Files** | Isolated project root (`*.mcp-runtime.json`) | **NO** (Excluded) | **NO** (Ignored) |
