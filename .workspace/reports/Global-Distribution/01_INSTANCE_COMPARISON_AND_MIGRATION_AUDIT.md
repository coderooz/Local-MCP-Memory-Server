# Instance Comparison and Migration Audit

## 1. Instance Topology

| Attribute | Instance A (Usage / Legacy) | Instance B (Development / Authoritative) |
|---|---|---|
| **Local Path** | `C:\Code_Works\HTML_CSS_JS\workProjects\website\local-mcp-memory` | `C:\Code_Works\HTML_CSS_JS\workProjects\projects\local-mcp-memory` |
| **Version** | v2.5.0 / v2.5.1 | v2.6.0 |
| **Primary Database Engine** | MongoDB Native Driver (v7.1.0) | Embedded SQLite (`better-sqlite3` v13.0.3) |
| **Database Daemon Prerequisite** | Standalone `mongod` service (port 27017) | None (in-process embedded database) |
| **Storage Location** | MongoDB Database (`mcp_memory`) | Windows: `%LOCALAPPDATA%\local-mcp-memory\mcp-memory.db`<br>Linux/macOS: `~/.local/share/local-mcp-memory/mcp-memory.db` |
| **Config Location** | Local workspace `.env` + `mcp.config.json` | Windows: `%APPDATA%\local-mcp-memory\config.json`<br>Linux/macOS: `~/.config/local-mcp-memory/config.json` |
| **CLI Architecture** | Basic scripts (`mcp-server.js`, `server.js`) | Enterprise CLI (`bin/cli.js`, Commander, package binaries `local-memory-mcp`, `mcp-memory`) |
| **Client Configuration** | Manual JSON copying into agent configs | Automatic discovery & non-destructive registration for 6 AI agent platforms |
| **Migration Capability** | None | Built-in high-fidelity MongoDB-to-SQLite migration pipeline with backup & rollback |
| **Package Distribution** | Local folder cloning | npm package publication ready (`local-memory-mcp`) |

---

## 2. Operational Data Inventory (Instance A)

A live audit of Instance A via `node bin/cli.js migrate` dry-run identified 28,045 operational records accumulated across 16 collections:

| Collection Name | Document Count | Data Description & Significance |
|---|---|---|
| `contexts` | 2,613 | Core persistent memory blocks, decisions, architectural notes, and project knowledge |
| `memory_versions` | 7,158 | Historical versions and diffs of memory modifications |
| `tasks` | 789 | Active, pending, blocked, and completed project tasks |
| `activity` | 8,156 | Agent activity log entries, tool invocations, and coordination events |
| `metrics` | 4,986 | Telemetry, memory latency metrics, and execution performance records |
| `logs` | 4,883 | Server logs and operational diagnostics |
| `messages` | 276 | Cross-agent direct messages |
| `project_map` | 275 | Codebase structure, symbol mappings, and file annotations |
| `agents` | 208 | Registered agent identities, states, capabilities, and heartbeats |
| `actions` | 151 | Recorded agent tool actions and plan steps |
| `chat_messages` | 100 | Multi-agent collaboration chat room messages |
| `feedbacks` | 57 | Automated and agent feedback entries |
| `sessions` | 48 | Connected MCP client session contexts |
| `resource_locks` | 32 | Soft locks for concurrent resource protection |
| `issues` | 28 | Project issues, blockers, and bug trackers |
| `chat_rooms` | 12 | Collaborative multi-agent communication channels |
| **Total** | **28,045** | **Zero data loss target during migration** |

---

## 3. Structural & Architectural Discrepancies Resolved

1. **Database Path Configuration:**
   - Previous docs referenced `DB_PATH`, while implementation expected `MCP_DB_PATH`.
   - In v2.6.0, `src/core/paths/index.js` establishes standard platform defaults with fallback hierarchy: CLI flags (`--db-path`) -> Environment (`MCP_DB_PATH`) -> User Config (`config.json`) -> Platform default (`%LOCALAPPDATA%\local-mcp-memory\mcp-memory.db`).

2. **Default Ports & Port Manager Range:**
   - Documentation previously assumed static port 4000.
   - The Port Manager allocates dynamically within `47000..47020`, with 4000 supported as a legacy discovery target.
   - Startup logic now cleanly checks requested vs running ports and prevents false re-use collisions.

3. **Stale Lock Cleanup & Windows Process Liveness:**
   - On Windows, `process.kill(pid, 0)` throws `EPERM` for protected PIDs and `ESRCH` for absent PIDs.
   - `core/config/runtime-state.js` was enhanced to parse lock file timestamps and JSON PID payloads, immediately reclaiming stale locks left by crashed or terminated instances.

4. **FTS Search & Query Building:**
   - Quoting and regex fallback support added to `MemoryQueryBuilder.build` so hyphenated queries (e.g. `mcp-stabilization-test`) do not trigger FTS5 / MongoDB syntax negation errors.

---

## 4. Migration Strategy and Cutover Plan

```text
[ Instance A (v2.5.0) ]                     [ Instance B (v2.6.0) ]
     MongoDB Store                               Embedded SQLite
  (28,045 documents)                       (%LOCALAPPDATA%\mcp-memory.db)
          |                                              ^
          |             local-memory-mcp migrate         |
          +----------------------------------------------+
                         (Safe Migration)
                    - Dry run validation
                    - Snapshot backup creation
                    - Foreign key alignment
                    - Idempotent upsert & resume
                    - FTS index rebuild
```

### Cutover Execution Steps:
1. Ensure Instance A runtime is idle.
2. Run migration dry-run:
   ```bash
   npx local-memory-mcp migrate --from mongodb://127.0.0.1:27017/mcp_memory
   ```
3. Execute live migration with backup:
   ```bash
   npx local-memory-mcp migrate --from mongodb://127.0.0.1:27017/mcp_memory --apply
   ```
4. Verify migration report and data integrity via `doctor`:
   ```bash
   npx local-memory-mcp doctor
   ```
5. Point AI agents to the new global runtime via `init`:
   ```bash
   npx local-memory-mcp init
   ```
6. Retain Instance A folder as an inert backup until full user acceptance sign-off.
