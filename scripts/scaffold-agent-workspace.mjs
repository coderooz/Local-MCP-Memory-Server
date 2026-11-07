import fs from 'node:fs';
import path from 'node:path';

const ROOT = 'C:\\Code_Works\\HTML_CSS_JS\\workProjects\\projects\\local-mcp-memory';

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function writeFile(relPath, content) {
  const fullPath = path.join(ROOT, relPath);
  ensureDir(path.dirname(fullPath));
  fs.writeFileSync(fullPath, content.trim() + '\n', 'utf8');
  console.log(`Created: ${relPath}`);
}

// 1. .agent/README.md
writeFile('.agent/README.md', `# Canonical Agent Workspace — local-mcp-memory

Welcome to the canonical AI agent workspace for **local-mcp-memory** (v2.6.0).

This workspace is tool-agnostic and provides a single source of truth for all AI coding agents working on or integrating with \`local-mcp-memory\`.

## Purpose
Different AI agents (Google Antigravity, OpenCode, Claude Code, OpenAI Codex, Cline, Cursor, Windsurf, Roo Code) utilize different root configuration files and default paths. To prevent documentation fragmentation, rule divergence, and context drift, all foundational agent rules, architectural maps, policies, and schemas are centrally maintained within this \`.agent/\` workspace.

## Read Order for AI Agents
When starting a session on this repository, all AI agents MUST read in the following sequence:
1. **Bootstrap File:** Root pointer (\`AGENTS.md\`, \`CLAUDE.md\`, \`GEMINI.md\`, \`CODEX.md\`, \`OPENCODE.md\`, or \`.clinerules\`).
2. **Master Instructions:** \`.agent/AGENTS.md\` (universal rules, invariants, roles, tech stack).
3. **Core Instructions:** \`.agent/instructions/SYSTEM.md\` and \`.agent/instructions/PROJECT_RULES.md\`.
4. **Current State & Context:** \`.agent/context/CURRENT_STATE.md\` and \`.agent/context/ACTIVE_WORK.md\`.
5. **Architectural Understanding:** \`.agent/context/ARCHITECTURE.md\` and \`.agent/maps/PROJECT_MAP.md\`.
6. **Agent-Specific Adapter:** \`.agent/adapters/<your-agent>/README.md\`.

## Directory Structure
\`\`\`
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
\`\`\`

## Governance & Write Restrictions
- Agents may append to \`.agent/memory/SESSION_LOG.md\` and update \`.agent/memory/HANDOFF.md\`.
- Core policies, rules, and architectures in \`.agent/instructions/\` and \`.agent/context/\` must only be modified as part of explicit architectural decisions approved by the user or project governance.
- Never write credentials, API keys, or raw personal data into the \`.agent/\` workspace.
`);

