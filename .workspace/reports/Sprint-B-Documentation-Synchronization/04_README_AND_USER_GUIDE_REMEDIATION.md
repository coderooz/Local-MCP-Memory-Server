# Sprint B — README and User Guide Remediation

**Campaign:** Campaign 10.3 — Sprint B: Documentation Synchronization & Gap Remediation  
**Document ID:** `04_README_AND_USER_GUIDE_REMEDIATION.md`  
**Date:** 2026-11-07  
**Author:** Google Antigravity (Advanced Agentic Coding)  
**Status:** COMPLETE & VERIFIED  

---

## 1. Executive Summary

`README.md` is the primary entry point for developers and operators. In Sprint B, `README.md` was overhauled to eliminate stale configuration claims, reflect all 8 supported agent adapters, correct port defaults, and direct readers to deep-dive technical documentation in `docs/`.

---

## 2. Identified Discrepancies and Corrective Actions

```
+------------------------------------+---------------------------------------+---------------------------------------+
| Item / Topic                       | Pre-Sprint B Text in `README.md`      | Remediated Text in `README.md`        |
+------------------------------------+---------------------------------------+---------------------------------------+
| Supported Agent Adapters           | Listed 6 agents (omitted Google       | Lists all 8 verified adapters:        |
|                                    | Antigravity and Roo Code)             | OpenCode, Codex, Claude, Antigravity, |
|                                    |                                       | Cursor, Windsurf, Cline, Roo Code.    |
| Default Port & `.env` Example      | `PORT=4000`                           | Dynamic allocation (`47000-47020`);   |
|                                    | `MCP_SERVER_URL=http://localhost:4000`| fallback / dev port `3799`.           |
| CLI Commands Table                 | Summarized without options or flags   | Summarizes commands with direct link  |
|                                    |                                       | to `docs/cli-reference.md`.           |
| Configuration Reference            | Brief `.env` snippet only             | Comprehensive guide linking to        |
|                                    |                                       | `docs/configuration.md`.              |
| MCP Integration Guide              | Brief list of tools                   | Links to `docs/mcp-integration.md`    |
|                                    |                                       | and developer extension SOPs.         |
| Security Reference                 | Mentioned JWT/API-key without details | Explicitly references updated         |
|                                    |                                       | `SECURITY.md` (AES-256-GCM + auth).   |
+------------------------------------+---------------------------------------+---------------------------------------+
```

---

## 3. Structural Improvements in Remediated `README.md`

1. **Quickstart Completeness:** Clear two-track setup: Option 1 (Global CLI with automated agent setup for 8 environments) and Option 2 (Local Development Setup).
2. **Accurate Networking:** Explains dynamic loopback port assignment (`47000-47020`), environment override (`PORT`), and runtime discovery via `.mcp-runtime.json`.
3. **Discoverability:** Table of Contents linking to dedicated documentation guides (`docs/cli-reference.md`, `docs/configuration.md`, `docs/mcp-integration.md`, `CONTRIBUTING.md`).
4. **Verification Transparency:** Explains how to run the verified 249-assertion test suite (`npm test`) and chaos validation (`npm run chaos:test`).
