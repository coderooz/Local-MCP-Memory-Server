# Report 04: Workspace Directory Governance

**Project:** local-mcp-memory  
**Version:** 2.6.0  
**Campaign:** Campaign 9 — Unified Agent Workspace Architecture & Governance  
**Date:** 2026-11-06  
**Auditor:** Google Antigravity  
**Status:** COMPLETE / VERIFIED  

---

## 1. Canonical Engineering Workspace Definition
The `.workspace/` directory is the authoritative repository for all engineering artifacts, specifications, historical indices, and campaign reports.

---

## 2. Directory Governance Matrix

| Subdirectory | Canonical Purpose | Permitted Authors | Retention Policy |
| :--- | :--- | :--- | :--- |
| `reports/` | Sole canonical storage for campaign reports, audits, and verification packages | Autonomous Agents & Engineers | Permanent (Immutable once finalized) |
| `resources/` | Deep technical documentation, conceptual articles, domain guides | Domain Experts & Engineers | Versioned with code releases |
| `decisions/` | Architecture Decision Records (ADRs) | Architects & Senior Engineers | Permanent |
| `specifications/` | Formal system specifications and protocol definitions | Lead Engineers & Protocol Authors | Versioned |
| `plans/` | Execution roadmaps and migration operational procedures | Planners & Campaign Leads | Active during milestone |
| `templates/` | Reusable engineering document templates | Engineering Team | Updated as needed |
| `archive/` | Deprecated, superseded, or historical drafts | Any (Move only) | Permanent historical archive |
| `PRI/` | Project Reference Index | Automated Trackers & Agents | Synchronized with project structure |
| `LFI/` | Logic Flow Index | Automated Trackers & Agents | Synchronized with application logic |

---

## 3. Placement & Write Rules
1. **No Ad-Hoc Report Folders:** Reports must never be saved to root `.reports/` or ad-hoc directories.
2. **Strict Relative Links:** All markdown links within `.workspace/` must resolve to real files verified by automated test suites.
3. **No Secrets / Credentials:** Automated pre-commit and governance tests scan `.workspace/` to ensure zero API keys or credentials are committed.