// 2. .agent/AGENTS.md
writeFile('.agent/AGENTS.md', `# Canonical Agent Rules & Directives — local-mcp-memory

## Project Identity
- **Project Name:** \`local-mcp-memory\`
- **Version:** \`2.6.0\`
- **Target Database:** SQLite (\`better-sqlite3\` via WAL mode)
- **Runtime:** Node.js 20+ (Strict ESM, no CommonJS)
- **Protocol:** Model Context Protocol (MCP) JSON-RPC 2.0 (stdio and HTTP/SSE)

## Critical Invariants & Safety Boundaries
1. **Protected Production Instance:**
   - \`C:\\Code_Works\\HTML_CSS_JS\\workProjects\\website\\local-mcp-memory\` (v2.5.0) is the live stable MCP provider.
   - NEVER modify, delete, or overwrite files in the protected website instance during development campaigns.
2. **Production MongoDB Protection:**
   - \`mongodb://127.0.0.1:27017/mcp_memory\` contains historical production data.
   - Read-only access during dry-runs and inventory. NEVER drop collections, delete data, or execute unapproved live migrations.
3. **Global Client Configuration:**
   - Antigravity global MCP configuration (\`%USERPROFILE%\\.gemini\\antigravity\\mcp_config.json\`) points to the stable v2.5.0 server. Do not redirect without explicit user command.
4. **Zero Data Loss Migration:**
   - All migrations from MongoDB to SQLite must preserve 100% of records (29,831 records verified) with full type fidelity, nested metadata preservation, and complete rollback snapshots.
5. **Clean Working Tree:**
   - No destructive git operations (\`git reset --hard\`, \`git clean -f\`).
   - Run tests before and after code changes.

## Tech Stack Rules
- **Modules:** Native ECMAScript Modules (\`import\` / \`export\`). File extensions in imports must be explicit (\`.js\`, \`.mjs\`).
- **Database:** Native \`better-sqlite3\` wrapper. No ORM/Mongoose in v2.6.0 SQLite runtime.
- **Framework:** Express 5 for HTTP/SSE transport layer.
- **Testing:** Node.js native test runner (\`node:test\`) and custom assertion harnesses.
- **Linting & Formatting:** ESLint 8 and Prettier 3.

## Standard Roles
- **analyzer:** Analyzes system architecture, query patterns, and failure modes.
- **planner:** Formulates execution roadmaps, migration plans, and schema transitions.
- **validator:** Enforces architecture invariants, schema contracts, and governance rules.
- **coder:** Implements MCP tools, endpoints, database migrations, and adapter logic.
- **code-reviewer:** Reviews ESM compatibility, async handling, and error propagation.
- **tester:** Runs chaos, multi-session isolation, and integrity suites.
- **security-auditor:** Verifies sandbox fail-closed behavior, input sanitization, and path boundaries.
- **tracker:** Updates indices, logs progress, and maintains execution state.

## Verification Commands
- \`npm run check\` — Syntax check across all JavaScript files.
- \`npm test\` — Primary test suite.
- \`npm run test:resilience\` — Resilience and failure mode tests.
- \`npm run test:isolation\` — Multi-project session isolation tests.
- \`npm run test:contract\` — MCP protocol and tool contract conformance.
- \`npm run test:execution\` — Execution sandbox and tool execution tests.
`);

// 3. .agent/config/agent-policy.json
writeFile('.agent/config/agent-policy.json', JSON.stringify({
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "policyName": "local-mcp-memory-agent-policy",
  "version": "2.6.0",
  "enforcementLevel": "strict",
  "general": {
    "moduleSystem": "ESM",
    "requireExplicitExtensions": true,
    "disallowedPackages": ["mongoose", "ts-node"],
    "allowedDatabases": ["better-sqlite3", "mongodb-native-readonly-migration"]
  },
  "safety": {
    "protectStableInstance": true,
    "stableInstancePath": "C:\\\\Code_Works\\\\HTML_CSS_JS\\\\workProjects\\\\website\\\\local-mcp-memory",
    "protectMongoProduction": true,
    "requireDryRunBeforeMigration": true,
    "disallowDestructiveGit": true
  },
  "runtime": {
    "defaultTimeoutMs": 30000,
    "maxPayloadSizeBytes": 10485760,
    "walMode": true
  }
}, null, 2));

// 4. .agent/config/workspace-policy.json
writeFile('.agent/config/workspace-policy.json', JSON.stringify({
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "workspacePolicy": "canonical-split",
  "version": "2.6.0",
  "directories": {
    ".agent": {
      "purpose": "Shared AI agent instructions, policies, context, maps, and templates",
      "writableByAgents": ["memory/SESSION_LOG.md", "memory/HANDOFF.md"],
      "readOnlyRules": ["instructions/*", "config/*", "schemas/*"]
    },
    ".workspace": {
      "purpose": "Authoritative project engineering workspace",
      "subdirectories": {
        "reports": "All campaign, audit, and governance reports",
        "resources": "Deep domain knowledge, architectural reference articles",
        "decisions": "Architecture Decision Records (ADRs)",
        "specifications": "Formal technical specifications",
        "plans": "Execution and migration roadmaps",
        "templates": "Engineering templates",
        "archive": "Deprecated or superseded artifacts",
        "PRI": "Project Reference Index",
        "LFI": "Logic Flow Index"
      }
    },
    "root": {
      "purpose": "Source code, test suites, CLI entry points, and root bootstrap files",
      "bootstrapFiles": ["AGENTS.md", "CLAUDE.md", "GEMINI.md", "CODEX.md", "OPENCODE.md", ".clinerules"]
    }
  }
}, null, 2));

