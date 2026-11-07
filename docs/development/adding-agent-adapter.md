# Adding an Agent Adapter — `local-mcp-memory`

This guide explains how to extend `src/core/setup/agent-configs.js` to support automated configuration (`local-mcp-memory init`) for a new AI coding agent or IDE.

---

## 1. Overview

An agent adapter tells the CLI:
1. Where the agent's configuration file lives across Windows, macOS, and Linux.
2. How to parse and format the configuration file (JSON, JSONC, TOML).
3. How to insert or update the `local-mcp-memory` server definition while preserving comments and existing tools.
4. How to safely remove the definition on `local-mcp-memory uninstall`.

---

## 2. Implementing the Adapter in `src/core/setup/agent-configs.js`

1. Open `src/core/setup/agent-configs.js`.
2. Define the path resolver and file target:
   ```javascript
   function getMyAgentConfigPath() {
     if (process.platform === 'win32') {
       return path.join(process.env.APPDATA || '', 'MyAgent', 'settings.json');
     }
     return path.join(os.homedir(), '.config', 'myagent', 'settings.json');
   }
   ```
3. Register the adapter in the `KNOWN_ADAPTERS` array:
   ```javascript
   {
     id: 'myagent',
     label: 'MyAgent IDE',
     description: 'Next-gen coding assistant',
     getConfigPath: getMyAgentConfigPath,
     format: 'json', // or 'jsonc', 'toml'
     detectInstalled() {
       return fs.existsSync(path.dirname(getMyAgentConfigPath()));
     },
     generateConfig(serverPath, env = {}) {
       return {
         command: 'node',
         args: [serverPath],
         env: {
           MCP_PROJECT: env.project || 'my-project',
           MCP_AGENT: 'myagent',
         },
       };
     },
   }
   ```
4. Add corresponding test cases in `tests/identity-reconciliation-test.js` or `tests/agent-adapter-test.js`.

---

## 3. Creating the Canonical Instructions in `.agent/adapters/`

To support prompt-based bootstrap:
1. Create directory `.agent/adapters/<agent-id>/`.
2. Add a `SETUP.md` explaining how the agent loads instructions and connects to MCP.
3. Update `.agent/adapters/README.md` to index the new adapter.

---

## 4. Verification

Run the identity reconciliation test suite:
```bash
npm run test:identity
```

Verify that the CLI recognizes the adapter:
```bash
node bin/cli.js init -c myagent --dry-run
```
