# Report 01: Production MongoDB Source Inventory

**Campaign:** Campaign 7 — Production Data Migration & Operational Memory Activation  
**Package:** `local-mcp-memory`  
**Target Version:** `2.6.0`  
**Source Database:** MongoDB `mongodb://127.0.0.1:27017/mcp_memory`  
**Inspection Date:** 2026-11-06  
**Auditor / Agent:** Google Antigravity  

---

## 1. Executive Summary

This report delivers the comprehensive, read-only census and structural audit of the production MongoDB database backing the stable `v2.5.0` instance. Every collection was inspected for document counts, storage utilization, primary identifier schemes, relational foreign references, project/agent partitioning, timestamp formats, and potential anomalies.

The source database is healthy, active, contains **29,827 total documents across 16 collections**, and exhibits zero duplicate domain identifiers. Strict read-only discipline was maintained throughout the inspection.

---

## 2. Complete Collection Census

| # | Collection Name | Document Count | Logical Size (KB) | Storage Size (KB) | Primary Identifier Field | Project Scoping | Agent Scoping |
|---|---|---:|---:|---:|---|---|---|
| 1 | `contexts` | 2,618 | 4,022.2 | 1,592.0 | `id` (UUID string) | 86 distinct projects | Yes |
| 2 | `memory_versions` | 7,158 | 12,753.9 | 2,472.0 | `id` (UUID string) | 30 distinct projects | Yes |
| 3 | `tasks` | 789 | 640.0 | 208.0 | `id` / `task_id` | 35 distinct projects | Yes |
| 4 | `activity` | 8,166 | 4,677.8 | 1,352.0 | `id` / `activity_id` | 67 distinct projects | Yes |
| 5 | `messages` | 276 | 134.9 | 68.0 | `id` / `message_id` | 19 distinct projects | Yes (`from_agent`, `to_agent`) |
| 6 | `project_map` | 275 | 352.5 | 184.0 | `id` / `map_id` | 8 distinct projects | Yes |
| 7 | `actions` | 151 | 91.9 | 64.0 | `id` (UUID string) | 10 distinct projects | Yes |
| 8 | `agents` | 208 | 108.6 | 52.0 | `id` / `agent_id` | 27 distinct projects | Yes |
| 9 | `chat_rooms` | 12 | 4.3 | 36.0 | `room_id` (UUID) | 2 distinct projects | Multi-participant |
| 10| `chat_messages` | 100 | 33.9 | 40.0 | `message_id` (UUID) | Inherited from room | Yes (`from_agent`) |
| 11| `feedbacks` | 57 | 28.1 | 40.0 | `feedback_id` (UUID) | 3 distinct projects | Yes |
| 12| `issues` | 28 | 33.8 | 64.0 | `id` / `issue_id` | 6 distinct projects | Yes |
| 13| `logs` | 4,913 | 1,668.3 | 524.0 | `id` (UUID string) | Global / context-bound | System |
| 14| `metrics` | 4,996 | 2,631.5 | 756.0 | `id` / `metric_id` | 66 distinct projects | Yes |
| 15| `resource_locks` | 32 | 14.8 | 36.0 | `id` / `lock_id` | 9 distinct projects | Yes (`locked_by`) |
| 16| `sessions` | 48 | 20.8 | 44.0 | `id` (UUID string) | 8 distinct projects | Yes |

**Total Production Records:** **29,827 documents** across 16 collections (~27.2 MB uncompressed BSON, ~7.5 MB on-disk wiredTiger storage).

---

## 3. Schema & Type Characteristics

1. **Identifier Shapes:**
   - Standard domain entities (`contexts`, `memory_versions`, `actions`, `tasks`, `sessions`, `activity`, `logs`, `metrics`, `messages`, `issues`, `project_map`) carry a top-level string `id` (typically RFC 4122 v4 UUID).
   - Specialized entities carry natural key columns:
     - `chat_rooms`: `room_id` (e.g. `9b67a3d3-25f2-49a2-88e9-cc6433e2f474`) alongside room `name`.
     - `chat_messages`: `message_id` with `room_id` pointing to the owning room name or UUID.
     - `feedbacks`: `feedback_id`.
   - BSON `_id` is an `ObjectId` across all collections and is converted to string during migration.

2. **Nested Objects and Arrays:**
   - Tags, metadata, dependencies, exports, relatedContexts, relatedTasks, relatedAgents, and voters exist as native BSON arrays and embedded subdocuments. These map to JSON-serialized TEXT columns in SQLite.
   - Large memory snapshots exist in `memory_versions.snapshot` (up to 50 KB per record) containing full context history.

3. **Timestamps:**
   - Stored predominantly as ISO 8601 strings or BSON Date objects (`createdAt`, `updatedAt`, `timestamp`, `recordedAt`, `changedAt`). Normalized to ISO 8601 strings by the migration engine.

---

## 4. Relational Integrity & Orphan Analysis

1. **Contexts <-> Memory Versions:**
   - **Zero Orphans:** All **7,158 memory_versions** possess valid `context_id` references that resolve to existing records in the `contexts` collection.
2. **Chat Rooms <-> Chat Messages:**
   - All 100 `chat_messages` reference `room_id: 'test-room'`.
   - The `chat_rooms` collection contains the matching room `{ name: 'test-room', room_id: '9b67a3d3-25f2-49a2-88e9-cc6433e2f474' }`.
   - The migration engine dynamically resolves room names to room UUIDs via `context.roomIds.set(row.name, id)`, achieving 100% relational foreign key resolution.
3. **Duplicate Identifier Check:**
   - Aggregation checks across every collection found **0 duplicate domain IDs**.

---

## 5. Source Immutability Evidence

All inspection operations were executed using read-only aggregation queries and cursor streaming. Zero write commands (`insertOne`, `updateMany`, `deleteMany`, `drop`) were issued. MongoDB record count remains identical before and after inspection.
