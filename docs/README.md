# Documentation Hub — `local-mcp-memory`

Welcome to the documentation hub for **Local MCP Memory Server**. This directory organizes technical documentation for users, developers, operators, and AI coding agents.

---

## 1. User & Operator Documentation

- **[CLI Reference](cli-reference.md)** — Exhaustive guide to all 17 CLI commands, with options, parameters, and copy-pasteable PowerShell & Bash examples.
- **[Configuration Guide](configuration.md)** — Comprehensive reference for environment variables, config files, and multi-platform storage paths.
- **[MCP Integration Guide](mcp-integration.md)** — Client setup instructions and configuration snippets for all 8 supported AI coding agents.
- **[Security Policy](../SECURITY.md)** — Security architecture, JWT / API key authentication, AES-256-GCM token encryption, and disclosure process.
- **[Connection Lifecycle](connection-lifecycle.md)** — Detailed specification of SSE, stdio, and HTTP connection lifecycles.
- **[Reliability & Recovery](reliability.md)** — Auto-healing, port recovery, and chaos resilience architecture.

---

## 2. Developer & Contributor Documentation

- **[Contributing Guide](../CONTRIBUTING.md)** — Getting started, coding conventions (pure ESM), stdio hygiene, and PR lifecycle.
- **[Developer Hub](development/README.md)** — Developer onboarding and architectural principles.
- **[Testing Guide](development/testing-guide.md)** — Running and authoring unit, conformance, resilience, and chaos tests.
- **[Adding an MCP Tool](development/adding-mcp-tool.md)** — Step-by-step SOP for declaring, implementing, and registering new MCP tools.
- **[Adding an Agent Adapter](development/adding-agent-adapter.md)** — Guide to extending CLI auto-configuration for new AI agents.

---

## 3. Engineering Workspace & Architecture (`.workspace/`)

- **[Master Engineering Index](../.workspace/INDEX.md)** — Master engineering index connecting ADRs, specifications, plans, and reports.
- **[Project Reference Index (PRI)](../.workspace/PRI/PROJECT_REFERENCE_INDEX.md)** — Topographical module index and dependency registry.
- **[Logic Flow Index (LFI)](../.workspace/LFI/LOGIC_FLOW_INDEX.md)** — Runtime execution flows and cross-module interactions.
- **[Engineering Reports Index](../.workspace/reports/README.md)** — Master index and audit logs of all technical verification campaigns.

---

## 4. AI Coding Agent Workspace (`.agent/`)

- **[Agent Master Instructions](../.agent/AGENTS.md)** — Universal instructions and non-negotiable invariants for AI agents.
- **[Agent Adapters](../.agent/adapters/README.md)** — Environment-specific instructions for Antigravity, Claude, Codex, OpenCode, Cursor, Windsurf, Cline, and Roo Code.
- **[Agent Context](../.agent/context/CURRENT_STATE.md)** — Live system state, active milestones, and architectural decisions.
