# Report 02: Shared Agent Workspace Architecture

**Project:** local-mcp-memory  
**Version:** 2.6.0  
**Campaign:** Campaign 9 — Unified Agent Workspace Architecture & Governance  
**Date:** 2026-11-06  
**Auditor:** Google Antigravity  
**Status:** COMPLETE / VERIFIED  

---

## 1. Architectural Philosophy
The `.agent/` workspace decouples AI agent context, operational policies, and coordination from IDE-specific mechanisms. Regardless of whether an engineer uses Google Antigravity, OpenCode, Claude Code, Cursor, Windsurf, or Cline, the agent is directed to a single, authoritative, tool-agnostic context.

---

## 2. Directory Layout & Roles
```
.agent/
├── README.md                 # Agent workspace manifesto & sequential read-order
├── AGENTS.md                 # Universal invariants, pipeline, and tech stack rules
├── config/                   # Formal machine-readable policies and schemas
│   ├── agent-policy.json     # Strict module, package, and safety policies
│   ├── workspace-policy.json # Directory ownership & write permissions
│   └── capabilities.json     # 63 MCP tools & storage engine specifications
├── instructions/             # Granular domain instructions
│   ├── SYSTEM.md             # System prompt directives
│   ├── PROJECT_RULES.md      # Non-negotiable architectural rules
│   ├── WORKFLOW.md           # 5-phase execution lifecycle
│   ├── SECURITY.md           # Sandbox, SQL injection & path boundaries
│   ├── TESTING.md            # Testing suites & pass invariants
│   ├── DOCUMENTATION.md      # Documentation placement rules
│   └── RELEASE_POLICY.md     # SemVer and release criteria
├── context/                  # Authoritative context files
│   ├── PROJECT_OVERVIEW.md   # Core capabilities & system definition
│   ├── ARCHITECTURE.md       # Architecture diagrams & component overview
│   ├── CURRENT_STATE.md      # Live readiness status & milestones
│   ├── DECISIONS.md          # Architectural decisions summary
│   ├── ACTIVE_WORK.md        # Current campaigns & backlog
│   └── KNOWN_LIMITATIONS.md  # Concurrency & environment constraints
├── memory/                   # Session tracking & handoffs
│   ├── README.md             # Memory guidelines
│   ├── SESSION_LOG.md        # Real-time session activity log
│   └── HANDOFF.md            # Active agent handoff state
├── maps/                     # Structural & logic mappings
│   ├── PROJECT_MAP.md        # File & directory hierarchy
│   ├── LOGIC_MAP.md          # Request processing logic flow
│   ├── DEPENDENCY_MAP.md     # Production & test dependencies
│   └── DATA_FLOW_MAP.md      # Ingestion & storage data flow
├── adapters/                 # Agent-specific setup documentation
│   ├── README.md             # Adapter index
│   └── [agent]/README.md     # 8 dedicated agent guides
├── templates/                # Standardized operational templates
│   ├── TASK_HANDOFF.md       # Task transition template
│   ├── SESSION_SUMMARY.md    # Session summary template
│   ├── DECISION_RECORD.md    # ADR template
│   └── INCIDENT_REPORT.md    # Incident response template
└── schemas/                  # Formal JSON schemas
    ├── memory-entry.schema.json
    ├── agent-config.schema.json
    └── handoff.schema.json
```

---

## 3. Standardized Read Order
AI agents are instructed to ingest files in a deterministic sequence:
1. Root Bootstrap (`AGENTS.md`, `CLAUDE.md`, etc.)
2. Master Directives (`.agent/AGENTS.md`)
3. Domain Instructions (`.agent/instructions/SYSTEM.md`, `PROJECT_RULES.md`)
4. Current State & Active Work (`.agent/context/CURRENT_STATE.md`, `ACTIVE_WORK.md`)
5. Structural Understanding (`.agent/context/ARCHITECTURE.md`, `.agent/maps/PROJECT_MAP.md`)
6. Dedicated Adapter (`.agent/adapters/<agent>/README.md`)

---

## 4. Verification
All 38 assets within `.agent/` have been validated by automated test `tests/workspace-governance-test.mjs` with 100% assertion pass rate.
