# Report 07: PRI, LFI, and Engineering Knowledge Governance

**Project:** `local-mcp-memory`  
**Target Release:** `v2.6.1`  
**Date:** 2026-11-07  
**Auditor:** Google Antigravity  

---

## 1. Role and Authority of PRI and LFI

The `.workspace/` directory contains two primary architectural indices:
1. **Project Reference Index (`.workspace/PRI/PROJECT_REFERENCE_INDEX.md`):**
   - **Role:** Authoritative structural map of the physical codebase.
   - **Audience:** Lead engineers, code reviewers, and autonomous AI agents.
   - **Authority:** Highest authority on directory layouts, file locations, line counts, module exports, and dependency chains.
2. **Logic Flow Index (`.workspace/LFI/LOGIC_FLOW_INDEX.md`):**
   - **Role:** Authoritative behavioral and control-flow map of the runtime system.
   - **Audience:** Core developers, test engineers, and AI code generators.
   - **Authority:** Highest authority on request lifecycles, error paths, state transitions, and component interactions.

---

## 2. Audit of Existing PRI and LFI Assets

| File Path | Status | Verification Findings |
| :--- | :---: | :--- |
| `.workspace/PRI/PROJECT_REFERENCE_INDEX.md` | **ALIGNED** | Updated in Campaign 9 to reflect `.agent/` and `.workspace/` subdirectories. Line counts and modules match current source code. |
| `.workspace/LFI/LOGIC_FLOW_INDEX.md` | **ALIGNED** | Fully documents request routing, stdio framing, SQLite transaction boundaries, and Express 5 error middleware. |
| `.workspace/LFI/COMPONENT_INTERACTIONS.md` | **ALIGNED** | Documents service bridges between MCP tools and domain services. |
| `.workspace/LFI/DIAGRAMS.md` | **ALIGNED** | Contains Mermaid sequence and architecture diagrams. |
| `.workspace/LFI/ERROR_PATHS.md` | **ALIGNED** | Maps JSON-RPC error codes to HTTP status codes and domain errors. |
| `.workspace/LFI/FLOW_VISUALIZER.md` | **ALIGNED** | Textual overview of the visual flow viewer. |
| `.workspace/LFI/viewer/flow-viewer.html` | **ALIGNED** | Standalone visual HTML dashboard for browsing logic flows. |

---

## 3. Knowledge Governance & Maintenance Policy

To prevent documentation drift and preserve historical accuracy:

1. **Commit Policy:**
   All files in `.workspace/PRI/` and `.workspace/LFI/` **must be committed to Git**. They represent critical persistent engineering context required by human developers and AI agents alike.
2. **Historical Accuracy vs. Implementation Updates:**
   Historical records must **never be silently retroactively rewritten**. When architectural designs change (such as the migration from MongoDB to SQLite):
   - The current PRI/LFI document is updated with the new implementation facts.
   - An explicit Architecture Decision Record (ADR) is added to `.workspace/decisions/` explaining the rationale, superseding the legacy decision.
3. **Trigger for PRI/LFI Updates:**
   - Any commit adding, deleting, or renaming files in `src/`, `tools/`, `utils/`, or `core/` **must** include an update to `PROJECT_REFERENCE_INDEX.md`.
   - Any commit modifying public tool contracts, database schemas, or request middleware **must** include an update to `LOGIC_FLOW_INDEX.md`.
4. **Automated Discovery for AI Agents:**
   All AI agents are instructed via `.agent/AGENTS.md` and `.agent/instructions/WORKFLOW.md` to consult `.workspace/PRI/` and `.workspace/LFI/` during Phase 1 (Context Ingestion) and Phase 2 (Discovery & Impact Analysis).