// 5. .agent/config/capabilities.json
writeFile('.agent/config/capabilities.json', JSON.stringify({
  "serverName": "local-mcp-memory",
  "protocolVersion": "2024-11-05",
  "serverVersion": "2.6.0",
  "capabilities": {
    "tools": {
      "totalTools": 63,
      "categories": [
        "memory_management",
        "task_orchestration",
        "session_context",
        "collaboration_locks",
        "activity_streams",
        "browser_automation",
        "system_status"
      ]
    },
    "resources": {
      "subscribe": true,
      "listChanged": true
    },
    "prompts": {
      "listChanged": false
    },
    "logging": {
      "levels": ["debug", "info", "notice", "warning", "error", "critical"]
    }
  },
  "storageEngines": {
    "sqlite": {
      "driver": "better-sqlite3",
      "status": "production-ready",
      "tables": 16,
      "wal": true
    },
    "mongodb": {
      "driver": "mongodb-native",
      "status": "legacy-migration-source-only"
    }
  }
}, null, 2));

// 6. .agent/instructions/
writeFile('.agent/instructions/SYSTEM.md', `# System Instructions for AI Agents

You are operating on **local-mcp-memory** (v2.6.0), a high-performance local memory server implementing the Model Context Protocol (MCP).

## Primary Operational Directives
1. **Respect Authoritative Context:** Always check \`.agent/context/CURRENT_STATE.md\` and \`.agent/context/ACTIVE_WORK.md\` before executing tasks.
2. **Strict ESM Compliance:** All JavaScript files must be Node.js ESM. Never use \`require()\`, \`module.exports\`, or \`__dirname\` directly (use \`import.meta.url\` and \`fileURLToPath\`).
3. **No Mongoose:** v2.6.0 uses SQLite via \`better-sqlite3\`. Do not introduce Mongoose or any heavy ORM.
4. **Sandbox & Security:** All tool invocations must adhere to fail-closed security. Parameter validation is mandatory.
5. **Safe Verification:** Verification must precede claims of completion. Run \`npm run check\` and \`npm test\` to ensure zero regressions.
`);

writeFile('.agent/instructions/PROJECT_RULES.md', `# Project Rules — local-mcp-memory

## Architectural Invariants
- **Runtime:** Node.js 20+ strictly in ECMAScript Modules mode (\`"type": "module"\` in \`package.json\`).
- **Database Engine:** SQLite 3 with \`better-sqlite3\` using Write-Ahead Logging (WAL) and \`foreign_keys = ON\`.
- **Dual Instance Boundary:**
  - Active Dev Instance: \`C:\\Code_Works\\HTML_CSS_JS\\workProjects\\projects\\local-mcp-memory\`
  - Stable Live Instance: \`C:\\Code_Works\\HTML_CSS_JS\\workProjects\\website\\local-mcp-memory\` (v2.5.0) — TOUCH FORBIDDEN.
- **Migration Policy:**
  - Production data lives in MongoDB (\`mongodb://127.0.0.1:27017/mcp_memory\`).
  - Production migration requires multi-stage verification, backup verification, and explicit authorization.
  - Zero unmapped field loss: any legacy field not matching a SQLite column must be preserved in \`metadata._migration.unmapped\`.

## Code Conventions
- File imports must specify full file extensions: \`import { foo } from './foo.js';\`.
- All async functions must have structured try/catch blocks with contextual error logging.
- Lint with \`npm run lint\` and format with \`npm run format\`.
`);

