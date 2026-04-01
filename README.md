# Local MCP Memory Server

Local MCP Memory Server is a MongoDB-backed coordination layer for MCP clients that need more than isolated memory. It gives agents and humans a shared system for persistent context, project descriptors, tasks, issues, activity tracking, soft locks, and collaboration-safe state updates.

Official Docs: https://coderooz.github.io/Local-MCP-Memory-Server/

![GitHub stars](https://img.shields.io/github/stars/coderooz/Local-MCP-Memory-Server)
![Issues](https://img.shields.io/github/issues/coderooz/Local-MCP-Memory-Server)
![License](https://img.shields.io/github/license/coderooz/Local-MCP-Memory-Server)

---


## Overview

This project upgrades the usual "agent executes, user waits" flow into a safer collaboration model where agents can work in parallel with users and other agents without losing project context or silently trampling each other's changes.

The stack is:

- MCP stdio transport in `mcp-server.js`
- Express API in `server.js`
- MongoDB persistence for memory, versions, activity, locks, tasks, issues, messages, metrics, and project intelligence

## Feature Highlights

- Project descriptor system for baseline project identity and rules
- Persistent memory with ranking, lifecycle states, and version history
- Live activity stream for agent and user-visible project tracking
- Soft resource locks for files, modules, tasks, and other shared resources
- Task orchestration with priority scoring, scheduling, and capability-aware auto-assignment
- Issue and notes tracking linked to memory and tasks
- Agent registry with heartbeat-based status tracking
- Project map for reusable codebase structure knowledge
- Context graph retrieval that links memory, tasks, issues, actions, versions, and related agents
- Metrics for task completion, memory usage, and collaboration signals

## Human + Agent Collaboration

The server now supports safe parallel collaboration:

- agents can publish live activity entries
- agents can acquire soft locks before shared work
- updates can include expected versions or timestamps for overlap detection
- conflicting updates are surfaced as warnings instead of being hidden
- task ownership and active locks help reduce accidental overlap

This is designed to warn and coordinate, not hard-block humans.

## Quick Start

1. Install dependencies:

```bash
npm install
```

2. Create `.env`:

```env
MONGO_URI=mongodb://localhost:27017/mcp_memory
PORT=4000
MCP_AGENT=codex
MCP_PROJECT=local-mcp-server
MCP_SCOPE=project
MCP_SERVER_URL=http://localhost:4000
```

3. Run the API:

```bash
npm run start:api
```

4. Run the MCP server:

```bash
npm start
```

5. For editor integrations, prefer:

```bash
node /absolute/path/to/mcp-shim.js
```

## Usage Summary

Typical system-mode flow:

1. Read the project descriptor
2. Search memory
3. Fetch tasks and messages
4. Check recent activity and active locks
5. Claim or update work
6. Make the change
7. Store reusable memory, log actions, and release locks

Key MCP tools now include:

- `set_project_descriptor`, `get_project_descriptor`
- `store_context`, `search_context`, `update_context`, `get_connected_context`
- `create_task`, `fetch_tasks`, `assign_task`, `update_task`
- `create_issue`, `resolve_issue`, `fetch_issues`
- `record_activity`, `fetch_activity`
- `acquire_resource_lock`, `release_resource_lock`, `fetch_resource_locks`
- `register_agent`, `heartbeat_agent`, `list_agents`
- `create_project_map`, `fetch_project_map`
- `fetch_metrics`, `log_action`, `get_logs`

## Documentation

The `docs/` folder contains the GitHub Pages site and now covers:

- system purpose and architecture
- project descriptors and project identity
- activity tracking and soft-lock collaboration
- API and MCP tool reference
- human + agent collaboration guidelines

Enable GitHub Pages on the repository and use `/docs` as the source to publish it.

## Validation

Run:

```bash
npm test
```

## License

MIT
