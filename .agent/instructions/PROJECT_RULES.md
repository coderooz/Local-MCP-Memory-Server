# Project Rules — local-mcp-memory

## Architectural Invariants
- **Runtime:** Node.js 20+ strictly in ECMAScript Modules mode (`"type": "module"` in `package.json`).
- **Database Engine:** SQLite 3 with `better-sqlite3` using Write-Ahead Logging (WAL) and `foreign_keys = ON`.
- **Dual Instance Boundary:**
  - Active Dev Instance: `C:\Code_Works\HTML_CSS_JS\workProjects\projects\local-mcp-memory`
  - Stable Live Instance: `C:\Code_Works\HTML_CSS_JS\workProjects\website\local-mcp-memory` (v2.5.0) — TOUCH FORBIDDEN.
- **Migration Policy:**
  - Production data lives in MongoDB (`mongodb://127.0.0.1:27017/mcp_memory`).
  - Production migration requires multi-stage verification, backup verification, and explicit authorization.
  - Zero unmapped field loss: any legacy field not matching a SQLite column must be preserved in `metadata._migration.unmapped`.

## Code Conventions
- File imports must specify full file extensions: `import { foo } from './foo.js';`.
- All async functions must have structured try/catch blocks with contextual error logging.
- Lint with `npm run lint` and format with `npm run format`.
