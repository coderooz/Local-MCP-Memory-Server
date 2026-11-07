# Report 06: AI Agent Documentation and Adapter Audit

**Project:** `local-mcp-memory`  
**Target Release:** `v2.6.1`  
**Date:** 2026-11-07  
**Auditor:** Google Antigravity  

---

## 1. Audit of the Canonical `.agent/` Workspace

Campaign 9 established a 38-file centralized agent workspace under `.agent/`. This structure was verified for real-world usability:

| Workspace Area | Files | Invariant Compliance | Quality Rating |
| :--- | :---: | :---: | :---: |
| `.agent/AGENTS.md` | 1 | Master rules, dual-repo boundary, SQLite, ESM, roles | **EXCELLENT** |
| `.agent/instructions/`| 7 | `SYSTEM`, `PROJECT_RULES`, `WORKFLOW`, `SECURITY`, `TESTING`, `DOCUMENTATION`, `RELEASE_POLICY` | **EXCELLENT** |
| `.agent/context/` | 6 | `PROJECT_OVERVIEW`, `ARCHITECTURE`, `CURRENT_STATE`, `DECISIONS`, `ACTIVE_WORK`, `KNOWN_LIMITATIONS` | **EXCELLENT** |
| `.agent/maps/` | 4 | `PROJECT_MAP`, `LOGIC_MAP`, `DEPENDENCY_MAP`, `DATA_FLOW_MAP` | **EXCELLENT** |
| `.agent/adapters/` | 9 | `README` + 8 dedicated agent guides | **EXCELLENT** |
| `.agent/templates/` | 4 | `TASK_HANDOFF`, `SESSION_SUMMARY`, `DECISION_RECORD`, `INCIDENT_REPORT` | **EXCELLENT** |
| `.agent/schemas/` | 3 | Formal JSON validation schemas for memory, configs, handoffs | **EXCELLENT** |

---

## 2. Multi-Agent Discovery & Compatibility Evaluation

We evaluated the actual discovery mechanisms across all 8 supported AI agent ecosystems:

| Agent Platform | Instruction Discovery Type | Adapter Implementation (`agent-configs.js`) | Client Config Path | Verification Status |
| :--- | :--- | :--- | :--- | :---: |
| **Google Antigravity** | Bootstrap via `GEMINI.md` / `AGENTS.md` | Standard JSON adapter | `~/.gemini/antigravity/mcp_config.json` | **VERIFIED** |
| **OpenCode** | Bootstrap via `OPENCODE.md` / `AGENTS.md` | AST-safe JSONC adapter (comment-preserving) | `~/.config/opencode/opencode.json` | **VERIFIED** |
| **OpenAI Codex CLI** | Bootstrap via `CODEX.md` / `AGENTS.md` | TOML parser/serializer | `~/.codex/config.toml` | **VERIFIED** |
| **Claude Desktop** | Bootstrap via `CLAUDE.md` / `AGENTS.md` | Standard JSON adapter | `%APPDATA%/Claude/claude_desktop_config.json` | **VERIFIED** |
| **Cline (VS Code)** | Bootstrap via `.clinerules` / `AGENTS.md` | Standard JSON adapter | `%APPDATA%/Code/.../saoudrizwan.claude-dev/.../cline_mcp_settings.json` | **VERIFIED** |
| **Roo Code (VS Code)**| Bootstrap via `.clinerules` / `AGENTS.md` | Standard JSON adapter | `%APPDATA%/Code/.../rooveterinaryinc.roo-cline/.../cline_mcp_settings.json` | **VERIFIED** |
| **Cursor IDE** | Bootstrap via `AGENTS.md` | Standard JSON adapter | `~/.cursor/mcp.json` | **VERIFIED** |
| **Windsurf (Codeium)**| Bootstrap via `AGENTS.md` | Standard JSON adapter | `~/.codeium/windsurf/mcp_config.json` | **VERIFIED** |

---

## 3. Distinction of Integration Levels

To maintain factual integrity, we distinguish three distinct levels of agent integration:

1. **Fully Configured & Programmatically Automated (Level 1):**
   - *Agents:* OpenCode, Codex, Claude Desktop, Antigravity, Cline, Roo Code, Cursor, Windsurf.
   - *Mechanism:* `local-mcp-memory init` automatically inspects, backs up, and registers the server inside the client's native configuration file.
2. **Explicit Bootstrap Pointers (Level 2):**
   - *Files:* Root `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `CODEX.md`, `OPENCODE.md`, `.clinerules`.
   - *Mechanism:* Automatically ingested by agent IDEs upon opening the repository workspace, immediately routing the agent into `.agent/AGENTS.md`.
3. **Documentation-Only Guidance (Level 3):**
   - Dedicated guides in `.agent/adapters/<agent>/README.md` providing manual JSON/TOML configuration snippets if the developer chooses manual integration.

---

## 4. Recommendations for v2.6.1

1. **Update `README.md`:** Ensure the CLI Quick Start section explicitly lists **Google Antigravity** and **Roo Code** alongside the other 6 agents.
2. **Preserve Handoff Ownership:** Mandate in `.agent/instructions/WORKFLOW.md` that outgoing agents must update `.agent/memory/HANDOFF.md` before concluding any session.
3. **Automated Link Verification in CI:** Integrate `tests/workspace-governance-test.mjs` into GitHub Actions CI to guarantee that any future documentation edit never introduces a broken internal markdown link.
