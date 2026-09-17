# Developer Notes

Comprehensive guide for developers working on or continuing the local-mcp-memory project.

---

## Project Overview

**Local MCP Memory Server** is a persistent multi-agent memory server implementing the Model Context Protocol (MCP). It provides cross-agent memory, task management, project context, soft locks, and activity streams. The server is consumed by opencode as a globally-configured MCP server.

### Why It Exists

AI agents (like Roo, Codex, Cursor) need a shared memory system that persists across sessions and enables coordination between multiple agents working on the same project. This server fills that gap by providing:

- Persistent memory with versioning and conflict detection
- Task orchestration with priority scoring and auto-assignment
- Soft resource locks for safe parallel work
- Activity streams for real-time project tracking
- Project intelligence (codebase structure knowledge)

### Current Status

- **Version:** 2.5.0
- **Status:** Preserved (not actively developed)
- **Repository:** https://github.com/coderooz/Local-MCP-Memory-Server
- **License:** MIT

### Major Capabilities

1. **Memory System** - Store, search, update, and version persistent context
2. **Task Orchestration** - Create, assign, and track coordination tasks
3. **Issue Tracking** - Track bugs, notes, blockers, and insights
4. **Agent Registry** - Register agents with heartbeat-based status
5. **Activity Streams** - Live project activity tracking
6. **Soft Locks** - Resource contention management
7. **Project Map** - Reusable codebase structure knowledge
8. **Browser Automation** - Playwright-based web interaction tools
9. **Chat System** - Inter-agent messaging
10. **Reset System** - Safe data cleanup with safety locks

### Known Limitations

- No built-in authentication (runs locally by default)
- No encryption at rest (use filesystem-level encryption for sensitive data)
- Single-process architecture (no horizontal scaling)
- Browser automation requires Playwright browser installation
- MongoDB required as external dependency

---

## Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    MCP Clients                          │
│         (opencode, Roo, Codex, Cursor, etc.)           │
└─────────────────────┬───────────────────────────────────┘
                      │ MCP Protocol (stdio/JSON-RPC)
                      ▼
┌─────────────────────────────────────────────────────────┐
│                  mcp-server.js                          │
│            MCP stdio transport layer                    │
│         (JSON-RPC request/response handling)            │
└─────────────────────┬───────────────────────────────────┘
                      │ HTTP API calls
                      ▼
┌─────────────────────────────────────────────────────────┐
│                    server.js                            │
│            Express HTTP API server                      │
│         (REST endpoints for all operations)             │
└─────────────────────┬───────────────────────────────────┘
                      │ MongoDB driver
                      ▼
