# Report 08: Global npm Tooling & Diagnostic Environment

**Campaign:** Campaign 8 — Production Migration Integrity Reconciliation & Final Authorization  
**Package:** `local-mcp-memory`  
**Target Version:** `2.6.0`  
**Date:** 2026-11-06  
**Auditor / Agent:** Google Antigravity  

---

## 1. Executive Summary

In accordance with Phase I of the directive, the host's global npm environment was audited via `npm -g list --depth=0` to assess available developer tooling, diagnostic capabilities, and client integration environments.

The host environment is equipped with modern developer tools (including the official MCP Inspector, Mongo Shell, Opencode CLI, and Cline), with zero missing dependencies required for migration execution or verification. In strict compliance with safety rules, zero global npm packages were modified, installed, or upgraded.

---

## 2. Global npm Package Inventory

The following global packages are active on the host machine (`C:\Users\ranit\AppData\Roaming\npm`):

| Package Name | Installed Version | Capability & Support Role |
|---|---|---|
| `@modelcontextprotocol/inspector` | `2.13.0` | Official MCP Inspector GUI (`npm run inspect`) for protocol debugging |
| `mongosh` | `2.12.0` | MongoDB command line client for direct queries and verification |
| `@opencode/cli` | `2.0.24` | Opencode AI coding agent CLI |
| `opencode-windows-x64-baseline` | `1.18.33` | Native Opencode engine binary |
| `cline` | `3.0.66` | Autonomous coding agent client |
| `@google/gemini-cli` | `0.62.0` | Google Gemini CLI interface |
| `eslint` | `10.11.0` | JavaScript code quality linter |
| `prettier` | `3.9.9` | Code formatter |
| `vitest` | `5.0.2` | Fast modern test framework |
| `@vitest/coverage-v8` | `5.0.2` | V8 code coverage reporter |
| `typescript` | `7.0.2` | TypeScript compiler |
| `ts-node` | `10.9.2` | TypeScript Node runtime |
| `pnpm` | `12.8.1` | Fast package manager |
| `yarn` | `1.22.22` | Yarn classic package manager |
| `vercel` | `61.1.0` | Vercel deployment CLI |
| `firebase-tools` | `15.32.0` | Firebase deployment and management CLI |
| `ai` | `7.0.123` | Vercel AI SDK CLI |
| `clerk` | `3.4.0` | Clerk authentication CLI |

---

## 3. Diagnostic & Migration Support Capabilities

1. **Official MCP Inspector (`@modelcontextprotocol/inspector@2.13.0`):**
   - The development repository includes an `inspect` npm script:
     ```bash
     npm run inspect
     ```
   - Launches `npx @modelcontextprotocol/inspector node mcp-server.js`, enabling interactive UI inspection of all 63 registered MCP tools, prompt resources, and stdio streams.
2. **MongoDB Interactive Shell (`mongosh@2.12.0`):**
   - Provides native shell access for ad-hoc inspection:
     ```bash
     mongosh "mongodb://127.0.0.1:27017/mcp_memory"
     ```
3. **AI Client Registrations:**
   - Global configurations for `opencode` (`~/.config/opencode/opencode.json`) and `codex` (`~/.codex/config.toml`) are already supported by `src/core/setup/agent-configs.js`.

---

## 4. Stability & Isolation Discipline

- **No New Global Dependencies:** The local repository's dependencies (`better-sqlite3`, `commander`, `dotenv`, `express`, `jsonwebtoken`, `mongodb`, `playwright`, `uuid`) are fully self-contained in `projects/local-mcp-memory/node_modules`.
- **Zero Global Mutation:** No global package was touched, preserving host system stability.

---

## 5. Audit Verdict

**GLOBAL TOOLING: VERIFIED (READY & ADEQUATE)**  
Host global tooling provides comprehensive inspection capabilities without requiring modifications.
