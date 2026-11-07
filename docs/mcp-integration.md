# MCP and Agent Integration Guide — `local-mcp-memory`

This guide explains how to connect and configure AI coding agents with `local-mcp-memory` via the Model Context Protocol (MCP).

---

## 1. Overview of MCP Architecture

`local-mcp-memory` implements the official MCP specification using `stdio` transport. When an AI agent launches the MCP server:
1. The client spawns `node mcp-server.js` or `local-mcp-memory` as a child process.
2. The client initiates a JSON-RPC 2.0 handshake (`initialize`).
3. The server responds with protocol capabilities and server info (`mcp-memory-server` v2.6.0).
4. The client issues `tools/list` to discover available functions (63 tools available).
5. All logging and diagnostics are written to `stderr` to preserve strict JSON-RPC purity on `stdout`.

---

## 2. Automated Agent Configuration (`local-mcp-memory init`)

The easiest method to configure all installed AI agents is via the CLI:

```bash
npx local-mcp-memory init --all
```

The CLI inspects standard system paths, detects installed editors and CLI tools, parses configuration files preserving comments and custom keys, and writes verified configuration blocks.

---

## 3. Manual Configuration for Supported Agents

If you prefer to configure your agents manually, add the corresponding configuration block to your client's settings file:

### 1. Google Antigravity
- **Configuration Path:**
  - Windows: `%USERPROFILE%\.gemini\antigravity\mcp_config.json`
  - Linux/macOS: `~/.gemini/antigravity/mcp_config.json`
- **Configuration Snippet:**
  ```json
  {
    "mcpServers": {
      "local-mcp-memory": {
        "command": "node",
        "args": ["C:/path/to/local-mcp-memory/mcp-server.js"],
        "env": {
          "MCP_PROJECT": "your-project-name",
          "MCP_AGENT": "antigravity"
        }
      }
    }
  }
  ```

### 2. Claude Desktop
- **Configuration Path:**
  - Windows: `%APPDATA%\Claude\claude_desktop_config.json`
  - macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Configuration Snippet:**
  ```json
  {
    "mcpServers": {
      "local-mcp-memory": {
        "command": "node",
        "args": ["C:/path/to/local-mcp-memory/mcp-server.js"],
        "env": {
          "MCP_PROJECT": "your-project-name",
          "MCP_AGENT": "claude"
        }
      }
    }
  }
  ```

### 3. Cursor
- **Configuration Path:**
  - Project level: `.cursor/mcp.json`
  - Global: User settings directory `mcp.json`
- **Configuration Snippet:**
  ```json
  {
    "mcpServers": {
      "local-mcp-memory": {
        "command": "node",
        "args": ["C:/path/to/local-mcp-memory/mcp-server.js"],
        "env": {
          "MCP_PROJECT": "your-project-name",
          "MCP_AGENT": "cursor"
        }
      }
    }
  }
  ```

### 4. Windsurf
- **Configuration Path:**
  - Windows: `%USERPROFILE%\.codeium\windsurf\mcp_config.json`
  - Linux/macOS: `~/.codeium/windsurf/mcp_config.json`
- **Configuration Snippet:**
  ```json
  {
    "mcpServers": {
      "local-mcp-memory": {
        "command": "node",
        "args": ["C:/path/to/local-mcp-memory/mcp-server.js"],
        "env": {
          "MCP_PROJECT": "your-project-name",
          "MCP_AGENT": "windsurf"
        }
      }
    }
  }
  ```

### 5. Cline (VS Code Extension)
- **Configuration Path:**
  - Windows: `%APPDATA%\Code\User\globalStorage\saoudrizwan.claude-dev\settings\cline_mcp_settings.json`
  - Linux/macOS: `~/.config/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`
- **Configuration Snippet:**
  ```json
  {
    "mcpServers": {
      "local-mcp-memory": {
        "command": "node",
        "args": ["C:/path/to/local-mcp-memory/mcp-server.js"],
        "env": {
          "MCP_PROJECT": "your-project-name",
          "MCP_AGENT": "cline"
        },
        "disabled": false,
        "autoApprove": []
      }
    }
  }
  ```

### 6. Roo Code (VS Code Extension)
- **Configuration Path:**
  - Windows: `%APPDATA%\Code\User\globalStorage\rooveterinaryinc.roo-cline\settings\mcp_settings.json`
  - Linux/macOS: `~/.config/Code/User/globalStorage/rooveterinaryinc.roo-cline/settings/mcp_settings.json`
- **Configuration Snippet:**
  ```json
  {
    "mcpServers": {
      "local-mcp-memory": {
        "command": "node",
        "args": ["C:/path/to/local-mcp-memory/mcp-server.js"],
        "env": {
          "MCP_PROJECT": "your-project-name",
          "MCP_AGENT": "roo"
        },
        "disabled": false
      }
    }
  }
  ```

### 7. OpenAI Codex CLI
- **Configuration Path:**
  - `~/.codex/config.toml`
- **Configuration Snippet:**
  ```toml
  [mcp_servers.local-mcp-memory]
  command = "node"
  args = ["C:/path/to/local-mcp-memory/mcp-server.js"]
  env = { MCP_PROJECT = "your-project-name", MCP_AGENT = "codex" }
  ```

### 8. OpenCode
- **Configuration Path:**
  - `opencode.json`
- **Configuration Snippet:**
  ```json
  {
    "mcp": {
      "local-mcp-memory": {
        "type": "local",
        "command": ["node", "C:/path/to/local-mcp-memory/mcp-server.js"],
        "env": {
          "MCP_PROJECT": "your-project-name",
          "MCP_AGENT": "opencode"
        }
      }
    }
  }
  ```

---

## 4. Verification and Troubleshooting

### Verifying Connection
After restarting your AI agent, prompt it:
> *"Please call the `get_project_descriptor` or `fetch_tasks` tool from local-mcp-memory."*

If the server is active, the agent will receive structured JSON without errors.

### Common Failure Modes & Solutions
1. **JSON-RPC Stream Corruption (`SyntaxError: Unexpected token`):**
   - *Cause:* Running a wrapper script that outputs plain text to stdout.
   - *Fix:* Ensure all custom logging uses `process.stderr.write()`. Stdout is reserved exclusively for JSON-RPC messages.
2. **Missing Database / Permissions Error:**
   - *Cause:* Agent lacks write access to default AppData directory.
   - *Fix:* Explicitly set `MCP_DB_PATH` in the client's `env` configuration block to a writable directory.
3. **Identity Resolution Failure (`agent = unknown`):**
   - *Cause:* Neither `MCP_PROJECT` nor `MCP_AGENT` was configured.
   - *Fix:* Define `MCP_PROJECT` and `MCP_AGENT` in client environment settings or create a `.mcp-project` file in the project root.
