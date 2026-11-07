# ADR-002: Strict ECMAScript Modules (ESM) Architecture

## Status
Accepted

## Context
Node.js ecosystem has completed its transition towards ECMAScript Modules. Mixing CommonJS (`require`) and ESM (`import`) introduces bundler friction, runtime confusion, and dual-package hazards.

## Decision
Adopt strict ESM throughout `local-mcp-memory`. Declare `"type": "module"` in `package.json` and enforce explicit file extensions (`.js`, `.mjs`) on all imports.

## Consequences
- Direct alignment with modern Node.js standards.
- Cleaner tree-shaking and top-level `await` capability.
- Eliminates CommonJS interop boilerplate.
