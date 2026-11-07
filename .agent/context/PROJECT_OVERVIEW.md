# Project Overview — local-mcp-memory

**local-mcp-memory** is a persistent, multi-agent memory server implementing the Model Context Protocol (MCP). It allows local AI development tools, IDEs, and autonomous agents to store, retrieve, search, and synchronize context, tasks, architectural decisions, and activity streams across development sessions.

## Core Capabilities
- **Cross-Agent Memory:** Shared, indexed memory stores accessible by different AI agents working on the same project.
- **Task & Milestone Orchestration:** Hierarchical task trees with dependency tracking and progress metrics.
- **Resource Locking (Soft Locks):** Prevents concurrent agents from overwriting the same code files or resources.
- **Activity Streams:** Real-time event log for tracking agent actions and human-agent collaborations.
- **Multi-Project Isolation:** Cryptographically separated namespaces ensuring memory isolation between different code repositories.
- **Dual Transport:** Supports stdio (local child process) and Express 5 SSE/HTTP (remote/shared process).