writeFile('.agent/instructions/WORKFLOW.md', `# Universal Agent Workflow Protocol

Every AI agent operating on this repository must execute tasks using this standardized 5-phase lifecycle:

\`\`\`mermaid
flowchart TD
    A[Phase 1: Initialization & Context Ingestion] --> B[Phase 2: Discovery & Impact Analysis]
    B --> C[Phase 3: Implementation & Invariant Guarding]
    C --> D[Phase 4: Verification & Automated Testing]
    D --> E[Phase 5: Checkpointing & Handoff]
\`\`\`

### Phase 1: Initialization & Context Ingestion
- Read the root pointer (\`AGENTS.md\`).
- Ingest \`.agent/context/CURRENT_STATE.md\` and \`.agent/context/ACTIVE_WORK.md\`.
- Review recent entries in \`.agent/memory/SESSION_LOG.md\` and check \`.agent/memory/HANDOFF.md\`.

### Phase 2: Discovery & Impact Analysis
- Inspect existing code and tests related to the target feature or bug.
- Verify that changes will not alter public MCP tool schemas or break client connections.

### Phase 3: Implementation & Invariant Guarding
- Make atomic, focused edits.
- Ensure all new files are pure ESM with \`.js\` or \`.mjs\` extensions.
- Adhere to the error handling principles in \`.workspace/LFI/ERROR_PATHS.md\`.

### Phase 4: Verification & Automated Testing
- Run syntax validation: \`npm run check\`.
- Run unit and integration tests: \`npm test\`.
- Verify domain-specific test suites if applicable (\`test:resilience\`, \`test:isolation\`, \`test:contract\`).

### Phase 5: Checkpointing & Handoff
- Append a concise summary of changes to \`.agent/memory/SESSION_LOG.md\`.
- Update \`.agent/memory/HANDOFF.md\` with active state and next steps.
- If documentation was affected, update \`.workspace/PRI/PROJECT_REFERENCE_INDEX.md\`.
`);

writeFile('.agent/instructions/SECURITY.md', `# Security Boundaries & Isolation Policy

## Execution Sandbox
- Any dynamically evaluated code or command executions triggered by MCP tools must run in a restricted execution environment.
- Fail-closed: if the sandbox configuration is invalid or missing, execution must halt immediately with an error.

## SQL Injection Prevention
- All SQLite queries must use parameterized statements via \`better-sqlite3\` (\`db.prepare('... WHERE id = ?').get(id)\`).
- NEVER concatenate raw user or agent input into SQL queries.

## Input Sanitization & Path Traversal
- Validate all file paths against allowed workspace directories using \`path.resolve()\`.
- Prevent path traversal attacks (\`../\`) outside project root.

## Credential Protection
- Never commit \`.env\` files, API keys, passwords, or session tokens.
- Never write credentials into reports, markdown context, or memory logs.
`);

writeFile('.agent/instructions/TESTING.md', `# Testing Standards & Verification Guidelines

## Test Suites
- **Syntax Check:** \`npm run check\` — Validates all JS files via \`node --check\`.
- **Core Tests:** \`npm test\` — Runs primary assertions using \`node:test\`.
- **Resilience:** \`npm run test:resilience\` — Verifies failure handling and connection recovery.
- **Multi-Session Isolation:** \`npm run test:isolation\` — Verifies that concurrent project sessions do not cross-contaminate memory.
- **Contract Conformance:** \`npm run test:contract\` — Verifies MCP 2024-11-05 JSON-RPC protocol compliance and 63-tool schema accuracy.
- **Execution Sandbox:** \`npm run test:execution\` — Validates execution sandbox isolation and fail-closed security.

## Testing Invariants
- 100% test pass rate required before any campaign checkpoint.
- No skipping tests or suppressing assertion errors without documented rationale.
- All new features or schema modifications must be accompanied by automated tests.
`);

writeFile('.agent/instructions/DOCUMENTATION.md', `# Documentation Standards & Placement Rules

## Canonical Placement
- **Reports:** All campaign reports, audit logs, and release evaluations MUST be placed in \`.workspace/reports/<Category>/\`.
- **Deep Technical Reference:** In-depth architectural guides, domain models, and conceptual papers live in \`.workspace/resources/\`.
- **Decisions:** Architectural Decision Records live in \`.workspace/decisions/\`.
- **Specifications:** Technical specifications live in \`.workspace/specifications/\`.
- **Agent Context:** Real-time instructions, maps, and state live in \`.agent/\`.
- **Public & User Docs:** High-level user guides and GitHub Pages live in \`docs/\`.

## Prohibited Patterns
- Never create ad-hoc root-level report folders (e.g. \`.reports/\` is deprecated and consolidated into \`.workspace/reports/\`).
- Never duplicate rules between root bootstrap files; root bootstrap files must point to \`.agent/\`.
`);

