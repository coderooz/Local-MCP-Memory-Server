---
title: Validation Principles
category: reliability
status: active
stability: durable
audience:
  - ai-agents
  - maintainers
last_reviewed: 2026-10-21
---

# Validation Principles

What "verified" means in this repository, and how chaos/protocol validation gates
releases. Claims here describe the validation _philosophy and wiring_ — exact counts and
CI job lists are volatile and intentionally omitted.

## What chaos validation is

Chaos harnesses stress the running system and produce a **PASS/FAIL release verdict** over
a fixed property set:

| Property                       | Question it answers                                                |
| ------------------------------ | ------------------------------------------------------------------ |
| **Protocol integrity**         | Does JSON-RPC stay well-formed under load and adverse conditions?  |
| **Tool discovery + execution** | Do tools enumerate and execute correctly while stressed?           |
| **Session isolation**          | Does any session observe or mutate another session's state?        |
| **Invalid rejection**          | Are malformed/hostile inputs refused at the promised rate?         |
| **Success-rate floors**        | Do legitimate operations stay above the minimum success threshold? |
| **Error behavior**             | Are failures structured and coded, never leaked or hung?           |

A release is only as good as its verdict: the gate is **PASS or FAIL, not "mostly fine."**

## Test layering

```text
syntax check          →  whole-tree parse gate (fast, first line of defense)
targeted suites       →  domain behavior (policy, integration, registry, db integrity, …)
full default gate     →  the suites wired into the default test command
standalone suites     →  e2e, chaos/resilience, stress — run deliberately, not implicitly
chaos gate            →  the PASS/FAIL release verdict (manual invocation)
```

Two rules follow:

1. **A suite that isn't wired into the default gate has not passed it.** Running a
   standalone suite manually verifies that suite — nothing more. (Observed as of last
   review: the default gate covers core suites; e2e/chaos/resilience/stress are
   standalone; some wiring gaps are acknowledged in the roadmap. This is a **dated
   observation**, not a permanent truth — re-verify before citing.)
2. **Never claim a check passed without observing the run.** The project's operating
   discipline: results are observations, not expectations. A remembered "114/114" from
   yesterday is not today's status — re-run before asserting.

## What verification means (evidence discipline)

| Level                   | Meaning                                                                       |
| ----------------------- | ----------------------------------------------------------------------------- |
| **Verified**            | A command was executed _in this context_ and its result observed and recorded |
| **Previously observed** | Historically green — not current until re-run                                 |
| **Unverified**          | Assumed, reasoned, or inherited from documentation                            |

Verification claims must name the command and the observed outcome; historical report
verdicts are append-only records of past runs, never present-tense truth. This applies
double to environmental failures: a failure caused by the environment (a foreign process
holding a port, an absent daemon) is **classified, not claimed green** — isolation and
re-run are how environment and regression are separated.

## Validation must not mutate behavior

Documentation or analysis work may run existing validation commands, but **must not modify
application behavior to make validation pass** — including "temporary" test-gate edits,
skips, or fixture changes. Validation observes the system; it does not negotiate with it.
(The converse applies too: adding validation for new behavior is part of shipping the
behavior — see [change-guidelines](../governance/change-guidelines.md).)

## Redaction discipline in test output

Adverse-condition tests exercise credential and secret paths; test output and assertions
must respect the same masking rules as production surfaces
([security-model](../security/security-model.md)) — a validator that prints secrets to
prove they're protected has failed its own standard.

## Invariants

- Release gating is binary (PASS/FAIL) against fixed property floors.
- A suite's result is claimed only from an observed run; suites are not conflated
  (standalone ≠ default gate).
- Validation never mutates application behavior to pass.
- Environmental failures are classified as environment, not silently green.

## Evidence

- `scripts/chaos-test.js` — the chaos gate, PASS/FAIL verdict, property floors
- `tests/mcp-chaos-resilience-test.js`, `tests/mcp-resilience-test.js` — standalone protocol validation
- `tests/mcp-architecture-audit-test.js` — protocol-conformance auditing
- `package.json` — default-gate suite wiring (re-verify; wiring is a dated fact)

**Status:** Confirmed (property set, gate semantics, discipline); current CI/default-gate
wiring details are **dated observations — re-verify**.
