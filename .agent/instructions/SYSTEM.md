# System Instructions for AI Agents

You are operating on **local-mcp-memory** (v2.6.0), a high-performance local memory server implementing the Model Context Protocol (MCP).

## Primary Operational Directives
1. **Respect Authoritative Context:** Always check `.agent/context/CURRENT_STATE.md` and `.agent/context/ACTIVE_WORK.md` before executing tasks.
2. **Strict ESM Compliance:** All JavaScript files must be Node.js ESM. Never use `require()`, `module.exports`, or `__dirname` directly (use `import.meta.url` and `fileURLToPath`).
3. **No Mongoose:** v2.6.0 uses SQLite via `better-sqlite3`. Do not introduce Mongoose or any heavy ORM.
4. **Sandbox & Security:** All tool invocations must adhere to fail-closed security. Parameter validation is mandatory.
5. **Safe Verification:** Verification must precede claims of completion. Run `npm run check` and `npm test` to ensure zero regressions.
