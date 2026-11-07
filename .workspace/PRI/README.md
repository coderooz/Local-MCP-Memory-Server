# Project Reference Index (PRI) — Governance & Maintenance

The **Project Reference Index (PRI)** serves as the authoritative, comprehensive registry of every directory, module, public entry point, database schema, configuration file, and dependency in `local-mcp-memory`.

The primary index file is:
**[`PROJECT_REFERENCE_INDEX.md`](PROJECT_REFERENCE_INDEX.md)**

---

## 1. Role and Authority of the PRI

1. **Topographical Authority:** The PRI defines what files belong in the project and their functional domains.
2. **Dependency Mapping:** It establishes inter-module relationships and external dependencies.
3. **Onboarding Resource:** It provides human contributors and autonomous AI agents with an instant mental model of repository structure without requiring full codebase re-indexing.

---

## 2. Maintenance and Update Triggers

The PRI is a living engineering asset. Contributors and AI agents **must update the PRI** whenever any of the following occur:
- **New Module or Directory:** A new file is added to `src/`, `core/`, `tools/`, or `bin/`.
- **File Deletion or Relocation:** An existing module is removed or moved.
- **New Entry Point:** A new CLI command, HTTP route, or MCP tool is registered.
- **Database Schema Evolution:** New tables, columns, indexes, or triggers are added to `src/core/database/sqlite/schema.js`.
- **Dependency Changes:** Packages are added, upgraded, or removed in `package.json`.
- **Configuration Evolution:** New environment variables or user configuration options are added.

---

## 3. PRI Validation

Prior to concluding an engineering campaign or submitting a Pull Request, verify that all file paths referenced in `PROJECT_REFERENCE_INDEX.md` physically exist on disk using the workspace governance test:
```bash
node tests/workspace-governance-test.mjs
```
