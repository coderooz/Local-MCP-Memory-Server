# Project Reference Index (PRI)

**Project:** local-mcp-memory
**Version:** 2.5.0
**Last Updated:** 2026-09-17
**Status:** Preserved (not actively developed)

---

## Project Overview

Persistent multi-agent memory server implementing the Model Context Protocol (MCP).
Provides cross-agent memory, task management, project context, soft locks, and activity streams.
Consumed by opencode as a globally-configured MCP server.

---

## Tech Stack

| Component | Technology | Version |
|-----------|-----------|---------|
| Runtime | Node.js | >=20.0.0 |
| Framework | Express | 5.x |
| Database | MongoDB (native driver) | 7.x |
| Language | JavaScript (ESM) | ES2022+ |
| Testing | node:test | Built-in |
| Linting | ESLint | 8.x |
| Formatting | Prettier | 3.x |
| Docs | GitHub Pages | - |
| Browser Automation | Playwright | 1.49.x |

---

## Repository Structure

```
local-mcp-memory/
├── mcp-server.js              # MCP stdio server entry (2766 lines)
├── server.js                  # Express HTTP API server (3358 lines)
├── mcp-shim.js                # MCP shim/bridge between MCP and API
├── startMemoryServer.js       # Shared memory server startup logic
├── agent-instruction.js       # Global agent instructions for MCP
├── mcp-integration-tools.js   # Integration tool definitions
├── migrate-project-id.js      # Project ID migration utility
│
├── src/                       # New modular source architecture
│   ├── core/
│   │   ├── database/          # connection.js, models.js (MongoDB native driver)
│   │   ├── mcp/               # tool-registry.js, tool-executor.js
│   │   └── session/           # Session management
│   ├── domains/
│   │   ├── activity/          # Activity tracking
│   │   ├── agent/             # Agent management
│   │   ├── browser/           # Browser automation (Playwright)
│   │   ├── chat/              # Chat system
│   │   ├── feedback/          # Feedback system
│   │   ├── issue/             # Issue tracking
│   │   ├── memory/            # Memory CRUD + versioning
│   │   ├── metrics/           # Metrics collection
│   │   ├── project/           # Project descriptors + maps
│   │   └── task/              # Task management
│   └── interfaces/
│       ├── api/               # Express route handlers
│       └── mcp-tools/         # MCP tool definitions
│
├── core/                      # Core framework
│   ├── config/                # connectionResolver, portManager, project-config-loader, runtime-state
│   ├── discovery/             # discovery-module.js (project auto-discovery)
│   ├── mcp/                   # models.js (all data models)
│   ├── plugin/                # plugin-manager.js (dynamic plugin loading)
│   └── integrations/          # browser/, knowledge/, redis/ (optional integrations)
│
├── tools/                     # MCP tool implementations
│   ├── index.js               # Tool aggregator
│   ├── browserTools.js        # Browser automation tools
│   ├── chatTools.js           # Chat system tools
│   ├── emulatorTools.js       # Android emulator tools
│   ├── feedbackTools.js       # Feedback tools
│   ├── notificationTools.js   # Notification/alert tools
│   └── store_context.js       # Memory storage tool
│
├── utils/                     # Shared utilities (15 files)
│   ├── activityTracker.js     # Activity stream management
│   ├── collaborationEngine.js # Soft lock system
│   ├── coordinationEngine.js  # Task scheduling, auto-assignment
│   ├── eventBus.js            # Event system
│   ├── memoryEngine.js        # Memory CRUD, versioning, conflict detection
│   ├── metrics.js             # Metrics collection
│   ├── projectIdentity.js     # Project identity resolution
│   ├── rate-limiter.js        # Rate limiting
│   ├── resetEngine.js         # System reset with safety locks
│   ├── routeHandler.js        # Express route handler abstraction
│   ├── security-validators.js # Input sanitization
│   └── mcp-*.js               # MCP connection/port management
│
├── shared/utils/              # logger.js, responseFormatter.js
├── plugins/emulator/          # Android emulator plugin
├── tests/                     # 20 test files
├── scripts/                   # chaos-test.js, project-mcp-setup.js
├── docs/                      # GitHub Pages site
├── prompt/                    # Prompt templates
├── assets/                    # Static assets
├── .github/                   # CI/CD, issue templates, dependabot, CODEOWNERS
└── .opencode/                 # OpenCode project reference (this file)
```

---

## Entry Points

| File | Purpose | How to Run |
|------|---------|-----------|
| `mcp-server.js` | MCP stdio server | `npm start` |
| `server.js` | Express HTTP API | `npm run start:api` |
| `mcp-shim.js` | MCP shim for editor integration | `node /path/to/mcp-shim.js` |
| `startMemoryServer.js` | Shared startup logic | Used by other entry points |

---

## MCP Tool Surface

### Memory Tools
- `store_context` — Store persistent memory
- `search_context` — Search stored memory
- `update_context` — Update memory with version tracking
- `get_full_context` — Retrieve context with all actions
- `get_connected_context` — Retrieve context with related entities
- `optimize_memory` — Run memory optimization

### Project Intelligence Tools
- `set_project_descriptor` — Store/update project descriptor
- `get_project_descriptor` — Fetch project descriptor
- `create_project_map` — Store project-map entries
- `fetch_project_map` — Fetch project-map entries

