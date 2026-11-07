# Security Boundaries & Isolation Policy

## Execution Sandbox
- Any dynamically evaluated code or command executions triggered by MCP tools must run in a restricted execution environment.
- Fail-closed: if the sandbox configuration is invalid or missing, execution must halt immediately with an error.

## SQL Injection Prevention
- All SQLite queries must use parameterized statements via `better-sqlite3` (`db.prepare('... WHERE id = ?').get(id)`).
- NEVER concatenate raw user or agent input into SQL queries.

## Input Sanitization & Path Traversal
- Validate all file paths against allowed workspace directories using `path.resolve()`.
- Prevent path traversal attacks (`../`) outside project root.

## Credential Protection
- Never commit `.env` files, API keys, passwords, or session tokens.
- Never write credentials into reports, markdown context, or memory logs.
