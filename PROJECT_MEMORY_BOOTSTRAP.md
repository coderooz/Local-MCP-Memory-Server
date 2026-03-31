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
Details: Agent, project, scope, and server URL are injected through environment variables. MCP_AGENT identifies the client. MCP_PROJECT groups memory by project. MCP_SCOPE controls visibility. Project identity resolution now prefers a project-local override file (`.mcp-project` / `.mcp-project.json`), then project `.env`, then package metadata, then the nearest project-root folder. MCP_PROJECT_ROOT is injected for traceability.
Why: Incorrect launch config produces misleading stored metadata such as unknown agent or a generic workspace namespace like vscode.
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
Details: The server exposes memory tools, task tools (create_task, fetch_tasks, assign_task, update_task), messaging tools, agent registration tools, and project intelligence tools (create_project_map, fetch_project_map). store_context still accepts only content from the MCP client side, but structured project knowledge should now go into the project-map system instead of free-form memory whenever possible.
Why: Agents should not assume outdated MCP tool limits or skip the structured coordination/project-map layers.
Impact: Prefer project-map entries for architecture and file-ownership knowledge, and tasks/messages for coordination state.
```

## Project Map Seeds

Use the following entries to bootstrap the structured project map for this repository.

```text
Path: .
Type: project
Summary: Distributed MCP memory server for multi-agent coordination with MongoDB-backed persistence, task management, messaging, agent registration, and reusable project intelligence.
Key Details:
- Core runtime is split between MCP stdio transport and Express persistence API.
- Project identity is derived from nearest root markers and slugified for stable namespaces.
- Shared goal is coordination and knowledge reuse across AI agents, not isolated tool execution.
```

```text
Path: mcp-server.js
Type: module
Summary: MCP stdio entrypoint that defines the tool surface, starts the HTTP API on demand, injects agent/project identity, and forwards tool calls to backend routes.
Key Details:
- Uses the same project identity resolver as the shim.
- Exposes task, messaging, and project-map tools for agents.
- Waits for the HTTP API before calling backend endpoints.
```

```text
Path: server.js
Type: module
Summary: Express API and persistence orchestration layer that handles contexts, actions, sessions, agents, tasks, messages, logs, and project-map entries.
Key Details:
- Creates Mongo indexes during startup.
- Enforces project-scoped task/message/project-map retrieval patterns.
- Upserts project-map entries by project plus file_path.
```

```text
Path: mcp.model.js
Type: module
Summary: Shared data model definitions for stored entities and memory normalization utilities.
Key Details:
- BaseModel injects shared metadata like project, agent, scope, tags, and timestamps.
- TaskModel now stores blocker/result handoff state.
- ProjectMapModel stores structural summaries, relationships, key details, and related tasks.
```

```text
Path: mcp-shim.js
Type: module
Summary: Launch wrapper that derives project identity from the current working tree and starts mcp-server.js with piped stdio.
Key Details:
- Sets MCP_PROJECT automatically when not provided.
- Sets MCP_PROJECT_ROOT for traceability.
- Keeps protocol-safe stdio wiring between editor/agent and MCP server.
```

```text
Path: utils/projectIdentity.js
Type: module
Summary: Shared utility for finding the nearest project root marker and deriving a stable slugified project identifier.
Key Details:
- Single source of truth for project identity resolution.
- Used by both the shim and the direct MCP entrypoint.
- Prevents namespace drift between different launch paths.
```

```text
Path: logger.js
Type: module
Summary: Writes operational logs to MongoDB and promotes errors into reusable memory entries for future debugging.
Key Details:
- Keeps logs out of MCP stdout.
- Converts runtime errors into global context entries with metadata.
```

```text
Path: startMemoryServer.js
Type: module
Summary: Ensures the Express API starts only once per process and can be reused by MCP calls safely.
Key Details:
- Prevents duplicate API bootstrap inside one runtime.
- Resets startup promise on failure so startup can be retried.
```

## Suggested Seed Actions

Store the entries above when starting fresh on a new database or after major architectural changes.

Then add entries for:
- deployment and startup expectations
- naming and coding conventions
- known recurring bugs
- changes that supersede older behavior
