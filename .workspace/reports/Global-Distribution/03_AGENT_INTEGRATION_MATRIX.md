# AI Agent Integration Matrix

## 1. Supported Client Ecosystem

Local MCP Memory includes native, zero-configuration adapters for 6 major AI agent environments:

| Client ID | Display Name | Target Configuration File (Cross-Platform) | Format | Mutation Strategy |
|---|---|---|---|---|
| `opencode` | OpenCode | **Windows:** `%USERPROFILE%\.config\opencode\opencode.json`<br>**Linux/macOS:** `~/.config/opencode/opencode.json` | JSONC | Comment-preserving JSONC AST patcher |
| `codex` | OpenAI Codex CLI | **Windows:** `%USERPROFILE%\.codex\config.toml`<br>**Linux/macOS:** `~/.codex/config.toml` | TOML | Dedicated section append / replace (`[mcp_servers.local-mcp-memory]`) |
| `claude` | Claude Desktop | **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`<br>**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`<br>**Linux:** `~/.config/Claude/claude_desktop_config.json` | JSON | Non-destructive `mcpServers` object merge |
| `cursor` | Cursor | **Windows:** `%USERPROFILE%\.cursor\mcp.json`<br>**Linux/macOS:** `~/.cursor/mcp.json` | JSON | Non-destructive `mcpServers` object merge |
| `windsurf` | Windsurf | **Windows:** `%USERPROFILE%\.codeium\windsurf\mcp_config.json`<br>**Linux/macOS:** `~/.codeium/windsurf/mcp_config.json` | JSON | Non-destructive `mcpServers` object merge |
| `cline` | Cline (VS Code) | **Windows:** `%APPDATA%\Code\User\globalStorage\saoudrizwan.claude-dev\settings\cline_mcp_settings.json`<br>**macOS:** `~/Library/Application Support/Code/User/globalStorage/...`<br>**Linux:** `~/.config/Code/User/globalStorage/...` | JSON | Non-destructive `mcpServers` object merge |

---

## 2. Configuration Schemas & Examples

### 2.1 OpenCode (`opencode.json`)
```jsonc
{
  "mcp": {
    "local-mcp-memory": {
      "type": "local",
      "command": ["npx", "-y", "local-memory-mcp", "start"],
      "environment": {
        "MCP_AGENT": "opencode"
      },
      "enabled": true,
      "timeout": 120000
    }
  }
}
```

### 2.2 Codex CLI (`config.toml`)
```toml
[mcp_servers.local-mcp-memory]
command = "npx"
args = ["-y", "local-memory-mcp", "start"]

[mcp_servers.local-mcp-memory.env]
MCP_AGENT = "codex"
```

### 2.3 Claude Desktop / Cursor / Windsurf / Cline (`mcp.json` / `claude_desktop_config.json`)
```json
{
  "mcpServers": {
    "local-mcp-memory": {
      "command": "npx",
      "args": ["-y", "local-memory-mcp", "start"],
      "env": {
        "MCP_AGENT": "claude"
      }
    }
  }
}
```

---

## 3. Safety & Non-Destructive Invariants

Each adapter complies with the following safety contracts:
1. **Idempotence:** Running `local-memory-mcp init` multiple times results in `action: unchanged`. No spurious timestamps or formatting churn.
2. **Comment Preservation (JSONC):** In OpenCode configuration, developer comments (`// ...` or `/* ... */`) and custom whitespace formatting are preserved through an AST property-range parser ([`src/core/setup/jsonc.js`](file:///C:/Code_Works/HTML_CSS_JS/workProjects/projects/local-mcp-memory/src/core/setup/jsonc.js)).
3. **Backup Retention:** Before any file write, an atomic backup copy is generated adjacent to the configuration file (e.g. `opencode.json.bak.1778130000`). Up to 5 rotating backups are retained.
4. **Post-Write Verification:** The written file is immediately re-parsed and validated to confirm syntax validity and presence of the registration block before committing. If verification fails, the original is restored.
5. **Dry Run:** Passing `--dry-run` previews whether an agent configuration would be created, updated, or left unchanged without performing disk writes.
