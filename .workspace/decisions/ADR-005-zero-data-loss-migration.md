# ADR-005: Zero Data Loss Migration Fidelity

## Status
Accepted

## Context
Migrating 29,831 production records from MongoDB to SQLite requires preserving legacy fields that do not map to standard relational columns.

## Decision
Implement strict field-level mapping. Any legacy MongoDB property that does not correspond to a typed SQLite column must be serialized into `metadata._migration.unmapped` within the row's metadata JSON blob.

## Consequences
- 100% data fidelity preserved across all 16 collections.
- No schema truncation or data loss during cutover.
- Fully reversible migration path.
