# ADR-004: Unified Agent Workspace (.agent/)

## Status
Accepted

## Context
Different AI coding assistants (Google Antigravity, OpenCode, Claude Code, OpenAI Codex, Cline, Cursor, Windsurf, Roo Code) utilize different root files (`AGENTS.md`, `CLAUDE.md`, `.clinerules`, etc.), leading to documentation drift and inconsistent instructions.

## Decision
Create a centralized, tool-agnostic AI agent workspace at `.agent/` containing all authoritative instructions, contexts, and schemas. Root files become thin bootstrap pointers to `.agent/`.

## Consequences
- Single source of truth across all AI agents.
- Eliminates rule drift and conflicting instructions.
- Provides unified memory logging and handoff mechanisms.