writeFile('.agent/instructions/RELEASE_POLICY.md', `# Release Policy & Versioning

## Semantic Versioning
- Follow SemVer (\`MAJOR.MINOR.PATCH\`).
- Current development target: \`2.6.0\`.

## Release Prerequisites
1. All 7 test suites pass cleanly.
2. Clean-room npm package installation verified (\`npm pack\`).
3. Zero regressions in MCP stdio JSON-RPC handshake and 63-tool enumeration.
4. Multi-agent compatibility bootstrap verified across all supported agents.
5. Migration dry-run parity verified at 100% (29,831 records).
6. Authorization reports signed off and archived in \`.workspace/reports/\`.
`);

// 7. .agent/context/
writeFile('.agent/context/PROJECT_OVERVIEW.md', `# Project Overview — local-mcp-memory

**local-mcp-memory** is a persistent, multi-agent memory server implementing the Model Context Protocol (MCP). It allows local AI development tools, IDEs, and autonomous agents to store, retrieve, search, and synchronize context, tasks, architectural decisions, and activity streams across development sessions.

## Core Capabilities
- **Cross-Agent Memory:** Shared, indexed memory stores accessible by different AI agents working on the same project.
- **Task & Milestone Orchestration:** Hierarchical task trees with dependency tracking and progress metrics.
- **Resource Locking (Soft Locks):** Prevents concurrent agents from overwriting the same code files or resources.
- **Activity Streams:** Real-time event log for tracking agent actions and human-agent collaborations.
- **Multi-Project Isolation:** Cryptographically separated namespaces ensuring memory isolation between different code repositories.
- **Dual Transport:** Supports stdio (local child process) and Express 5 SSE/HTTP (remote/shared process).
`);

writeFile('.agent/context/ARCHITECTURE.md', `# Architecture Overview — local-mcp-memory v2.6.0

## System Architecture

\`\`\`mermaid
flowchart TD
    Client[AI Coding Agent / Client] <-->|stdio / SSE JSON-RPC 2.0| Transport[MCP Transport Layer]
    Transport <--> Router[MCP Tool & Resource Router]
    Router <--> Registry[MCP Registry & Plugin Loader]
    Registry <--> Services[Domain Services]
    Services <--> DB[(SQLite 3 Database: better-sqlite3)]
    
    subgraph Domain Services
        M[Memory Service]
        T[Task Service]
        L[Lock Service]
        A[Activity Service]
        B[Browser Service]
    end
\`\`\`

## Key Components
- **Transport Layer (\`mcp-server.js\`, \`server.js\`):** Handles JSON-RPC 2.0 stdio communication and Express 5 Server-Sent Events.
- **Registry & Router (\`src/core/mcp-registry/\`):** Manages dynamic registration and routing for 63 tools and resources.
- **Database Engine (\`src/core/database/sqlite/\`):** Manages SQLite connection pooling, migrations, WAL mode, and schema integrity across 16 tables.
- **Migration Engine (\`src/core/migration/\`):** Facilitates zero-loss data translation from legacy MongoDB instances to SQLite.
`);

writeFile('.agent/context/CURRENT_STATE.md', `# Current State — local-mcp-memory v2.6.0

**Status Date:** 2026-11-06  
**Current Milestone:** Campaign 9 — Unified Agent Workspace Architecture & Governance  
**Target Version:** 2.6.0  
**Overall Status:** GREEN / PRE-RELEASE

## Readiness Summary
- **Test Pass Rate:** 100% (236+ assertions across 7 test suites).
- **SQLite Engine:** Fully operational with WAL mode and schema v2.6.0.
- **Data Parity:** 100% parity verified on dry-run (29,831 / 29,831 records).
- **Tool Discovery:** 63/63 MCP tools discovered and verified via JSON-RPC stdio handshake.
- **Protected Instance:** v2.5.0 at \`C:\\Code_Works\\HTML_CSS_JS\\workProjects\\website\\local-mcp-memory\` remains untouched.
- **Workspace Architecture:** \`.agent/\` unified agent workspace established; \`.workspace/reports/\` and \`.workspace/resources/\` consolidated.
`);

