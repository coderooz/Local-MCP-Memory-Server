# Report 03: Unmapped Field & Data Fidelity Audit

**Campaign:** Campaign 8 — Production Migration Integrity Reconciliation & Final Authorization  
**Package:** `local-mcp-memory`  
**Target Version:** `2.6.0`  
**Date:** 2026-11-06  
**Auditor / Agent:** Google Antigravity  

---

## 1. Executive Summary

This audit evaluates the fate of unmapped source fields identified during the migration dry-run:
- `score` in `contexts`
- `importance`, `accessCount`, `lifecycle` in `memory_versions`
- `importance`, `accessCount`, `lifecycle` in auxiliary collections (`actions`, `tasks`, `messages`, `activity`, `project_map`, `metrics`)

Every field was audited against the source MongoDB data, the destination SQLite schema, and the application runtime code (`server.js`, `mcp-server.js`).

**Key Finding:** No data is discarded. Source fields that lack a dedicated column in a specific destination table are automatically preserved in the record's JSON metadata under `metadata._migration.unmapped`. Furthermore, in the primary `contexts` table, `importance`, `accessCount`, and `lifecycle` are mapped directly to first-class SQLite columns.

---

## 2. Field Audit & Application Consumption Analysis

### A. `contexts` Collection
| Field | Source Type | Frequency | Destination Handling | Application Usage in v2.6.0 |
|---|---|---:|---|---|
| `importance` | Number (1–5) | 2,618 / 2,618 | **Mapped to Column:** `contexts.importance INTEGER` | Used in memory ranking formula: `score += (item.importance \|\| 3) * 2` |
| `accessCount` | Number (>=0) | 2,618 / 2,618 | **Mapped to Column:** `contexts.accessCount INTEGER` | Used in frequency boost: `score += Math.log((item.accessCount \|\| 0) + 1)` |
| `lifecycle` | String (`active`, `archived`) | 2,618 / 2,618 | **Mapped to Column:** `contexts.lifecycle TEXT` | Used in lifecycle filters: `MEMORY_LIFECYCLE.ARCHIVED / DEPRECATED` |
| `score` | Double / Number | 18 / 2,618 | **Preserved in Metadata:** `metadata._migration.unmapped.score` | Ephemeral search ranking value appended during v2.5.0 queries; recomputed dynamically at runtime by `server.js` |

*Note: In the destination SQLite schema, `contexts` contains explicit columns for `importance`, `accessCount`, and `lifecycle`. The dry-run unmapped warning for `contexts` applied only to `score`.*

---

### B. `memory_versions` Collection
| Field | Source Type | Frequency | Destination Handling | Application Usage in v2.6.0 |
|---|---|---:|---|---|
| `importance` | Number (1–5) | 7,158 / 7,158 | **Preserved in Metadata:** `metadata._migration.unmapped.importance` | Canonical importance lives on parent `contexts` record |
| `accessCount` | Number (>=0) | 7,158 / 7,158 | **Preserved in Metadata:** `metadata._migration.unmapped.accessCount` | Canonical access count lives on parent `contexts` record |
| `lifecycle` | String | 7,158 / 7,158 | **Preserved in Metadata:** `metadata._migration.unmapped.lifecycle` | Canonical lifecycle lives on parent `contexts` record |

*Rationale:* In v2.5.0 MongoDB, `memory_versions` documents redundantly copied `importance`, `accessCount`, and `lifecycle` from their parent context. In v2.6.0 SQLite, `memory_versions` models version deltas (`context_id`, `version`, `snapshot`, `change_type`, `reason`), while the parent `contexts` record maintains canonical lifecycle and ranking state. Preserving these copies in `metadata._migration.unmapped` prevents data loss while maintaining clean relational normalization.

---

### C. Auxiliary Collections (`tasks`, `actions`, `messages`, `activity`, `project_map`, `metrics`)
| Field | Source Type | Affected Collections | Destination Handling | Application Usage in v2.6.0 |
|---|---|---|---|---|
| `importance` | Number | `tasks`, `actions`, `project_map` | **Preserved in Metadata:** `metadata._migration.unmapped.importance` | Not consumed by task/action engines |
| `accessCount` | Number | `tasks`, `actions`, `project_map` | **Preserved in Metadata:** `metadata._migration.unmapped.accessCount` | Not consumed by task/action engines |
| `lifecycle` | String | `tasks`, `actions`, `project_map` | **Preserved in Metadata:** `metadata._migration.unmapped.lifecycle` | Tasks use dedicated `status` column |

*Rationale:* Early MongoDB schemas in v2.5.0 used a base document template that attached `importance`, `accessCount`, and `lifecycle` to every entity. In SQLite, domain-specific tables maintain schema hygiene, while the migration engine preserves these legacy properties in `metadata._migration.unmapped`.

---

## 3. Formal Classification Decision

| Field & Collection Context | Formal Classification | Technical Justification |
|---|---|---|
| `contexts.importance` | **1. Mapped** | First-class column in SQLite; consumed by ranking algorithm. |
| `contexts.accessCount` | **1. Mapped** | First-class column in SQLite; incremented on search access. |
| `contexts.lifecycle` | **1. Mapped** | First-class column in SQLite; used in archive/deprecation filtering. |
| `contexts.score` | **2. Preserved** | Ephemeral search score; preserved in `metadata._migration.unmapped`. |
| `memory_versions.{importance, accessCount, lifecycle}` | **2. Preserved** | Denormalized version copies; preserved in `metadata._migration.unmapped`. |
| Auxiliary Collections `{importance, accessCount, lifecycle}` | **2. Preserved** | Legacy base-template fields; preserved in `metadata._migration.unmapped`. |

---

## 4. Data-Fidelity Test Evidence

The synthetic rehearsal suite ([`tests/campaign-8-rehearsal.mjs`](file:///C:/Code_Works/HTML_CSS_JS\workProjects\projects\local-mcp-memory\tests\campaign-8-rehearsal.mjs)) and unit test suite ([`tests/migration-test.js`](file:///C:/Code_Works/HTML_CSS_JS\workProjects\projects\local-mcp-memory\tests\migration-test.js)) verified:
1. `ctx1.importance === 5` (mapped column survived).
2. `ctx1.accessCount === 12` (mapped column survived).
3. `ctx1.lifecycle === 'active'` (mapped column survived).
4. `JSON.parse(ctx1.metadata)._migration.unmapped.score === 9.8` (unmapped field preserved in structured metadata).
5. Unicode characters (`🚀`), 50 KB payloads, and nested objects survived roundtrip without truncation.

---

## 5. Audit Verdict

**DATA FIDELITY AUDIT: PASSED (ZERO DATA LOSS)**  
All operational ranking and lifecycle fields are either explicitly mapped to dedicated SQLite columns or preserved in structured JSON metadata. No operational memory metadata is discarded.
