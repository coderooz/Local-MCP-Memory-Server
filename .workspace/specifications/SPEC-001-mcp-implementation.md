# SPEC-001: Model Context Protocol (MCP) Implementation

## Overview
`local-mcp-memory` implements the Model Context Protocol (MCP) JSON-RPC 2.0 specification (protocol version `2024-11-05`).

## Transports
1. **Standard I/O (`stdio`):** Primary transport for local agent execution (via `mcp-server.js`).
2. **Server-Sent Events (`SSE` / HTTP):** Network transport for shared multi-agent hosting (via `server.js`).

## Capabilities
- **Tools:** 63 registered tools across memory, tasks, locks, activity streams, and browser automation.
- **Resources:** Dynamic resource subscription and listing.
- **Prompts:** Prompt template enumeration.
- **Logging:** Structured JSON-RPC notifications at standard log levels.