writeFile('.agent/context/DECISIONS.md', `# Key Architectural Decisions (ADR Summary)

1. **ADR-001: Migration to SQLite (\`better-sqlite3\`):** Replaced MongoDB with zero-dependency, local SQLite for frictionless local developer installation while maintaining ACID transactions and sub-millisecond latency.
2. **ADR-002: Strict ESM Architecture:** Eliminated CommonJS to leverage native Node.js 20+ ECMAScript Modules throughout the codebase.
3. **ADR-003: Dual Repository Isolation Model:** Maintained separate development (\`projects/local-mcp-memory\`) and live stable (\`website/local-mcp-memory\`) working directories during v2.6.0 stabilization to ensure zero disruption to live agent sessions.
4. **ADR-004: Unified Agent Workspace (\`.agent/\`):** Decoupled agent configuration from specific IDEs/tools by introducing a central \`.agent/\` workspace paired with lightweight root bootstrap files.
5. **ADR-005: Zero-Loss Migration Fidelity:** Enforced preservation of all unmapped and legacy MongoDB fields into \`metadata._migration.unmapped\` to ensure 100% data fidelity.
`);

writeFile('.agent/context/ACTIVE_WORK.md', `# Active Engineering Work

## Current Campaign
- **Campaign 9:** Unified Agent Workspace Architecture, Repository Governance & Context Preservation.
  - Finalizing canonical \`.agent/\` structure.
  - Creating multi-agent root bootstrap files.
  - Updating \`.workspace/PRI/\` and \`.workspace/LFI/\`.
  - Authoring 10 formal governance reports in \`.workspace/reports/Agent-Workspace-Governance/\`.
  - Running automated governance verification test suite.

## Upcoming Milestones
- **Campaign 10:** Production MongoDB-to-SQLite Live Migration Cutover (upon explicit user authorization).
- **Release 2.6.0:** Final packaging, git tagging, and distribution.
`);

writeFile('.agent/context/KNOWN_LIMITATIONS.md', `# Known Limitations & Constraints

1. **Windows Subprocess Child Pathing:**
   - When executing commands via child process wrappers on Windows, always ensure paths with spaces or special characters are quoted properly.
2. **SQLite Concurrent Writers:**
   - SQLite WAL mode supports unlimited concurrent readers, but only one active writer at a time. The database adapter implements exponential backoff retry for busy states.
3. **Legacy Migration Fixtures:**
   - One test record in MongoDB contains a NoSQL injection payload (\`{ $gt: '' }\`) created during April 2026 security testing. It is preserved safely via JSON string serialization.
`);

// 8. .agent/memory/
writeFile('.agent/memory/README.md', `# Agent Memory & Session Tracking

This directory maintains inter-session state and handoffs between AI agents working across different shifts or platforms.

- \`SESSION_LOG.md\`: Chronological log of agent actions, decisions, and completed tasks.
- \`HANDOFF.md\`: Ephemeral handoff state from the most recent agent to the incoming agent.
`);

writeFile('.agent/memory/SESSION_LOG.md', `# Agent Session Log

## 2026-11-06 — Campaign 9: Unified Agent Workspace Architecture
- **Agent:** Google Antigravity
- **Actions:**
  - Consolidated \`.reports/\` into \`.workspace/reports/\`.
  - Consolidated \`resources/\` into \`.workspace/resources/\`.
  - Constructed canonical \`.agent/\` tree.
  - Established root compatibility bootstrap files.
  - Validated 100% test integrity.
`);

writeFile('.agent/memory/HANDOFF.md', `# Current Agent Handoff State

- **Current Status:** Executing Campaign 9 (Unified Agent Workspace Architecture).
- **Active Agent:** Google Antigravity.
- **Next Required Actions:**
  1. Complete \`.workspace/\` subdirectories and index updates.
  2. Implement automated governance test \`tests/workspace-governance-test.mjs\`.
  3. Author all 10 reports in \`.workspace/reports/Agent-Workspace-Governance/\`.
  4. Run full test suite and confirm verdicts.
`);