### Task Tools
- `create_task` — Create coordination tasks
- `fetch_tasks` — Fetch tasks with filters
- `assign_task` — Claim/assign tasks
- `update_task` — Update task status/blockers

### Issue Tools
- `create_issue` — Create issues/notes/blockers
- `resolve_issue` — Resolve issues
- `fetch_issues` — Fetch issues with filters

### Agent Tools
- `register_agent` — Register agents
- `heartbeat_agent` — Send agent heartbeats
- `list_agents` — List registered agents

### Communication Tools
- `send_message` — Send messages between agents
- `request_messages` — Fetch messages for current agent

### Collaboration Tools
- `record_activity` — Append activity entries
- `fetch_activity` — Fetch activity stream
- `acquire_resource_lock` — Acquire soft locks
- `release_resource_lock` — Release soft locks
- `fetch_resource_locks` — Fetch active locks

### System Tools
- `fetch_metrics` — Fetch task/memory metrics
- `log_action` — Log actions for traceability
- `get_logs` — Retrieve system logs
- `get_agent_instructions` — Get agent instructions
- `reset_mcp` — Execute reset operations
- `estimate_reset_impact` — Preview reset impact

### Browser Automation Tools (24 tools)
- Session: `open_browser`, `close_browser`, `get_active_sessions`
- Navigation: `navigate_to_url`, `reload_page`, `go_back`, `go_forward`
- DOM: `click_element`, `fill_input`, `get_element_text`, `get_elements`, `wait_for_selector`
- Page Info: `get_page_title`, `get_current_url`, `get_page_content`
- Control: `set_viewport`, `clear_cookies`, `get_cookies`, `set_cookies`
- Execution: `evaluate_javascript`, `take_screenshot`, `wait_for_timeout`

---

## Database Collections

| Collection | Purpose | Key Indexes |
|------------|---------|-------------|
| `contexts` | Memory entries | project, agent, tags, text search |
| `context_versions` | Version history | context_id, version |
| `tasks` | Coordination tasks | project, status, assigned_to, priority |
| `issues` | Issues/notes/blockers | project, type, status |
| `agents` | Agent registry | project, agent_id |
| `messages` | Inter-agent messages | project, to_agent, from_agent |
| `activity` | Activity stream | project, timestamp |
| `resource_locks` | Soft locks | resource, project |
| `project_descriptors` | Project identity | project |
| `project_map` | Codebase intelligence | project, file_path |
| `metrics` | System metrics | project, name |
| `logs` | Operational logs | project, level, timestamp |

---

## Configuration

### Environment Variables
| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `MONGO_URI` | Yes | `mongodb://localhost:27017/mcp_memory` | MongoDB connection |
| `PORT` | No | `0` (dynamic) | API server port |
| `MCP_PROJECT` | No | directory name | Project identifier |
| `MCP_AGENT` | No | `unknown` | Agent identifier |
| `MCP_SCOPE` | No | `project` | Memory visibility scope |
| `NODE_ENV` | No | `development` | Environment mode |

### Config Files
| File | Purpose | Gitignored |
|------|---------|-----------|
| `.env` | Environment variables | Yes |
| `.env.example` | Environment template | No |
| `local-mcp-memory.project-mcp.json` | MCP project config | No |
| `mcp.json` | MCP server config | No |
| `mcp.config.json` | MCP config template | No |

---

## CI/CD

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `ci.yml` | Push/PR | Lint, test, build |
| `auto-tag.yml` | Version push | Auto-tag releases |
| `release.yml` | Manual | Create GitHub releases |
| `security.yml` | Schedule | Security scanning |
| `labeler.yml` | PR | Auto-label PRs |
| `stale.yml` | Schedule | Mark stale issues |
| `welcome.yml` | New contributor | Welcome message |

---

## Testing

```bash
# Syntax validation
npm run check

# Linting
npm run lint

# Full test suite
npm test

# Specific tests
npm run test:feedback
npm run test:chat
npm run test:emulator

# Chaos resilience testing
npm run chaos:test
```

---

## Key Dependencies

| Package | Purpose | Version |
|---------|---------|---------|
| `express` | HTTP framework | ^5.2.1 |
| `mongodb` | Database driver | ^7.1.0 |
| `playwright` | Browser automation | ^1.49.1 |
| `dotenv` | Environment loading | ^17.3.1 |
| `uuid` | Unique identifiers | ^13.0.0 |

---

## External Dependencies

| Service | Purpose | Required |
|---------|---------|----------|
| MongoDB | Primary database | Yes |
| Node.js 20+ | Runtime | Yes |
| Playwright browsers | Browser automation | Optional |

---

## Known Limitations

1. No built-in authentication (runs locally by default)
2. No encryption at rest (use filesystem-level encryption)
3. Browser automation requires Playwright browser installation
4. Single-process architecture (no horizontal scaling)

---

## Governance Files

| File | Purpose | Location |
|------|---------|----------|
| `AGENTS.md` | Project rules for agents | Root |
| `BEHAVIOR.md` | Behavioral instructions | Root |
| `GOVERNANCE.md` | Global governance rules | `~/.config/opencode/` |
| `PROJECT_WORKFLOW.md` | Global project workflow | `~/.config/opencode/governance/` |

---

*This PRI is maintained as part of the project's governance compliance. Update when project structure changes significantly.*
