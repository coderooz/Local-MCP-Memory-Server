# Canonical Agent Rules & Directives — local-mcp-memory

## Project Identity
- **Project Name:** `local-mcp-memory`
- **Version:** `2.6.0`
- **Target Database:** SQLite (`better-sqlite3` via WAL mode)
- **Runtime:** Node.js 20+ (Strict ESM, no CommonJS)
- **Protocol:** Model Context Protocol (MCP) JSON-RPC 2.0 (stdio and HTTP/SSE)

## Critical Invariants & Safety Boundaries
1. **Protected Production Instance:**
   - `C:\Code_Works\HTML_CSS_JS\workProjects\website\local-mcp-memory` (v2.5.0) is the live stable MCP provider.
   - NEVER modify, delete, or overwrite files in the protected website instance during development campaigns.
2. **Production MongoDB Protection:**
   - `mongodb://127.0.0.1:27017/mcp_memory` contains historical production data.
   - Read-only access during dry-runs and inventory. NEVER drop collections, delete data, or execute unapproved live migrations.
3. **Global Client Configuration:**
   - Antigravity global MCP configuration (`%USERPROFILE%\.gemini\antigravity\mcp_config.json`) points to the stable v2.5.0 server. Do not redirect without explicit user command.
4. **Zero Data Loss Migration:**
   - All migrations from MongoDB to SQLite must preserve 100% of records (29,831 records verified) with full type fidelity, nested metadata preservation, and complete rollback snapshots.
5. **Clean Working Tree:**
   - No destructive git operations (`git reset --hard`, `git clean -f`).
   - Run tests before and after code changes.

## Tech Stack Rules
- **Modules:** Native ECMAScript Modules (`import` / `export`). File extensions in imports must be explicit (`.js`, `.mjs`).
- **Database:** Native `better-sqlite3` wrapper. No ORM/Mongoose in v2.6.0 SQLite runtime.
- **Framework:** Express 5 for HTTP/SSE transport layer.
- **Testing:** Node.js native test runner (`node:test`) and custom assertion harnesses.
- **Linting & Formatting:** ESLint 8 and Prettier 3.

## Standard Roles
- **analyzer:** Analyzes system architecture, query patterns, and failure modes.
- **planner:** Formulates execution roadmaps, migration plans, and schema transitions.
- **validator:** Enforces architecture invariants, schema contracts, and governance rules.
- **coder:** Implements MCP tools, endpoints, database migrations, and adapter logic.
- **code-reviewer:** Reviews ESM compatibility, async handling, and error propagation.
- **tester:** Runs chaos, multi-session isolation, and integrity suites.
- **security-auditor:** Verifies sandbox fail-closed behavior, input sanitization, and path boundaries.
- **tracker:** Updates indices, logs progress, and maintains execution state.

## Verification Commands
- `npm run check` — Syntax check across all JavaScript files.
- `npm test` — Primary test suite.
- `npm run test:resilience` — Resilience and failure mode tests.
- `npm run test:isolation` — Multi-project session isolation tests.
- `npm run test:contract` — MCP protocol and tool contract conformance.
- `npm run test:execution` — Execution sandbox and tool execution tests.
