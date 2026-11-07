# Project Bootstrap Directive for All Agents (Universal) — local-mcp-memory (v2.6.0)

> **CRITICAL NOTICE FOR ALL AI AGENTS:**
> This repository uses a centralized, tool-agnostic AI agent workspace located at **`.agent/`**.
> The authoritative master instructions, rules, invariants, and context live in:
> **[`.agent/AGENTS.md`](.agent/AGENTS.md)**

---

## 1. Quick Bootstrap Instructions
1. **Master Rules:** Read **[`.agent/AGENTS.md`](.agent/AGENTS.md)** immediately for mandatory invariants, tech stack guidelines, and execution rules.
2. **System Directives:** Consult **[`.agent/instructions/SYSTEM.md`](.agent/instructions/SYSTEM.md)** and **[`.agent/instructions/PROJECT_RULES.md`](.agent/instructions/PROJECT_RULES.md)**.
3. **Current State:** Check **[`.agent/context/CURRENT_STATE.md`](.agent/context/CURRENT_STATE.md)** and **[`.agent/context/ACTIVE_WORK.md`](.agent/context/ACTIVE_WORK.md)**.
4. **Agent Adapter:** Specific configuration for All Agents (Universal) can be found at **[.agent/adapters/README.md](.agent/adapters/README.md)**.

---

## 2. Non-Negotiable Invariants
- **Protected Live Instance:** `C:\Code_Works\HTML_CSS_JS\workProjects\website\local-mcp-memory` (v2.5.0) is the live stable MCP server. **DO NOT MODIFY OR DELETE.**
- **Production MongoDB:** `mongodb://127.0.0.1:27017/mcp_memory` is the production data source. **READ-ONLY UNTIL AUTHORIZED.**
- **Database Engine:** SQLite 3 (`better-sqlite3`) with WAL mode.
- **Runtime:** Node.js 20+ strictly using ECMAScript Modules (ESM). No CommonJS, no Mongoose.
- **Canonical Reports Workspace:** All campaign and audit reports live exclusively in **[`.workspace/reports/`](.workspace/reports/)**.
- **Canonical Resources Workspace:** Deep architectural documentation lives in **[`.workspace/resources/`](.workspace/resources/)**.

---

## 3. Verification Commands
- `npm run check` — Syntax check all JavaScript modules.
- `npm test` — Run automated test suites.
- `npm run test:resilience` — Run resilience and recovery verification.
- `npm run test:isolation` — Run multi-project session isolation tests.
- `npm run test:contract` — Run MCP protocol conformance verification.

Please navigate to **[`.agent/AGENTS.md`](.agent/AGENTS.md)** to begin execution.
