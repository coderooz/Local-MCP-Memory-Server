# Key Architectural Decisions (ADR Summary)

1. **ADR-001: Migration to SQLite (`better-sqlite3`):** Replaced MongoDB with zero-dependency, local SQLite for frictionless local developer installation while maintaining ACID transactions and sub-millisecond latency.
2. **ADR-002: Strict ESM Architecture:** Eliminated CommonJS to leverage native Node.js 20+ ECMAScript Modules throughout the codebase.
3. **ADR-003: Dual Repository Isolation Model:** Maintained separate development (`projects/local-mcp-memory`) and live stable (`website/local-mcp-memory`) working directories during v2.6.0 stabilization to ensure zero disruption to live agent sessions.
4. **ADR-004: Unified Agent Workspace (`.agent/`):** Decoupled agent configuration from specific IDEs/tools by introducing a central `.agent/` workspace paired with lightweight root bootstrap files.
5. **ADR-005: Zero-Loss Migration Fidelity:** Enforced preservation of all unmapped and legacy MongoDB fields into `metadata._migration.unmapped` to ensure 100% data fidelity.
