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

// 1. .workspace/README.md
writeFile('.workspace/README.md', `# Canonical Engineering Workspace — local-mcp-memory

The \`.workspace/\` directory serves as the canonical engineering workspace for **local-mcp-memory** (v2.6.0).
It contains all human-facing and agent-facing engineering records, architectural specifications, campaign reports, deep resources, and historical indices.

## Directory Structure
\`\`\`
.workspace/
├── README.md                 # This overview
├── INDEX.md                  # Master index of engineering assets
├── decisions/                # Architecture Decision Records (ADRs)
├── specifications/           # Formal technical specifications
├── plans/                    # Release and migration execution plans
├── reports/                  # All Campaign and Audit Reports (Sole Canonical Source)
├── resources/                # Deep technical documentation and conceptual guides
├── templates/                # Engineering document templates
├── archive/                  # Historical and superseded artifacts
├── PRI/                      # Project Reference Index
└── LFI/                      # Logic Flow Index
\`\`\`

## Placement Rules
1. **Reports:** All campaign reports, audit logs, release evaluations, and migration integrity evidence MUST be stored in \`.workspace/reports/<CampaignName>/\`. The legacy root \`.reports/\` directory has been deprecated and permanently consolidated here.
2. **Resources:** Deep domain and architectural articles live in \`.workspace/resources/\`.
3. **Decisions:** Architecture decisions must be recorded using \`.workspace/templates/ADR_TEMPLATE.md\` in \`.workspace/decisions/\`.
4. **Specifications:** System designs and protocols live in \`.workspace/specifications/\`.
5. **Plans:** Actionable milestone and migration plans live in \`.workspace/plans/\`.
`);

// 2. .workspace/INDEX.md
writeFile('.workspace/INDEX.md', `# Master Engineering Index — local-mcp-memory v2.6.0

## 1. Governance & Architecture Decisions (\`.workspace/decisions/\`)
- [ADR-001: Migration to SQLite Engine](decisions/ADR-001-sqlite-engine.md)
- [ADR-002: Strict ECMAScript Modules (ESM) Architecture](decisions/ADR-002-strict-esm.md)
- [ADR-003: Dual Repository Isolation Model](decisions/ADR-003-dual-repository-isolation.md)
- [ADR-004: Unified Agent Workspace (.agent/)](decisions/ADR-004-unified-agent-workspace.md)
- [ADR-005: Zero Data Loss Migration Fidelity](decisions/ADR-005-zero-data-loss-migration.md)

## 2. Technical Specifications (\`.workspace/specifications/\`)
- [SPEC-001: Model Context Protocol (MCP) Implementation](specifications/SPEC-001-mcp-implementation.md)
- [SPEC-002: SQLite Storage Engine and Schema](specifications/SPEC-002-sqlite-storage-engine.md)
- [SPEC-003: Multi-Agent Workspace and Configuration](specifications/SPEC-003-multi-agent-workspace.md)

## 3. Engineering Plans (\`.workspace/plans/\`)
- [PLAN-001: v2.6.0 Release and Cutover Plan](plans/PLAN-001-release-cutover.md)
- [PLAN-002: MongoDB-to-SQLite Production Migration Plan](plans/PLAN-002-mongodb-migration.md)

## 4. Reports (\`.workspace/reports/\`)
- Master Reports Index: [\`.workspace/reports/README.md\`](reports/README.md)
- Comprehensive Reports Catalog: [\`.workspace/reports/INDEX.md\`](reports/INDEX.md)
- Campaign Folders:
  - \`Deployment-Readiness\` (10 reports)
  - \`ExecutionSandbox\`
  - \`GitHub\`
  - \`Global-Distribution\`
  - \`Local-Setup\` (10 reports)
  - \`Migration-Integrity\` (10 reports)
  - \`Post-Remediation\` (10 reports)
  - \`Production-Migration\` (10 reports)
  - \`Release-Governance\` (10 reports)
  - \`ResourcesAudit\` (10 reports)
  - \`Agent-Workspace-Governance\` (Campaign 9)

## 5. Indices
- [Project Reference Index (PRI)](PRI/PROJECT_REFERENCE_INDEX.md)
- [Logic Flow Index (LFI)](LFI/LOGIC_FLOW_INDEX.md)
`);

