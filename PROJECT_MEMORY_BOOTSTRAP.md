# Project Memory Bootstrap

Use this file to seed durable MCP memory for the `local-mcp-memory` project.

## Project Profile

```text
Type: project-profile
Title: local-mcp-memory overview
Context: project bootstrap
Details: Node.js MCP memory server backed by MongoDB. Provides MCP tools for storing, searching, and tracing reusable memory across agents and sessions.
Why: Future agents need the project purpose and runtime model immediately.
Impact: Treat this repository as the memory-server implementation, not just an app that consumes MCP.
```

## Architecture

```text
Type: architecture
Title: service layout
Context: server structure
Details: mcp-server.js is the MCP stdio entrypoint. server.js hosts the HTTP API and MongoDB-backed persistence. startMemoryServer.js ensures the API server starts once. mcp.model.js defines memory models and query building. logger.js writes operational logs and error-derived context.
Why: Future work often touches the protocol layer and persistence layer together.
Impact: Keep MCP transport concerns separate from HTTP persistence concerns.
```

## Runtime Rules

```text
Type: constraint
Title: environment-driven identity
Context: MCP launch configuration
Details: Agent, project, scope, and server URL are injected through environment variables. MCP_AGENT identifies the client. MCP_PROJECT groups memory by project. MCP_SCOPE controls visibility. Missing values fall back to defaults in mcp-server.js.
Why: Incorrect launch config produces misleading stored metadata such as unknown agent or default project.
Impact: Verify launch configuration before debugging memory attribution problems.
```

## Search Behavior

```text
Type: pattern
Title: memory search depends on Mongo text indexes
Context: /context/search
Details: Search uses MongoDB text search plus app-side ranking by keyword overlap, importance, recency, and access count. Required indexes are created during API startup.
Why: Search quality and runtime correctness depend on the indexes existing before requests are served.
Impact: Preserve index initialization when changing startup or search logic.
```

## Tooling Notes

```text
Type: note
Title: current MCP tool surface
Context: protocol behavior
Details: The server exposes store_context, search_context, log_action, get_full_context, start_session, get_agent_instructions, and get_logs. store_context currently accepts only content from the MCP client side.
Why: Agents should not assume richer tool inputs than the MCP layer actually exposes.
Impact: Put important structured information directly into the stored content text.
```

## Suggested Seed Actions

Store the entries above when starting fresh on a new database or after major architectural changes.

Then add entries for:
- deployment and startup expectations
- naming and coding conventions
- known recurring bugs
- changes that supersede older behavior
