# Canonical Agent Workspace — local-mcp-memory

Welcome to the canonical AI agent workspace for **local-mcp-memory** (v2.6.0).

This workspace is tool-agnostic and provides a single source of truth for all AI coding agents working on or integrating with `local-mcp-memory`.

## Purpose
Different AI agents (Google Antigravity, OpenCode, Claude Code, OpenAI Codex, Cline, Cursor, Windsurf, Roo Code) utilize different root configuration files and default paths. To prevent documentation fragmentation, rule divergence, and context drift, all foundational agent rules, architectural maps, policies, and schemas are centrally maintained within this `.agent/` workspace.

## Read Order for AI Agents
When starting a session on this repository, all AI agents MUST read in the following sequence:
1. **Bootstrap File:** Root pointer (`AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `CODEX.md`, `OPENCODE.md`, or `.clinerules`).
2. **Master Instructions:** `.agent/AGENTS.md` (universal rules, invariants, roles, tech stack).
3. **Core Instructions:** `.agent/instructions/SYSTEM.md` and `.agent/instructions/PROJECT_RULES.md`.
4. **Current State & Context:** `.agent/context/CURRENT_STATE.md` and `.agent/context/ACTIVE_WORK.md`.
5. **Architectural Understanding:** `.agent/context/ARCHITECTURE.md` and `.agent/maps/PROJECT_MAP.md`.
6. **Agent-Specific Adapter:** `.agent/adapters/<your-agent>/README.md`.

## Directory Structure
```
.agent/
├── README.md                 # This overview
├── AGENTS.md                 # Master canonical rules & directives
├── config/                   # Policy and capability configurations
│   ├── agent-policy.json
│   ├── workspace-policy.json
│   └── capabilities.json
├── instructions/             # Granular domain instructions
│   ├── SYSTEM.md
│   ├── PROJECT_RULES.md
│   ├── WORKFLOW.md
│   ├── SECURITY.md
│   ├── TESTING.md
│   ├── DOCUMENTATION.md
│   └── RELEASE_POLICY.md
├── context/                  # Authoritative architectural context
│   ├── PROJECT_OVERVIEW.md
│   ├── ARCHITECTURE.md
│   ├── CURRENT_STATE.md
│   ├── DECISIONS.md
│   ├── ACTIVE_WORK.md
│   └── KNOWN_LIMITATIONS.md
├── memory/                   # Session memory and handoffs
│   ├── README.md
│   ├── SESSION_LOG.md
│   └── HANDOFF.md
├── maps/                     # Structural and logic maps
│   ├── PROJECT_MAP.md
│   ├── LOGIC_MAP.md
│   ├── DEPENDENCY_MAP.md
│   └── DATA_FLOW_MAP.md
├── adapters/                 # Agent-specific setup & bridges
│   ├── README.md
│   ├── antigravity/README.md
│   ├── opencode/README.md
│   ├── codex/README.md
│   ├── claude/README.md
│   ├── cline/README.md
│   ├── cursor/README.md
│   ├── windsurf/README.md
│   └── roo/README.md
├── templates/                # Standardized documentation templates
│   ├── TASK_HANDOFF.md
│   ├── SESSION_SUMMARY.md
│   ├── DECISION_RECORD.md
│   └── INCIDENT_REPORT.md
└── schemas/                  # Formal validation schemas
    ├── memory-entry.schema.json
    ├── agent-config.schema.json
    └── handoff.schema.json
```

## Governance & Write Restrictions
- Agents may append to `.agent/memory/SESSION_LOG.md` and update `.agent/memory/HANDOFF.md`.
- Core policies, rules, and architectures in `.agent/instructions/` and `.agent/context/` must only be modified as part of explicit architectural decisions approved by the user or project governance.
- Never write credentials, API keys, or raw personal data into the `.agent/` workspace.
