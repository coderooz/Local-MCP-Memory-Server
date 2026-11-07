# ADR-003: Dual Repository Isolation Model

## Status
Accepted

## Context
During the stabilization and verification of v2.6.0, an active, stable instance of v2.5.0 exists at `website/local-mcp-memory` providing active memory services to the developer's global AI tools.

## Decision
Maintain complete physical isolation between the development repository (`projects/local-mcp-memory`) and the stable repository (`website/local-mcp-memory`). No cross-directory file writes or configuration alterations are permitted without explicit sign-off.

## Consequences
- Guaranteed zero-downtime and zero-risk to active developer workflows during testing.
- Allows exhaustive chaos, isolation, and migration dry-run testing.
