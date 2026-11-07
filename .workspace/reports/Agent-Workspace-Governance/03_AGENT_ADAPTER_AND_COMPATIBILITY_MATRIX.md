# Report 03: Agent Adapter and Compatibility Matrix

**Project:** local-mcp-memory  
**Version:** 2.6.0  
**Campaign:** Campaign 9 — Unified Agent Workspace Architecture & Governance  
**Date:** 2026-11-06  
**Auditor:** Google Antigravity  
**Status:** COMPLETE / VERIFIED  

---

## 1. Overview
`local-mcp-memory` v2.6.0 is designed to serve as the unified persistent memory layer for heterogeneous AI coding agents. This report documents the compatibility matrix, bootstrap files, configuration paths, and adapter integration across all 8 supported agent ecosystems.

---

## 2. Multi-Agent Compatibility Matrix

| Agent ID | Agent Platform | Root Bootstrap File | Configuration Path | Config Format | Adapter Guide | Adapter in Code (`src/core/setup/agent-configs.js`) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `antigravity` | Google Antigravity | `GEMINI.md`, `AGENTS.md` | `~/.gemini/antigravity/mcp_config.json` | JSON | `.agent/adapters/antigravity/README.md` | Supported |
| `opencode` | OpenCode | `OPENCODE.md`, `AGENTS.md` | `~/.config/opencode/opencode.json` | JSONC | `.agent/adapters/opencode/README.md` | Supported |
| `codex` | OpenAI Codex / CLI | `CODEX.md`, `AGENTS.md` | `~/.codex/config.toml` | TOML | `.agent/adapters/codex/README.md` | Supported |
| `claude` | Claude Code / Desktop | `CLAUDE.md`, `AGENTS.md` | `%APPDATA%/Claude/claude_desktop_config.json` | JSON | `.agent/adapters/claude/README.md` | Supported |
| `cline` | Cline (VS Code) | `.clinerules`, `AGENTS.md` | `%APPDATA%/Code/User/globalStorage/saoudrizwan.claude-dev/.../cline_mcp_settings.json` | JSON | `.agent/adapters/cline/README.md` | Supported |
| `cursor` | Cursor IDE | `AGENTS.md` | `~/.cursor/mcp.json` | JSON | `.agent/adapters/cursor/README.md` | Supported |
| `windsurf` | Windsurf (Codeium) | `AGENTS.md` | `~/.codeium/windsurf/mcp_config.json` | JSON | `.agent/adapters/windsurf/README.md` | Supported |
| `roo` | Roo Code (VS Code) | `.clinerules`, `AGENTS.md` | `%APPDATA%/Code/User/globalStorage/rooveterinaryinc.roo-cline/.../cline_mcp_settings.json` | JSON | `.agent/adapters/roo/README.md` | Supported |

---

## 3. Adapter Code Guarantees
Each adapter in `src/core/setup/agent-configs.js` enforces:
- **Idempotency:** Applying an adapter repeatedly produces zero changes if the configuration is already present and matching.
- **Non-Destructive Editing:** Comments, formatting, and unrelated tools in client configuration files are preserved intact.
- **Automatic Backups:** Creates a timestamped `.bak` file prior to writing changes, retaining up to 5 rolling backups.
- **Verification-Before-Return:** Reads the configuration back from disk to verify successful persistence before reporting success.

---

## 4. Isolation Guard
During development and testing, active Antigravity configuration remains pointed to stable v2.5.0 at `website/local-mcp-memory`. No automated script modifies this file during tests.