┌─────────────────────────────────────────────────────────┐
│                   MongoDB                               │
│         (contexts, tasks, issues, agents,               │
│          messages, activity, locks, metrics)            │
└─────────────────────────────────────────────────────────┘
```

### Major Components

#### Entry Points

| Component  | File                   | Purpose                          |
| ---------- | ---------------------- | -------------------------------- |
| MCP Server | `mcp-server.js`        | MCP stdio transport (2766 lines) |
| HTTP API   | `server.js`            | Express REST API (3358 lines)    |
| Shim       | `mcp-shim.js`          | Bridge between MCP and API       |
| Startup    | `startMemoryServer.js` | Shared server initialization     |

#### Core Framework (`core/`)

| Module               | Purpose                                               |
| -------------------- | ----------------------------------------------------- |
| `core/config/`       | Configuration loading, port management, runtime state |
| `core/discovery/`    | Project auto-discovery                                |
| `core/mcp/`          | Data models, tool registry, tool executor             |
| `core/plugin/`       | Dynamic plugin loading                                |
| `core/integrations/` | Optional integrations (browser, knowledge, redis)     |

#### Domain Services (`src/domains/`)

| Domain      | Purpose                                     |
| ----------- | ------------------------------------------- |
| `memory/`   | Memory CRUD, versioning, conflict detection |
| `task/`     | Task management and orchestration           |
| `issue/`    | Issue tracking                              |
| `agent/`    | Agent registry and heartbeat                |
| `activity/` | Activity stream management                  |
| `project/`  | Project descriptors and maps                |
| `browser/`  | Browser automation (Playwright)             |
| `chat/`     | Inter-agent messaging                       |
| `feedback/` | Feedback system                             |
| `metrics/`  | Metrics collection                          |

#### Utilities (`utils/`)

| Utility                  | Purpose                                     |
| ------------------------ | ------------------------------------------- |
| `memoryEngine.js`        | Memory CRUD, versioning, conflict detection |
| `coordinationEngine.js`  | Task scheduling, auto-assignment            |
| `collaborationEngine.js` | Soft lock system                            |
| `activityTracker.js`     | Activity stream management                  |
| `projectIdentity.js`     | Project identity resolution                 |
| `resetEngine.js`         | System reset with safety locks              |
| `security-validators.js` | Input sanitization                          |
| `routeHandler.js`        | Express route handler abstraction           |

### Important Design Decisions

1. **ESM Only** - Entire codebase uses ES Modules (`"type": "module"`), no CommonJS
2. **No Mongoose** - Uses MongoDB native driver directly for full control
3. **Config-Driven** - All connection parameters loaded from `.project-mcp.json`
4. **In-Memory Runtime** - No file-based runtime state (all in-memory)
5. **Health-Based Discovery** - Agents discover MCP server via port scanning and health checks
6. **Soft Locks** - Non-blocking resource contention (warns, doesn't hard-block)

---

## Repository Structure

```
local-mcp-memory/
├── mcp-server.js              # MCP stdio server entry
├── server.js                  # Express HTTP API server
├── mcp-shim.js                # MCP shim/bridge
├── startMemoryServer.js       # Shared startup logic
├── agent-instruction.js       # Global agent instructions
├── mcp-integration-tools.js   # Integration tool definitions
├── migrate-project-id.js      # Project ID migration utility
│
├── src/                       # New modular source architecture
│   ├── core/                  # Database, MCP, session management
│   ├── domains/               # Domain services (memory, tasks, etc.)
│   └── interfaces/            # API routes, MCP tool definitions
│
├── core/                      # Core framework
│   ├── config/                # Configuration management
│   ├── discovery/             # Project auto-discovery
│   ├── mcp/                   # Data models
│   ├── plugin/                # Plugin system
│   └── integrations/          # Optional integrations
│
├── tools/                     # MCP tool implementations
├── utils/                     # Shared utilities
├── shared/utils/              # Logger, response formatter
├── plugins/emulator/          # Android emulator plugin
├── tests/                     # Test suites
├── scripts/                   # Chaos test, setup scripts
├── docs/                      # GitHub Pages documentation
├── prompt/                    # Prompt templates
├── assets/                    # Static assets
│
├── .github/                   # CI/CD, templates, dependabot
├── .opencode/                 # OpenCode project reference (PRI)
├── AGENTS.md                  # Project rules for agents
├── BEHAVIOR.md                # Behavioral instructions
├── CHANGELOG.md               # Version history
├── CONTRIBUTING.md            # Contribution guidelines
├── CODE_OF_CONDUCT.md         # Code of conduct
├── DEVELOPMENT.md             # This file
├── LICENSE                    # MIT license
├── MCP_AGENT_INSTRUCTIONS.md  # MCP agent instruction set
├── PROJECT_MEMORY_BOOTSTRAP.md # Memory bootstrap data
├── PROJECT_ROADMAP.md         # Project roadmap
├── README.md                  # Project overview
├── SECURITY.md                # Security policy
├── SUPPORT.md                 # Support information
├── TODO.md                    # Outstanding tasks
│
├── .env.example               # Environment variable template
├── .editorconfig              # Editor configuration
├── .eslintrc.json             # ESLint configuration
├── .gitattributes             # Git attributes
├── .gitignore                 # Git ignore rules
├── .nvmrc                     # Node.js version (20)
├── .prettierrc                # Prettier configuration
├── package.json               # Dependencies and scripts
├── package-lock.json          # Dependency lock file
│
└── *.project-mcp.json         # MCP project configuration files
```

---

## Development Environment

### Required Runtime Versions

- **Node.js:** >=20.0.0 (check `.nvmrc` for exact version)
- **MongoDB:** 7.x or later (native driver)
- **npm:** 9+ (comes with Node.js)

### Required Languages/Frameworks

- JavaScript (ES2022+ / ESM modules)
- Express 5.x
- MongoDB native driver 7.x
- Playwright 1.49.x (for browser automation)

### Required Tooling

```bash
# Install Node.js 20+ (using nvm)
nvm install 20
nvm use 20