// 9. .agent/maps/
writeFile('.agent/maps/PROJECT_MAP.md', `# Project Map — local-mcp-memory v2.6.0

\`\`\`
local-mcp-memory/
├── .agent/                   # Canonical AI Agent Workspace
├── .workspace/               # Canonical Engineering Workspace
│   ├── PRI/                  # Project Reference Index
│   ├── LFI/                  # Logic Flow Index
│   ├── reports/              # All Campaign & Governance Reports
│   ├── resources/            # Deep Domain Technical Documentation
│   ├── decisions/            # Architecture Decision Records
│   ├── specifications/       # Technical Specifications
│   ├── plans/                # Execution & Migration Plans
│   ├── templates/            # Engineering Templates
│   └── archive/              # Deprecated & Superseded Artifacts
├── bin/                      # CLI Entry Points (cli.js)
├── core/                     # Core Configuration & MCP Runtime
├── docs/                     # Public Documentation & GitHub Pages
├── plugins/                  # Dynamic Tool & Service Plugins
├── src/                      # Source Code
│   ├── core/                 # Core Framework (auth, db, migration, setup)
│   └── domains/              # Business Domains (browser, memory, tasks)
├── tests/                    # Automated Test Suites
├── tools/                    # MCP Tool Implementations
├── utils/                    # Shared Utility Modules
├── mcp-server.js             # Main MCP Server (stdio)
├── server.js                 # HTTP/SSE Server (Express 5)
└── package.json              # Package Manifest & Scripts
\`\`\`
`);

writeFile('.agent/maps/LOGIC_MAP.md', `# Logic Map — local-mcp-memory v2.6.0

## Request Processing Lifecycle
\`\`\`
[MCP Client]
      │
      ▼
[stdio / SSE Transport]
      │
      ▼
[JSON-RPC Parser & Validator]
      │
      ├── (initialize) ──> [Negotiate Protocol & Declare Capabilities]
      ├── (tools/list) ──> [Filter & Return 63 Registered Tools]
      └── (tools/call) ──> [Execution Sandbox & Security Guard]
                                  │
                                  ▼
                         [Domain Handler]
                                  │
                                  ▼
                      [SQLite Storage Engine]
                                  │
                                  ▼
                        [JSON-RPC Response]
\`\`\`
`);

writeFile('.agent/maps/DEPENDENCY_MAP.md', `# Dependency Map — local-mcp-memory v2.6.0

## Production Dependencies
- **better-sqlite3:** High-performance, synchronous SQLite3 bindings.
- **express (v5.x):** Next-generation HTTP and Server-Sent Events transport.
- **cors:** Cross-Origin Resource Sharing middleware for HTTP endpoints.
- **dotenv:** Environment variable loading.

## Development & Test Dependencies
- **eslint (v8.x):** Code linting.
- **prettier (v3.x):** Code formatting.
- **node:test:** Native test runner.
`);

writeFile('.agent/maps/DATA_FLOW_MAP.md', `# Data Flow Map — local-mcp-memory v2.6.0

## Data Ingestion & Retrieval Flow
\`\`\`
[Agent Memory Request] 
      │
      ▼
[Memory Tool Handler: store_memory]
      │
      ▼
[Data Sanitizer & Validator]
      │
      ▼
[SQLite Adapter: Prepared Insert]
      │
      ├──> [contexts table (Primary Record)]
      └──> [activities table (Audit Stream Event)]
\`\`\`
`);

// 10. .agent/adapters/
const adapters = ['antigravity', 'opencode', 'codex', 'claude', 'cline', 'cursor', 'windsurf', 'roo'];

writeFile('.agent/adapters/README.md', `# AI Agent Adapters

This directory contains integration documentation and bridging configuration for each supported AI agent.

All adapters consume the authoritative rules from \`.agent/AGENTS.md\` and domain instructions from \`.agent/instructions/\`.

## Supported Agents
- [Google Antigravity](antigravity/README.md)
- [OpenCode](opencode/README.md)
- [OpenAI Codex](codex/README.md)
- [Claude Code](claude/README.md)
- [Cline](cline/README.md)
- [Cursor](cursor/README.md)
- [Windsurf](windsurf/README.md)
- [Roo Code](roo/README.md)
`);

