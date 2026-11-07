# Release Policy & Versioning

## Semantic Versioning
- Follow SemVer (`MAJOR.MINOR.PATCH`).
- Current development target: `2.6.0`.

## Release Prerequisites
1. All 7 test suites pass cleanly.
2. Clean-room npm package installation verified (`npm pack`).
3. Zero regressions in MCP stdio JSON-RPC handshake and 63-tool enumeration.
4. Multi-agent compatibility bootstrap verified across all supported agents.
5. Migration dry-run parity verified at 100% (29,831 records).
6. Authorization reports signed off and archived in `.workspace/reports/`.