# Install dependencies
npm install

# Install Playwright browsers (optional, for browser automation)
npx playwright install
```

### Required Environment Variables

Create a `.env` file with:

```env
# MongoDB Configuration
MONGO_URI=mongodb://localhost:27017/mcp_memory

# Server Configuration
# Use 0 for dynamic port allocation (recommended)
PORT=0

# MCP Project Identity
MCP_PROJECT=local-mcp-server
MCP_SCOPE=project

# Node Environment
NODE_ENV=development

# Logging
LOG_LEVEL=info
```

### Required External Services

- **MongoDB** - Must be running locally or accessible via `MONGO_URI`
- **Node.js 20+** - Runtime requirement

### Local Setup Requirements

1. Install Node.js 20+
2. Install and start MongoDB
3. Clone the repository
4. Run `npm install`
5. Create `.env` from `.env.example`
6. Start the API server: `npm run start:api`
7. Start the MCP server: `npm start`

---

## Running the Project

### Install Dependencies

```bash
npm install
```

### Start Development Mode

```bash
# Start API server (Express HTTP)
npm run start:api

# Start MCP server (stdio transport)
npm start

# For editor integrations, use the shim:
node /path/to/mcp-shim.js
```

### Build the Project

No build step required - runs directly with Node.js.

### Run in Production

```bash
# Set NODE_ENV=production in .env
npm run start:api  # API server
npm start          # MCP server
```

---

## Testing

### How to Run Tests

```bash
# Syntax validation (all files)
npm run check

# Linting
npm run lint

# Full test suite (check + feedback + chat tests)
npm test

# Specific test suites
npm run test:feedback
npm run test:chat
npm run test:emulator

# Chaos resilience testing
npm run chaos:test

