# ADR-001: Migration to SQLite Engine

## Status
Accepted

## Context
Previous versions of `local-mcp-memory` (v2.5.0) relied on an external MongoDB daemon. This created operational friction for local developers, requiring a separate database process, complex environment setup, and network port management.

## Decision
Migrate the primary storage engine in v2.6.0 to embedded SQLite using `better-sqlite3` with Write-Ahead Logging (WAL) mode enabled and foreign key enforcement.

## Consequences
- Single-process, zero-configuration local installation.
- Deterministic sub-millisecond query performance.
- Eliminates external database dependency for users.
- WAL mode provides high-throughput concurrent readers with a single serialized writer.