adapters.forEach(agent => {
  writeFile(`.agent/adapters/${agent}/README.md`, `# ${agent.toUpperCase()} Adapter — local-mcp-memory

## Integration Overview
This guide enables **${agent}** to interact seamlessly with \`local-mcp-memory\` v2.6.0.

## Configuration & Bootstrap
- **Bootstrap Pointer:** Root \`AGENTS.md\` (or \`${agent === 'cline' ? '.clinerules' : agent === 'claude' ? 'CLAUDE.md' : agent.toUpperCase() + '.md'}\`).
- **Authoritative Rules:** \`.agent/AGENTS.md\`.
- **System Directives:** \`.agent/instructions/SYSTEM.md\`.

## MCP Connection Configuration
To register \`local-mcp-memory\` v2.6.0 into ${agent}:
\`\`\`json
{
  "mcpServers": {
    "local-mcp-memory": {
      "command": "node",
      "args": ["C:\\\\Code_Works\\\\HTML_CSS_JS\\\\workProjects\\\\projects\\\\local-mcp-memory\\\\mcp-server.js"],
      "env": {
        "NODE_ENV": "development",
        "DATABASE_ENGINE": "sqlite"
      }
    }
  }
}
\`\`\`
`);
});

// 11. .agent/templates/
writeFile('.agent/templates/TASK_HANDOFF.md', `# Task Handoff Template

**Date:** YYYY-MM-DD  
**Outgoing Agent:** [Agent Name]  
**Incoming Agent:** [Agent Name / Next Shift]  
**Current Milestone:** [Milestone Name]  

## 1. Summary of Completed Work
- Item 1
- Item 2

## 2. Active State & Blockers
- Active file(s):
- Known issues:

## 3. Immediate Next Steps
1. Step 1
2. Step 2

## 4. Verification Check
- \`npm run check\`: [PASS/FAIL]
- \`npm test\`: [PASS/FAIL]
`);

writeFile('.agent/templates/SESSION_SUMMARY.md', `# Session Summary Template

**Date:** YYYY-MM-DD  
**Agent:** [Agent Name]  
**Objective:** [Objective]  

## Key Achievements
- ...

## Invariants Preserved
- [x] Stable instance untouched
- [x] MongoDB production untouched
- [x] Tests passing 100%
`);

writeFile('.agent/templates/DECISION_RECORD.md', `# Architecture Decision Record (ADR) Template

# ADR-XXX: [Title]

## Status
[Proposed | Accepted | Superseded | Deprecated]

## Context
[What is the context and problem being addressed?]

## Decision
[What is the change or architecture decision?]

## Consequences
- Positive:
- Negative / Risks:
`);

writeFile('.agent/templates/INCIDENT_REPORT.md', `# Incident Report Template

**Date:** YYYY-MM-DD  
**Severity:** [P1 - Critical | P2 - Major | P3 - Minor]  
**Impact:** [Description]  

## Description
[What happened?]

## Root Cause
[Why did it happen?]

## Remediation
[How was it fixed?]

## Preventative Action
[How do we prevent recurrence?]
`);

// 12. .agent/schemas/
writeFile('.agent/schemas/memory-entry.schema.json', JSON.stringify({
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "MemoryEntry",
  "type": "object",
  "required": ["id", "projectId", "category", "content", "createdAt"],
  "properties": {
    "id": { "type": "string" },
    "projectId": { "type": "string" },
    "category": { "type": "string" },
    "content": { "type": "string" },
    "tags": { "type": "array", "items": { "type": "string" } },
    "metadata": { "type": "object" },
    "createdAt": { "type": "string", "format": "date-time" }
  }
}, null, 2));

writeFile('.agent/schemas/agent-config.schema.json', JSON.stringify({
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "AgentConfig",
  "type": "object",
  "required": ["agentName", "bootstrapFile", "mcpTransport"],
  "properties": {
    "agentName": { "type": "string" },
    "bootstrapFile": { "type": "string" },
    "mcpTransport": { "type": "string", "enum": ["stdio", "sse"] },
    "capabilities": { "type": "array", "items": { "type": "string" } }
  }
}, null, 2));

writeFile('.agent/schemas/handoff.schema.json', JSON.stringify({
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "AgentHandoff",
  "type": "object",
  "required": ["timestamp", "outgoingAgent", "status", "nextSteps"],
  "properties": {
    "timestamp": { "type": "string", "format": "date-time" },
    "outgoingAgent": { "type": "string" },
    "status": { "type": "string" },
    "nextSteps": { "type": "array", "items": { "type": "string" } },
    "verificationStatus": { "type": "string" }
  }
}, null, 2));

console.log('Successfully scaffolded complete .agent/ workspace!');
