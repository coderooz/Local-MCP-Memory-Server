# Report 05: CLI Documentation Gap Analysis and Manual Plan

**Project:** `local-mcp-memory`  
**Binary Name:** `local-mcp-memory` (Aliases: `mcp-memory`, `local-memory-mcp`)  
**Target Release:** `v2.6.1`  
**Date:** 2026-11-07  
**Auditor:** Google Antigravity  

---

## 1. Complete CLI Command Inventory (17 Commands in `bin/cli.js`)

Our source-level inspection of `bin/cli.js` identified all 17 registered commands, their arguments, options, and defaults:

| # | Command Signature | Implementation Location | Documented in README? | Key Flags / Options |
|---|---|---|:---:|---|
| 1 | `init` | `bin/cli.js:190` | Yes | `--dry-run`, `--client <id>`, `--local` |
| 2 | `start` | `bin/cli.js:318` | Yes | `--port <number>`, `--background`, `--dashboard`, `--db-path <path>` |
| 3 | `stop` | `bin/cli.js:391` | Yes | `--port <number>`, `--force` |
| 4 | `status` | `bin/cli.js:421` | Yes | `--port <number>`, `--json` |
| 5 | `doctor` | `bin/cli.js:506` | Yes | `--port <number>`, `--json` |
| 6 | `config` | `bin/cli.js:537` | Partial | Subcommands: `path`, `get <key>`, `set <key> <value>` |
| 7 | `update` | `bin/cli.js:612` | Yes | `--check-only` |
| 8 | `uninstall` | `bin/cli.js:664` | Yes | `--client <id>`, `--purge-data`, `--dry-run` |
| 9 | `migrate` | `bin/cli.js:716` | Yes | `--mongo-uri <uri>`, `--dry-run`, `--apply`, `--resume`, `--backup-dir <dir>` |
| 10| `search <query>` | `bin/cli.js:826` | Yes | `--limit <n>`, `--project <id>`, `--json` |
| 11| `store <content>` | `bin/cli.js:846` | Yes | `--project <id>`, `--type <t>`, `--tags <list>`, `--json` |
| 12| `create-task <title>` | `bin/cli.js:876` | Yes | `--project <id>`, `--priority <p>`, `--assignee <a>`, `--json` |
| 13| `list-tasks` | `bin/cli.js:901` | Yes | `--project <id>`, `--status <s>`, `--limit <n>`, `--json` |
| 14| `create-issue <title>`| `bin/cli.js:923` | Yes | `--project <id>`, `--severity <s>`, `--tags <list>`, `--json` |
| 15| `list-issues` | `bin/cli.js:946` | Yes | `--project <id>`, `--status <s>`, `--limit <n>`, `--json` |
| 16| `list-agents` | `bin/cli.js:968` | Yes | `--project <id>`, `--active-only`, `--json` |
| 17| `health` | `bin/cli.js:983` | Yes | `--port <number>`, `--timeout <ms>`, `--json` |

---

## 2. Identified Documentation Gaps

1. **Undocumented Subcommands in `config`:**
   `local-mcp-memory config` has 3 subcommands (`path`, `get <key>`, `set <key> <value>`) that are omitted from `README.md` and only visible via `--help`.
2. **Missing Flag Explanations:**
   The README table lists high-level 1-line descriptions but omits essential operational flags:
   - `init --dry-run` (preview config modifications without writing)
   - `init --client <id>` (target only one specific agent, e.g. `claude` or `antigravity`)
   - `migrate --apply` vs `migrate --dry-run`
   - `uninstall --purge-data`
3. **Missing Cross-Platform Syntax:**
   Windows PowerShell handles quoted JSON and subcommands differently from Unix Bash; examples must be provided in both syntaxes.

---

## 3. Copy-Pasteable Command Reference Plan for v2.6.1

### A. Initialization & Health Diagnostics
```powershell
# PowerShell
npx local-mcp-memory init --dry-run
npx local-mcp-memory init
local-mcp-memory doctor --json
```
```bash
# Bash
npx local-mcp-memory init --dry-run
npx local-mcp-memory init
local-mcp-memory doctor --json
```

### B. Memory Storage & Full-Text Search
```powershell
# PowerShell
local-mcp-memory store "Architecture Decision: SQLite WAL mode enabled" --project "my-repo" --type "decision" --tags "db,arch"
local-mcp-memory search "SQLite WAL" --project "my-repo"
```
```bash
# Bash
local-mcp-memory store "Architecture Decision: SQLite WAL mode enabled" --project "my-repo" --type "decision" --tags "db,arch"
local-mcp-memory search "SQLite WAL" --project "my-repo"
```

### C. Task & Issue Orchestration
```powershell
# PowerShell
local-mcp-memory create-task "Implement SQLite migration adapter" --priority "high" --assignee "agent-coder"
local-mcp-memory list-tasks --status "pending"
local-mcp-memory create-issue "Foreign key violation on cascade delete" --severity "critical"
```
```bash
# Bash
local-mcp-memory create-task "Implement SQLite migration adapter" --priority "high" --assignee "agent-coder"
local-mcp-memory list-tasks --status "pending"
local-mcp-memory create-issue "Foreign key violation on cascade delete" --severity "critical"
```
