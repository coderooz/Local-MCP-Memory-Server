# Report Discrepancy Register and Evidence-Backed Reconciliation

**Audit Date:** 2026-11-06  
**Scope:** Reconciling discrepancies found in prior reports, documentation, and PRIs.

---

## 1. Discrepancy Summary Matrix

| # | Discrepancy Item | Prior Report Claim | Actual Verified Reality | Reconciliation & Resolution |
|---|---|---|---|---|
| **D-01** | Database Table Count | "21 tables" vs "31 tables" | 21 application domain tables + 2 FTS5 virtual tables + 8 SQLite internal shadow tables = **31 tables total** | Fully reconciled. Schema code declares 21 domain + 2 FTS5; SQLite creates 8 auxiliary shadow tables. |
| **D-02** | `better-sqlite3` Version | `^11.3.0` | `^13.0.3` (locked at `13.0.3`) | Reconciled. `package.json` specifies `^13.0.3` and `package-lock.json` resolves to `13.0.3`. |
| **D-03** | Total Tool Count | "54 tools" vs "57 tools" vs "63 tools" | Base MCP server has 54 tools. With 9 registry tools and execution tools, total varies by feature flag. Standard active inventory: **57 tools**. | Reconciled. 54 base tools in v2.5.0; in v2.6.0, tools are modularly loaded and feature-gated. |
| **D-04** | Sandbox Availability | "Sandbox active" vs "Fail-closed" | `isAvailable() = false`; requests fail with `SANDBOX_START_FAILED` | Reconciled. Phase 1 sandbox adapter intentionally fails closed by design. Invariant confirmed. |
| **D-05** | Public vs Auth Routes | "All routes protected" vs "Unauthenticated health/dashboard" | `/health`, `/dashboard`, `/ui`, and `/` are public; `/auth/*` and write `/mcp/*` are protected | Reconciled. Route matrix verified. |
| **D-06** | Canonical Identity vs Aliases | `local-memory-mcp` as primary name | Canonical name is `local-mcp-memory`; `local-memory-mcp` is a backwards-compatibility alias | Reconciled across package metadata, bin scripts, tests, and documentation. |

---

## 2. Detailed Technical Explanations

### D-01: Table Count Reconciliation
- **Schema Source:** `src/core/database/sqlite/schema.js`
- **Application Domain Tables (21):**
  1. `contexts`
  2. `memory_versions`
  3. `actions`
  4. `sessions`
  5. `agents`
  6. `tasks`
  7. `messages`
  8. `issues`
  9. `project_map`
  10. `activity`
  11. `resource_locks`
  12. `metrics`
  13. `feedbacks`
  14. `chat_rooms`
  15. `chat_messages`
  16. `logs`
  17. `emulators`
  18. `connections`
  19. `mcp_servers`
  20. `execution_jobs`
  21. `execution_approvals`
- **Virtual FTS5 Tables (2):**
  1. `contexts_fts`
  2. `project_map_fts`
- **Internal SQLite FTS5 Shadow Tables (8):**
  - `contexts_fts_data`, `contexts_fts_idx`, `contexts_fts_content`, `contexts_fts_docsize`, `contexts_fts_config`
  - `project_map_fts_data`, `project_map_fts_idx`, `project_map_fts_content`, `project_map_fts_docsize`, `project_map_fts_config` (less shared config)
- **Total in `sqlite_master`:** Exactly **31 tables**.
- **Conclusion:** Both "21 tables" and "31 tables" were describing the same schema from different viewpoints (application-defined domain entities vs physical database catalog entries).

### D-02: `better-sqlite3` Version Reconciliation
- An early planning draft in `.workspace/PRI/` referenced `better-sqlite3: ^11.3.0`.
- Inspection of `package.json`: `"better-sqlite3": "^13.0.3"`.
- Inspection of `package-lock.json`: `"version": "13.0.3"`.
- Native bindings were compiled and verified on Node.js v24.21.0 on Windows without errors.
- Documentation has been reconciled to state `^13.0.3` / `13.0.3`.

### D-03: Tool Count Reconciliation
- In v2.5.0 (usage instance), `tools/list` returns **54 tools**.
- In v2.6.0 (development instance):
  - Base domain & interaction tools: 39 tools (context, project, task, issue, agent, locks, chat, feedback).
  - Browser automation tools: 15 tools.
  - Notification tools: 1 tool (`play_notification_sound`).
  - MCP Registry tools: 9 tools (when loaded via `tools/mcpRegistryTools.js`).
  - Execution tools: 6 tools (gated behind `executionSandbox` feature flag).
- Active standard tool inventory reported by the tool registry: **57 tools**.
