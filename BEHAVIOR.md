# Behavioral Instructions — local-mcp-memory

> **Purpose:** Applied to ALL agents operating in the local-mcp-memory project. Ensures safe coordination, memory persistence, and consistent execution across sessions.

---

## 1. Identity & Configuration

- Agent identity must be resolved before any operation. Never proceed as `"unknown"` agent or `"default"` project.
- If MCP configuration is missing: STOP, inform user, suggest setup.

---

## 2. Pre-Work Checklist

Before making changes or decisions, run in order:

1. **Project Descriptor** — `get_project_descriptor()` for project purpose, tech stack, constraints
2. **Context Memory** — `search_context()` for prior decisions, bugs, architecture
3. **Tasks** — `fetch_tasks()` to avoid duplicate work, respect assignments
4. **Messages** — `request_messages()` for handoffs, blockers
5. **Activity** — `fetch_activity()` when parallel work may matter
6. **Resource Locks** — `fetch_resource_locks()` for contested resources
7. **Project Map** — `fetch_project_map()` before deep structural work
8. **Decide** — Combine all context, then act
9. **Persist** — Store decisions, update tasks, log actions, record activity
10. **Cleanup** — Release resource locks when done

---

## 3. Collaboration Rules

- Assume concurrency — other agents and humans may work simultaneously.
- Before modifying shared resources, inspect tasks, messages, recent activity, and active resource locks.
- Use `acquire_resource_lock()` for resources you modify when overlap is plausible.
- Soft locks warn — they do not grant permission to ignore users or other agents.
- Respect task ownership boundaries. If another actor owns a task, avoid overlapping unless clearly necessary.

---

## 4. Conflict Resolution

- Detect conflicts explicitly. Never smooth over silently.
- If optimistic concurrency warnings appear, surface them.
- If a resource changed since your last known version, treat it as meaningful.
- For memory conflicts: importance → recency.
- For collaborative edit conflicts: warn, log activity, preserve traceability.

---

## 5. Memory Persistence

**Store:** Decisions, constraints, patterns, architecture, bugs/fixes, collaboration rules.
**Do NOT store:** Trivial chat, temporary scratch notes, unsupported assumptions, info obvious from project files.

---

## 6. Task & Issue Rules

- **Tasks** are coordination backbone. Create for multi-step/shared work. Update on status changes. Respect assignments.
- **Issues** are for bugs, notes, blockers, insights. Link to memory and tasks. Resolve explicitly when inactive.

---

## 7. Watchdog & Paralysis Prevention (CRITICAL)

> The **watchdog sub-agent** (`@watchdog`) is the MOST IMPORTANT agent in this project. It works at ALL TIMES watching every agent to prevent task paralysis.

### Always-On Monitoring
- The watchdog monitors ALL agents and sub-agents — especially `/command`-triggered tasks.
- It watches for: stalls (no output >30s), error loops (same error 3×), deadlocks (zero output), file conflicts.
- If you are an agent and feel stuck, invoke `@watchdog` yourself for a diagnostic.

### CMD Task Paralysis Rules
- Every `/command` task (build:project, build:quick, check, test, build:watch, etc.) has a quiet-time threshold.
- If a cmd task exceeds its threshold without visible output, the watchdog MUST intervene.
- **Do NOT let an agent retry the same failing command 3+ times.** The watchdog must break the cycle.
- Common paralysis risks: MongoDB connection timeout, npm install hanging, test suite deadlock.

### Escalation Ladder
1. **30s stall** — Watchdog sends warning + diagnostic suggestion to the agent
2. **60s stall** — Watchdog logs via `record_activity` + `create_issue`
3. **90s+ stall** — Watchdog uses `play_notification_sound` + escalates to user

### Your Responsibility
- If watchdog warns you about a stall, STOP what you're doing and follow its diagnostic guidance.
- Do not ignore watchdog reports. They prevent wasted time and resources.
- After unblocking, `record_activity` with status "unblocked" so watchdog knows the issue is resolved.

---

## 8. local-mcp-memory Specific Behavioral Guidelines

### Project Context
- **Type:** Persistent multi-agent memory server implementing MCP protocol
- **Stack:** Node.js 20+ (ESM), Express 5, MongoDB native driver (no Mongoose), JavaScript (no TypeScript)
- **Testing:** Custom Node.js test runner (`node:test`)
- **Linting:** ESLint 8 (`.eslintrc.json`), Formatting: Prettier 3
- **Docs:** GitHub Pages (`docs/` folder)
- **Pipeline:** 12-agent parallel orchestration (project-builder orchestrator)

### Critical Context
- This project IS the MCP server that other OpenCode projects depend on for memory persistence.
- Changes to plugin architecture, MCP tool handlers, or MongoDB query patterns affect ALL connected projects.
- Always use `acquire_resource_lock()` before modifying core modules (plugin loader, middleware chain, MongoDB CRUD).

### Code Changes
- Before editing, read the file first. Understand context.
- Run validation after any change: `npm run lint && npm test`.
- Use ESM (`import`/`export`) exclusively — no CommonJS (`require`).
- All new modules must follow the plugin-based architecture pattern.
- MCP tool endpoints must follow the established handler interface.

### Pipeline Execution
- The `project-builder` orchestrator manages the full build pipeline via delegated sub-agents.
- After each pipeline phase, the `tracker` audits state and the `watchdog` checks for anomalies.
- If you are a sub-agent: report completion to orchestrator, do not skip tracker validation.

### Database (MongoDB)
- Use native MongoDB driver — never Mongoose.
- Index all queried fields. Review query patterns for performance.
- Use aggregation pipelines for complex queries.
- Handle connection errors gracefully — the MCP server must stay up.

### OpenCode Coordination
- Use `@project-builder` for build orchestration tasks.
- This project is consumed by opencode globally — changes here affect all other projects.
- Run full validation (`npm run lint && npm test`) before committing.

---

## 8. Failure Handling

If tools fail or system state is inconsistent:
1. Stop and reassess
2. Retry if safe
3. Consult memory, activity, tasks, and messages
4. Ask user only when ambiguity is material
5. If configuration fails, STOP and prompt for setup

**Never:** Proceed as unknown/default, pretend sync when not, execute severe MCP reset without explicit confirmation.
