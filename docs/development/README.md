# Developer Documentation — `local-mcp-memory`

Welcome to the internal developer documentation for `local-mcp-memory`. These guides provide step-by-step instructions for extending the platform, implementing new MCP tools, adding AI agent adapters, and running test suites.

---

## Developer Guides Index

- [Testing Guide](testing-guide.md) — Comprehensive guide to running, writing, and debugging automated unit, conformance, resilience, and chaos test suites.
- [Adding an MCP Tool](adding-mcp-tool.md) — Step-by-step procedure for declaring JSON schemas, writing handlers, registering tools, and testing MCP tools.
- [Adding an Agent Adapter](adding-agent-adapter.md) — Guide to adding support for new AI coding agents in CLI `init` and `doctor`.

---

## Architectural Principles

1. **Pure ESM:** Node 20+ native ECMAScript Modules (`import` / `export`), zero CommonJS.
2. **Zero External DB Daemon:** Native SQLite driver (`better-sqlite3`) with WAL mode, foreign keys, and FTS5 full-text indexing.
3. **Stdio Protocol Hygiene:** Never log to `stdout` in stdio transport mode. `stdout` is strictly JSON-RPC 2.0; all diagnostic logs go to `stderr`.
4. **Defensive Security:** Fail-closed execution sandbox, AES-256-GCM token encryption at rest, and input validation.
