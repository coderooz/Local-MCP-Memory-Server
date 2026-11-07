# npm Packaging and Publication Readiness

## 1. Package Metadata & Identification

- **Package Name:** `local-mcp-memory` (npm distribution name: `local-memory-mcp` or `local-mcp-memory`)
- **Version:** `2.6.0`
- **Module Format:** Pure ESM (`"type": "module"`)
- **Node Engine Requirement:** `>= 20.0.0`
- **License:** MIT
- **Author:** Ranit Saha <contact@coderooz.in> (https://coderooz.in)
- **Repository:** https://github.com/coderooz/Local-MCP-Memory-Server

---

## 2. Binary Configuration & Exports Map

In [`package.json`](file:///C:/Code_Works/HTML_CSS_JS/workProjects/projects/local-mcp-memory/package.json):

```json
{
  "bin": {
    "local-memory-mcp": "./bin/cli.js",
    "mcp-memory": "./bin/cli.js"
  },
  "exports": {
    ".": {
      "import": "./mcp-server.js"
    },
    "./server": {
      "import": "./server.js"
    },
    "./cli": {
      "import": "./bin/cli.js"
    },
    "./package.json": "./package.json"
  }
}
```

This configuration guarantees:
1. `npx local-memory-mcp init` executes `bin/cli.js` directly.
2. `npm install -g local-memory-mcp` installs both `local-memory-mcp` and `mcp-memory` on the system PATH.
3. Node.js code can import the package programmatically: `import { startServer } from 'local-mcp-memory/server';`.

---

## 3. Whitelisted Package Files & Asset Boundary

To minimize distribution tarball size and prevent leaking local logs, test databases, or throwaway scripts, `"files"` is explicitly bounded:

```json
  "files": [
    "bin/",
    "src/",
    "core/",
    "utils/",
    "tools/",
    "plugins/",
    "dashboard/",
    "shared/",
    "mcp-server.js",
    "server.js",
    "startMemoryServer.js",
    "mcp-shim.js",
    "agent-instruction.js",
    "mcp-integration-tools.js",
    "assets/",
    "README.md",
    "LICENSE",
    "CHANGELOG.md"
  ]
```

### Excluded from Distribution:
- `data/` (all local databases and sqlite files)
- `tests/` (test suites and fixtures)
- `.reports/` (internal audit and documentation logs)
- `.git/` / `.github/`
- `*.lock`, `*.tmp`, `*.db`, `*.db-wal`, `*.db-shm`

---

## 4. Tarball Validation (`npm pack --dry-run`)

Running packaging verification confirms clean bundling:
- All required executable modules, dashboard static assets, and core runtime libraries are packaged.
- Executable binary `bin/cli.js` includes the mandatory shebang: `#!/usr/bin/env node`.
- File permissions are normalized for POSIX and Windows compatibility.
