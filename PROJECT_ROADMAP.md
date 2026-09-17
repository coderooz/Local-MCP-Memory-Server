# MCP Project Roadmap

## Phase 1 — Core Stability

- Fix search_context bug (ids undefined)
- Implement optimistic locking (version-based updates)
- Enforce strict project isolation in all queries
- Fix agent heartbeat (agent_id undefined + lifecycle validation)

## Phase 2 — Data Hardening

- Add input validation (all endpoints)
- Add idempotency + duplicate protection
- Validate messaging targets (no silent success)
- Add proper rate limiting

## Phase 3 — Architecture Cleanup

- Remove dual architecture (unify into src/)
- Break down server.js and mcp-server.js
- Standardize error handling

## Phase 4 — Features

- Integrated knowledge database
- EXE distribution (no Node/Mongo dependency)
- Browser extension for agent web actions
- Issue tracking + auto-fix system

## Fix Strategy

1. Stabilize memory system
2. Prevent data corruption
3. Enforce isolation
4. Validate inputs
5. Then add features
