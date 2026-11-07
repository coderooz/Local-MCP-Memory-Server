# PLAN-002: MongoDB-to-SQLite Production Migration Plan

## Scope
Migrate 29,831 records across 16 collections from MongoDB (`mongodb://127.0.0.1:27017/mcp_memory`) into SQLite.

## Safety Checkpoints
1. Create timestamped SQLite backup in `.backups/`.
2. Execute dry-run verification with count checks.
3. Apply migration inside a single atomic SQLite transaction.
4. Verify checksums and record parity post-migration.