# MCP chaos resilience test
node tests/mcp-chaos-resilience-test.js
```

### Test Framework

- Custom Node.js test runner (`node:test`)
- No external test framework (no Jest, Mocha, etc.)
- Tests are in `tests/` directory

### Important Test Suites

| Test File                         | Purpose                           | Tests    |
| --------------------------------- | --------------------------------- | -------- |
| `validation-test.js`              | Identity resolution, reset system | 15 tests |
| `multi-project-isolation-test.js` | Multi-project isolation           | 11 tests |
| `mcp-chaos-resilience-test.js`    | Chaos testing, protocol integrity | Variable |
| `browser-test.js`                 | Browser automation tools          | Variable |
| `feedback-system-test.js`         | Feedback system                   | Variable |
| `chat-system-test.js`             | Chat system                       | Variable |
| `vulnerability-test.js`           | Security testing                  | Variable |
| `conflict-detection-test.js`      | Conflict detection                | Variable |

### Known Testing Limitations

- Requires running MongoDB instance
- Browser automation tests require Playwright browsers installed
- No mock server for external service testing

---

## Deployment

### Deployment Dependencies

- Node.js 20+ runtime
- MongoDB database
- Network access for MCP clients

### Deployment Procedures

1. **Local Development:**
   - Run `npm run start:api` and `npm start` locally

2. **GitHub Pages (Documentation):**
   - Enable GitHub Pages in repository settings
   - Use `/docs` as source directory
   - Documentation auto-deploys on push to main

3. **Production:**
   - Set `NODE_ENV=production` in environment
   - Configure MongoDB connection string
   - Ensure MongoDB is accessible
   - Run both API and MCP servers

### CI/CD Workflows

| Workflow       | Trigger      | Purpose                        |
| -------------- | ------------ | ------------------------------ |
| `ci.yml`       | Push/PR      | Lint, test, build verification |
| `auto-tag.yml` | Version push | Auto-tag releases              |
| `release.yml`  | Manual       | Create GitHub releases         |
| `security.yml` | Schedule     | Security scanning              |

---

## Maintenance

### Common Maintenance Tasks

1. **Update Dependencies:**

   ```bash
   npm update
   npm audit fix
   ```

2. **Run Linting:**

   ```bash
   npm run lint
   npm run lint:fix  # Auto-fix issues
   ```

3. **Format Code:**

   ```bash
   npm run format
   ```

4. **Run Full Validation:**
   ```bash
   npm run lint && npm test
   ```

### Important Workflows

- **Code Changes:** Read file first, understand context, make change, run `npm run lint && npm test`
- **New MCP Tools:** Add to `tools/index.js`, implement handler, add to `mcp-server.js`
- **New API Endpoints:** Add route in `server.js`, use `routeHandler` abstraction
- **New Database Collections:** Add model in `core/mcp/models.js`, add indexes in `server.js` startup

### Where Project Logic Lives

| Concern               | Location                               |
| --------------------- | -------------------------------------- |
| MCP Protocol Handling | `mcp-server.js`                        |
| HTTP API Routes       | `server.js`                            |
| Data Models           | `core/mcp/models.js`                   |
| Memory Operations     | `utils/memoryEngine.js`                |
| Task Orchestration    | `utils/coordinationEngine.js`          |
| Collaboration         | `utils/collaborationEngine.js`         |
| Activity Tracking     | `utils/activityTracker.js`             |
| Project Identity      | `utils/projectIdentity.js`             |
| Reset System          | `utils/resetEngine.js`                 |
| Configuration         | `core/config/project-config-loader.js` |
| Browser Automation    | `tools/browserTools.js`                |

### How to Safely Modify Major Components

1. **Before editing:** Read the file, understand context, check imports
2. **Use resource locks:** `acquire_resource_lock()` before modifying shared resources
3. **Run validation:** `npm run lint && npm test` after changes
4. **Test thoroughly:** Run relevant test suites
5. **Document changes:** Update CHANGELOG.md for significant changes

---

## Known Issues

1. **No Authentication** - Server runs without auth; add reverse proxy for remote access
2. **Single Process** - No horizontal scaling; single MongoDB connection per server
3. **Port Conflicts** - Dynamic port allocation (PORT=0) recommended to avoid conflicts
4. **Playwright Browsers** - Must be installed separately (`npx playwright install`)

---

## Preservation & Recovery

### Authoritative Repository

- **GitHub:** https://github.com/coderooz/Local-MCP-Memory-Server
- **Visibility:** Public
- **Default Branch:** main

### External Dependencies Required

| Dependency          | Purpose            | Required |
| ------------------- | ------------------ | -------- |
| MongoDB             | Primary database   | Yes      |
| Node.js 20+         | Runtime            | Yes      |
| Playwright browsers | Browser automation | Optional |

### Files Intentionally Excluded from Git

| File/Directory      | Reason                                     |
| ------------------- | ------------------------------------------ |
| `.env`              | Contains secrets                           |
| `node_modules/`     | Dependencies (reinstall via `npm install`) |
| `.mcp-runtime.json` | Runtime state (auto-generated)             |
| `.mcp-port`         | Runtime state (auto-generated)             |
| `.opencode/`        | OpenCode workspace (contains node_modules) |
| `.workspace/`       | Development artifacts (not committed)      |

### How Excluded Configuration/Secrets Must Be Recreated

1. **`.env` file:** Copy from `.env.example` and fill in actual values:

   ```bash
   cp .env.example .env
   # Edit .env with actual MongoDB URI, project name, etc.
   ```

2. **`node_modules/`:** Reinstall via:

   ```bash
   npm install
   ```

3. **Playwright browsers:** Install via:
   ```bash
   npx playwright install
   ```

### External Dependencies That Cannot Be Reconstructed Solely from Git

- **MongoDB database** - Must be running and accessible
- **Playwright browsers** - Must be downloaded (not in git)
- **Environment variables** - Must be configured in `.env`

### Special Recovery Procedures

1. Clone repository from GitHub
2. Install Node.js 20+
3. Install MongoDB
4. Run `npm install`
5. Copy `.env.example` to `.env` and configure
6. Start MongoDB
7. Run `npm run start:api` (API server)
8. Run `npm start` (MCP server)

---

_This document was created as part of the project preservation process. It provides comprehensive information for future developers to understand, continue, and maintain the project._
