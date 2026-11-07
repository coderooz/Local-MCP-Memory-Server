---
title: Heartbeat Model
category: agents
status: active
stability: durable
audience:
  - ai-agents
  - maintainers
last_reviewed: 2026-10-21
---

# Heartbeat Model

Presence in this system is **derived from liveness signals, not connections**. There is no
persistent socket per agent — an agent is "present" exactly as long as its last heartbeat
(or activity) is recent.

## What a heartbeat is

A heartbeat is a lightweight **liveness signal**: it updates the agent's `last_seen`
timestamp and is recorded in the activity stream (implicit audit). It proves only one
thing: _this agent was alive at this time._

## Presence derivation (lazy, age-based)

```text
age = now - last_seen

age < active threshold   → active
age < offline threshold  → idle
age >= offline threshold → offline / stale
```

Key properties (all Confirmed):

- **Derived, not stored**: status is recomputed on access from `last_seen` age; a stale
  stored status is meaningless.
- **Lazy**: there is no background sweeper marking agents offline; the next reader
  computes freshness. (Consistent with the system-wide no-background-jobs design.)
- **Thresholds are implementation-specific**: current values put `active` on the order of
  ~45s since last seen and `offline` at ~120s+; treat these as tunable constants, not
  contracts.
- **Activity also counts**: recent meaningful activity refreshes presence — an agent
  working steadily stays visible even between explicit heartbeats.

## Who refreshes presence

The **agent's host is responsible** for emitting heartbeats at a reasonable interval. The
system may advertise a suggested interval, but it is advisory — nothing in the server
auto-heartbeats on an agent's behalf. An agent that never heartbeats looks offline no
matter how healthy it is.

## Coordination effects of staleness

| Effect            | Behavior                                                                 |
| ----------------- | ------------------------------------------------------------------------ |
| Auto-assignment   | Offline agents are **excluded** from capability matching                 |
| Ownership signals | A stale owner's claims still exist but their locks expire by TTL         |
| Task visibility   | Tasks owned by offline agents stay visible — candidates for reassignment |
| Conflict warnings | Foreign-ownership warnings still fire regardless of owner presence       |

Staleness never silently releases anything: locks expire by their own TTL, tasks are never
auto-reassigned, memory is never decayed because its author went offline. Absence reduces
_eligibility_, it does not rewrite _state_.

## Anti-patterns

- Trusting a stored `status` field over derived presence.
- Heartbeating without doing work and expecting ownership signals to hold (locks still
  expire; ownership is advisory).
- Assuming heartbeats prove safety or identity — they are liveness pings on a local-first
  surface, not authentication.
- Building liveness-critical behavior on heartbeat cadence without tolerating the
  threshold jitter (a fast agent can idle past the active threshold and be misread as idle).

## Invariants

- Presence is derived from `last_seen` age at read time (lazy), never asserted by callers.
- Offline agents are excluded from new auto-assignments.
- Going stale never mutates or releases existing state (TTL and explicit transitions only).

## Evidence

- `utils/coordinationEngine.js` — heartbeat handling, lazy status derivation, threshold constants
- `utils/activityTracker.js` — heartbeat activity recording
- `tests/persistent-agent-registry-test.js` — presence behavior across restarts

**Status:** Confirmed (derivation, laziness, exclusion effects); threshold values are
**(implementation-specific)**.
