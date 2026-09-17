# Project Rules — local-mcp-memory

## Purpose
Persistent multi-agent memory server implementing the Model Context Protocol (MCP).
Provides cross-agent memory, task management, project context, soft locks, and activity streams.
Consumed by opencode as a globally-configured MCP server.

## Tech Stack
- **Runtime:** Node.js 20+ (ESM modules, no CommonJS)
- **Framework:** Express 5
- **Database:** MongoDB native driver (no Mongoose)
- **Language:** JavaScript (no TypeScript)
- **Testing:** Custom Node.js test runner (node:test)
- **Linting:** ESLint 8 (`.eslintrc.json`)
- **Formatting:** Prettier 3 (`.prettierrc`)
- **Docs:** GitHub Pages (docs/ folder)

## Architecture
- Plugin-based architecture with dynamic loading
- MCP protocol spec: tools, resources, prompts, sampling, roots, transports
- Soft lock system for resource contention
- Memory versioning with optimistic concurrency
- Activity streams for live project tracking
- SSE/HTTP transport layer (Express 5)

## Pipeline
```
SEQUENTIAL GROUP 1: analyzer → tracker → watchdog
SEQUENTIAL GROUP 2: planner → tracker → watchdog
SEQUENTIAL GROUP 3: validator → tracker → watchdog
SEQUENTIAL GROUP 4: coder → tracker → watchdog
PARALLEL GROUP 5: code-reviewer + db-specialist → tracker → watchdog
SEQUENTIAL GROUP 6: validator → tracker → watchdog
PARALLEL GROUP 7: tester + security-auditor → tracker → watchdog
PARALLEL GROUP 8: documenter + setup → project-builder
```

## Roles

### analyzer
Analyzes plugin architecture, middleware chain, MCP tool handlers, MongoDB query patterns.

### planner
Plans implementation of MCP endpoints, Express routes, MongoDB schemas, plugin interfaces.

### validator
Validates architecture plan before coding and code quality after review.

### coder
Implements MCP tool endpoints, Express routes, MongoDB CRUD operations, event handlers.

### code-reviewer
Reviews Node.js ESM patterns, async error handling, MCP protocol compliance, Express 5 middleware.

### tester
Chaos testing, protocol integrity checks, multi-session isolation tests, memory CRUD validation.

### db-specialist
MongoDB indexes, aggregation pipelines, query optimization (native driver, no Mongoose).

### security-auditor
MCP protocol security, input sanitization, rate limiting, auth middleware, injection prevention.

### documenter
Documents MCP tool endpoints, API routes, MongoDB schemas, setup/configuration, interface contracts.

### setup
Initializes project structure, MongoDB indexes, GitHub Pages, CI/CD, environment configuration.

### tracker
Tracks project progress, updates AGENTS.md, manages milestones, monitors sub-agent task completion.

### watchdog
Monitors agent health, detects task paralysis, checks git staleness, enforces phase timeouts, recommends checkpoints.

## Key Files
- `mcp-server.js` — Main MCP server entry point
- `server.js` — HTTP API server
- `src/` — Source modules
- `core/` — Core framework (plugin loader, middleware, MCP protocol)
- `tools/` — MCP tool definitions
- `plugins/` — Plugin system
- `tests/` — Test suites
- `docs/` — GitHub Pages documentation

## Scripts
- `npm start` — Start MCP server
- `npm run start:api` — Start API server
- `npm run lint` — ESLint
- `npm run format` — Prettier
- `npm test` — Syntax check + test suites
- **opencode build:watch** — Run watchdog health check (opencode command, not npm)