// 3. .workspace/decisions/
writeFile('.workspace/decisions/ADR-001-sqlite-engine.md', `# ADR-001: Migration to SQLite Engine

## Status
Accepted

## Context
Previous versions of \`local-mcp-memory\` (v2.5.0) relied on an external MongoDB daemon. This created operational friction for local developers, requiring a separate database process, complex environment setup, and network port management.

## Decision
Migrate the primary storage engine in v2.6.0 to embedded SQLite using \`better-sqlite3\` with Write-Ahead Logging (WAL) mode enabled and foreign key enforcement.

## Consequences
- Single-process, zero-configuration local installation.
- Deterministic sub-millisecond query performance.
- Eliminates external database dependency for users.
- WAL mode provides high-throughput concurrent readers with a single serialized writer.
`);

writeFile('.workspace/decisions/ADR-002-strict-esm.md', `# ADR-002: Strict ECMAScript Modules (ESM) Architecture

## Status
Accepted

## Context
Node.js ecosystem has completed its transition towards ECMAScript Modules. Mixing CommonJS (\`require\`) and ESM (\`import\`) introduces bundler friction, runtime confusion, and dual-package hazards.

## Decision
Adopt strict ESM throughout \`local-mcp-memory\`. Declare \`"type": "module"\` in \`package.json\` and enforce explicit file extensions (\`.js\`, \`.mjs\`) on all imports.

## Consequences
- Direct alignment with modern Node.js standards.
- Cleaner tree-shaking and top-level \`await\` capability.
- Eliminates CommonJS interop boilerplate.
`);

writeFile('.workspace/decisions/ADR-003-dual-repository-isolation.md', `# ADR-003: Dual Repository Isolation Model

## Status
Accepted

## Context
During the stabilization and verification of v2.6.0, an active, stable instance of v2.5.0 exists at \`website/local-mcp-memory\` providing active memory services to the developer's global AI tools.

## Decision
Maintain complete physical isolation between the development repository (\`projects/local-mcp-memory\`) and the stable repository (\`website/local-mcp-memory\`). No cross-directory file writes or configuration alterations are permitted without explicit sign-off.

## Consequences
- Guaranteed zero-downtime and zero-risk to active developer workflows during testing.
- Allows exhaustive chaos, isolation, and migration dry-run testing.
`);

writeFile('.workspace/decisions/ADR-004-unified-agent-workspace.md', `# ADR-004: Unified Agent Workspace (.agent/)

## Status
Accepted

## Context
Different AI coding assistants (Google Antigravity, OpenCode, Claude Code, OpenAI Codex, Cline, Cursor, Windsurf, Roo Code) utilize different root files (\`AGENTS.md\`, \`CLAUDE.md\`, \`.clinerules\`, etc.), leading to documentation drift and inconsistent instructions.

## Decision
Create a centralized, tool-agnostic AI agent workspace at \`.agent/\` containing all authoritative instructions, contexts, and schemas. Root files become thin bootstrap pointers to \`.agent/\`.

## Consequences
- Single source of truth across all AI agents.
- Eliminates rule drift and conflicting instructions.
- Provides unified memory logging and handoff mechanisms.
`);

writeFile('.workspace/decisions/ADR-005-zero-data-loss-migration.md', `# ADR-005: Zero Data Loss Migration Fidelity

## Status
Accepted

## Context
Migrating 29,831 production records from MongoDB to SQLite requires preserving legacy fields that do not map to standard relational columns.

## Decision
Implement strict field-level mapping. Any legacy MongoDB property that does not correspond to a typed SQLite column must be serialized into \`metadata._migration.unmapped\` within the row's metadata JSON blob.

## Consequences
- 100% data fidelity preserved across all 16 collections.
- No schema truncation or data loss during cutover.
- Fully reversible migration path.
`);

// 4. .workspace/specifications/
writeFile('.workspace/specifications/SPEC-001-mcp-implementation.md', `# SPEC-001: Model Context Protocol (MCP) Implementation

## Overview
\`local-mcp-memory\` implements the Model Context Protocol (MCP) JSON-RPC 2.0 specification (protocol version \`2024-11-05\`).

## Transports
1. **Standard I/O (\`stdio\`):** Primary transport for local agent execution (via \`mcp-server.js\`).
2. **Server-Sent Events (\`SSE\` / HTTP):** Network transport for shared multi-agent hosting (via \`server.js\`).

## Capabilities
- **Tools:** 63 registered tools across memory, tasks, locks, activity streams, and browser automation.
- **Resources:** Dynamic resource subscription and listing.
- **Prompts:** Prompt template enumeration.
- **Logging:** Structured JSON-RPC notifications at standard log levels.
`);

