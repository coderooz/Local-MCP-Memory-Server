---
title: Project Maps
category: projects
status: active
stability: durable
audience:
  - ai-agents
  - maintainers
last_reviewed: 2026-10-21
---

# Project Maps

Project maps capture **structural understanding of a codebase** — reusable knowledge about
how a project is laid out — distinct from both the raw source and from narrative memory.

## Purpose

Source code is executable truth about _what the code does now_; a project map is durable
knowledge about _how the project is organized and where things live_. It helps agents
navigate unfamiliar repositories without re-reading everything, and it survives as a
curated summary even as individual files churn.

## Conceptual entry shape

Each map entry (per project + path) records, conceptually:

| Field         | Meaning                                           |
| ------------- | ------------------------------------------------- |
| Path          | The file/directory the entry describes            |
| Kind          | File or directory                                 |
| Summary       | What this part of the codebase does               |
| Dependencies  | What it relies on                                 |
| Exports       | What it offers to the rest of the project         |
| Key details   | Structure, conventions, notable behaviors         |
| Relationships | How it connects to other entries                  |
| Last verified | When the entry was last confirmed against reality |

(Exact field names are implementation-specific; the _shape_ — path-keyed understanding
with verification timestamps — is the durable concept.)

## How they differ from memory and from code

|             | Raw source              | Project map                       | Narrative memory             |
| ----------- | ----------------------- | --------------------------------- | ---------------------------- |
| Answers     | What does this code do? | How is the project organized?     | What did we decide/learn?    |
| Lives       | The repository          | Path-keyed map entries            | Ranked, lifecycle'd memory   |
| Freshness   | Always current          | Explicitly verified (timestamped) | Decays by importance/recency |
| Granularity | Every line              | Structural units                  | Incidents/decisions          |

Maps and memory are complementary: maps orient; memory explains.

## Update and refresh semantics

- **Upsert by path**: writing a map entry for a path that already has one updates it —
  maps converge to current understanding rather than accumulating duplicates.
- **Verification is explicit**: entries carry a last-verified timestamp, refreshed when an
  agent confirms the entry against the code. An old timestamp means "possibly stale,"
  not "wrong."
- **Refresh on structural change**: when code changes materially reorganize a area, the
  affected entries should be updated in the same effort — maps that lag behind become
  misleading, and staleness is only discoverable by timestamp.
- Map writes follow the canonical write flow: collaboration-checked (warn on overlap),
  versioned, activity-tracked — see [data-flow](../architecture/data-flow.md).

## What maps deliberately are not

- **Not a code index or AST** — they store understanding, not exhaustive enumeration.
- **Not generated documentation** — they are curated by actors and carry verification
  state precisely because they are not mechanically derived.
- **Not a substitute for reading code** — a map entry is a starting point; the code is
  the truth when they disagree.

## Invariants

- One entry per (project, path) — upsert, never duplicated.
- Entries are project-scoped and carry verification timestamps.
- Map writes pass through collaboration/versioning semantics like other memory writes.

## Evidence

- `src/domains/project/project.service.js` — map entry model, upsert, verification timestamps
- `core/mcp/models.js` — map entry fields
- Project memory map tool definitions — create/fetch/upsert flows

**Status:** Confirmed (path-keyed upsert model, verification timestamps, write flow);
exact field vocabulary is **implementation-specific**.
