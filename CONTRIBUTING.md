# Contributing to Local MCP Memory Server

Thank you for your interest in contributing to **Local MCP Memory Server**!

We welcome contributions from developers and AI agents alike. This document outlines the development workflow, coding conventions, testing requirements, and pull request guidelines.

---

## 1. Development Prerequisites

- **Node.js:** `>=20.0.0` (LTS recommended, tested on Node 20 and Node 24).
- **npm:** `>=9.0.0`.
- **Git:** Standard git client.
- **Operating System:** Cross-platform (Windows, macOS, Linux).

---

## 2. Setting Up Your Development Environment

1. **Clone the repository:**
   ```bash
   git clone https://github.com/coderooz/Local-MCP-Memory-Server.git
   cd Local-MCP-Memory-Server
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure local environment (optional):**
   ```bash
   cp .env.example .env
   ```
   *Note: Embedded SQLite requires zero configuration. A local database is initialized automatically at `./data/mcp-memory.db` or in platform AppData.*

4. **Verify your setup with the test suite:**
   ```bash
   npm test
   ```
   *All 249 assertions must pass before you start development.*

---

## 3. Development Workflow & Commands

| Task | Command | Description |
|---|---|---|
| **Syntax Validation** | `npm run check` | Validates syntax across all 67 project modules |
| **Linting** | `npm run lint` | ESLint 8 verification |
| **Lint Fix** | `npm run lint:fix` | Automatically fixes mechanical lint issues |
| **Formatting** | `npm run format:check` | Prettier 3 verification |
| **Run Unit Tests** | `npm test` | Runs syntax checks + 9 primary test suites |
| **Run Resilience Tests** | `npm run test:resilience` | Tests SQLite connection resilience and recovery |
| **Run Isolation Tests** | `npm run test:isolation` | Multi-project isolation verification |
| **Start MCP Server** | `npm start` | Starts MCP stdio server |
| **Start HTTP API** | `npm run start:api` | Starts Express 5 API server |
| **Start Dashboard** | `npm run start:dashboard` | Starts API server and opens web dashboard UI |

---

## 4. Coding Standards and Conventions

### 4.1 Strict ESM Architecture
- The project is pure ECMAScript Modules (`"type": "module"` in `package.json`).
- Always use explicit file extensions in imports (e.g. `import { foo } from './foo.js'`).
- Never use `require()`, `module.exports`, or CommonJS syntax.

### 4.2 Stdio Transport Purity
- **CRITICAL:** Never write debugging messages or arbitrary text to `stdout` in `mcp-server.js` or tool handlers.
- `stdout` is strictly reserved for JSON-RPC 2.0 protocol messages.
- Always write operational logs, warnings, and errors to `stderr` (`process.stderr.write(...)` or `console.error(...)`).

### 4.3 Database Access (SQLite via `better-sqlite3`)
- Do not introduce Mongoose, Prisma, or heavy ORMs.
- Always use parameterized queries or bound statements to prevent SQL injection.
- Ensure all mutations maintain Write-Ahead Logging (`WAL`) mode compatibility and foreign key integrity.

### 4.4 Fail-Closed Security
- Execution sandbox tools must remain disabled by default (`executionSandbox: false`).
- Stored external credentials must be encrypted via `src/core/mcp-registry/crypto.js` when `MCP_MASTER_SECRET` is present.
- Administrative endpoints (`/auth/me`, `/auth/api-keys`) must enforce `requireAuth`.

---

## 5. Extension Guides

For specific implementation workflows, refer to the developer guides:
- [Adding an MCP Tool](docs/development/adding-mcp-tool.md) — How to define, register, and test a new MCP tool.
- [Adding an Agent Adapter](docs/development/adding-agent-adapter.md) — How to extend CLI `init` to configure a new AI coding agent.
- [Testing Guide](docs/development/testing-guide.md) — How to run, write, and debug automated test suites.

---

## 6. Pull Request (PR) Lifecycle

1. **Create a topic branch:**
   ```bash
   git checkout -b feat/your-feature-name
   # or
   git checkout -b fix/issue-description
   ```
2. **Make your changes:** Keep commits focused and atomic.
3. **Write tests:** Add automated unit or integration tests in `tests/` for any new logic.
4. **Validate locally:**
   ```bash
   npm run check
   npm test
   npm run format:check
   ```
5. **Update documentation:** If modifying user-facing CLI flags, environment variables, or tool interfaces, update the corresponding files in `docs/` and `.workspace/PRI/`.
6. **Submit PR:** Open a PR against the `main` branch with a clear description of the problem solved, changes made, and verification output.

---

## 7. License

By contributing, you agree that your contributions will be licensed under the project's [MIT License](LICENSE).
