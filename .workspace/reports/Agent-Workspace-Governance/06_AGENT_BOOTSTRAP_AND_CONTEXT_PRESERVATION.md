# Report 06: Agent Bootstrap and Context Preservation

**Project:** local-mcp-memory  
**Version:** 2.6.0  
**Campaign:** Campaign 9 — Unified Agent Workspace Architecture & Governance  
**Date:** 2026-11-06  
**Auditor:** Google Antigravity  
**Status:** COMPLETE / VERIFIED  

---

## 1. Context Fragmentation Challenge
In multi-agent environments, different AI tools look for specific instruction files in the workspace root. If different files contain divergent rules, agents can contradict each other, overwrite critical invariants, or execute invalid operations.

---

## 2. Universal Bootstrap Architecture
To eliminate drift, all root instruction files have been transformed into standard lightweight bootstrap pointers:
- `AGENTS.md`
- `CLAUDE.md`
- `GEMINI.md`
- `CODEX.md`
- `OPENCODE.md`
- `.clinerules`

Each bootstrap file enforces:
1. **Direct Pointer:** Immediate link to `.agent/AGENTS.md`.
2. **Critical Safety Invariants:** Explicit warnings regarding the protected v2.5.0 instance, read-only MongoDB production database, SQLite runtime engine, and ESM requirements.
3. **Dedicated Adapter Link:** Points the agent directly to its specific adapter in `.agent/adapters/`.

---

## 3. Context Preservation Mechanics
- **Session Logs:** When an agent finishes a shift, it appends a chronological summary to `.agent/memory/SESSION_LOG.md`.
- **Handoff State:** The active engineering state, blockers, and next steps are recorded in `.agent/memory/HANDOFF.md`.
- **Zero Loss:** Incoming agents read `HANDOFF.md` and immediately resume work with full situational awareness.