writeFile('.workspace/specifications/SPEC-002-sqlite-storage-engine.md', `# SPEC-002: SQLite Storage Engine and Schema

## Overview
The v2.6.0 storage layer uses embedded SQLite via \`better-sqlite3\`.

## Pragmas
- \`journal_mode = WAL\`
- \`synchronous = NORMAL\`
- \`foreign_keys = ON\`
- \`busy_timeout = 5000\`

## Tables (16)
1. \`contexts\` — Core memory and context items.
2. \`tasks\` — Coordination tasks.
3. \`locks\` — Advisory soft locks.
4. \`activities\` — Activity stream events.
5. \`issues\` — Issue tracking.
6. \`agents\` — Registered AI agent instances.
7. \`projects\` — Registered projects.
8. \`branches\` — Branch metadata.
9. \`code_reviews\` — Automated and manual reviews.
10. \`checkpoints\` — State snapshots.
11. \`documents\` — Attached documentation.
12. \`metrics\` — Performance and execution metrics.
13. \`mcp_servers\` — External registered MCP servers.
14. \`mcp_tools\` — Dynamically injected external tools.
15. \`mcp_resources\` — Registered MCP resources.
16. \`schema_version\` — Migration tracking table.
`);

writeFile('.workspace/specifications/SPEC-003-multi-agent-workspace.md', `# SPEC-003: Multi-Agent Workspace and Configuration

## Overview
Defines the architectural separation between the agent workspace (\`.agent/\`), the engineering workspace (\`.workspace/\`), and the application root.

## Invariants
- \`.agent/\` contains agent instructions, policies, maps, schemas, and ephemeral session memory.
- \`.workspace/\` contains persistent project engineering artifacts, reports, ADRs, specs, and resources.
- Root contains clean source code and thin bootstrap pointers.
`);

// 5. .workspace/plans/
writeFile('.workspace/plans/PLAN-001-release-cutover.md', `# PLAN-001: v2.6.0 Release and Cutover Plan

## Objective
Execute a seamless, zero-downtime cutover from v2.5.0 to v2.6.0.

## Phases
1. **Verification:** Confirm all automated tests and governance suites pass.
2. **Migration Authorization:** Execute production data migration using verified script.
3. **Global Client Update:** Update \`%USERPROFILE%\\.gemini\\antigravity\\mcp_config.json\` to target v2.6.0.
4. **Smoke Testing:** Perform memory write, task creation, and lock acquisition verification via Antigravity.
5. **Archive:** Safely archive legacy v2.5.0 instance.
`);

writeFile('.workspace/plans/PLAN-002-mongodb-migration.md', `# PLAN-002: MongoDB-to-SQLite Production Migration Plan

## Scope
Migrate 29,831 records across 16 collections from MongoDB (\`mongodb://127.0.0.1:27017/mcp_memory\`) into SQLite.

## Safety Checkpoints
1. Create timestamped SQLite backup in \`.backups/\`.
2. Execute dry-run verification with count checks.
3. Apply migration inside a single atomic SQLite transaction.
4. Verify checksums and record parity post-migration.
`);

// 6. .workspace/templates/
writeFile('.workspace/templates/ADR_TEMPLATE.md', `# ADR-XXX: [Title]

## Status
[Proposed | Accepted | Superseded | Deprecated]

## Context
[Context and problem statement]

## Decision
[Decision description]

## Consequences
- Positive:
- Negative:
`);

writeFile('.workspace/templates/SPEC_TEMPLATE.md', `# SPEC-XXX: [Title]

## Abstract
[Summary]

## Specification Details
[Technical details]

## Security Considerations
[Security considerations]
`);

writeFile('.workspace/templates/PLAN_TEMPLATE.md', `# PLAN-XXX: [Title]

## Goal
[Goal]

## Milestones
- [ ] Milestone 1
- [ ] Milestone 2
`);

// 7. .workspace/archive/README.md
writeFile('.workspace/archive/README.md', `# Engineering Archive — local-mcp-memory

This directory preserves historical, deprecated, or superseded engineering artifacts, obsolete configuration drafts, and migration scratch notes.
`);

console.log('Successfully scaffolded complete .workspace/ structure!');
