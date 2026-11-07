# SPEC-003: Multi-Agent Workspace and Configuration

## Overview
Defines the architectural separation between the agent workspace (`.agent/`), the engineering workspace (`.workspace/`), and the application root.

## Invariants
- `.agent/` contains agent instructions, policies, maps, schemas, and ephemeral session memory.
- `.workspace/` contains persistent project engineering artifacts, reports, ADRs, specs, and resources.
- Root contains clean source code and thin bootstrap pointers.
