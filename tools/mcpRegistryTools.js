/**
 * MCP Registry Tools
 *
 * MCP tool definitions and handlers for managing registered MCP servers.
 * Follows the feature-gated pattern from mcp-integration-tools.js.
 */

import {
  registerServer,
  unregisterServer,
  getServer,
  listServers,
  connectToServer,
  disconnectFromServer,
  proxyToolCall,
  discoverTools,
  checkServerHealth,
  getHealthSummary,
} from '../src/core/mcp-registry/index.js';

import { isFeatureEnabled } from '../core/config/project-config-loader.js';
import { getEncryptionStatus } from '../src/core/mcp-registry/crypto.js';

// ---------------------------------------------------------------------------
// Tool Definitions
// ---------------------------------------------------------------------------

export function getMCPRegistryTools() {
  if (!isFeatureEnabled('mcpRegistry')) {
    return [];
  }

  return [
    {
      name: 'register_mcp_server',
      description:
        'Register a new MCP server in the registry. Supports HTTP, SSE, and stdio types.',
      inputSchema: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Display name for the server',
          },
          type: {
            type: 'string',
            enum: ['http', 'sse', 'stdio'],
            description: 'Server transport type (default: http)',
          },
          url: {
            type: 'string',
            description: 'Server URL (required for http/sse types)',
          },
          command: {
            type: 'string',
            description: 'Command to spawn (required for stdio type)',
          },
          env: {
            type: 'object',
            description: 'Environment variables for the server',
          },
          auth_type: {
            type: 'string',
            enum: ['none', 'api_key', 'bearer', 'basic'],
            description: 'Authentication type (default: none)',
          },
          auth_config: {
            type: 'object',
            description:
              'Auth config: { key_header, key_value } for api_key, { token } for bearer, { username, password } for basic',
          },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: 'Tags for categorization',
          },
          project: {
            type: 'string',
            description: 'Project scope (default: from config)',
          },
        },
        required: ['name'],
      },
    },
    {
      name: 'unregister_mcp_server',
      description: 'Remove an MCP server from the registry.',
      inputSchema: {
        type: 'object',
        properties: {
          server_id: {
            type: 'string',
            description: 'Server ID to remove',
          },
        },
        required: ['server_id'],
      },
    },
    {
      name: 'list_mcp_servers',
      description: 'List all registered MCP servers.',
      inputSchema: {
        type: 'object',
        properties: {
          project: {
            type: 'string',
            description: 'Filter by project',
          },
          status: {
            type: 'string',
            description: 'Filter by status (registered, connected, error, disabled)',
          },
          type: {
            type: 'string',
            description: 'Filter by type (http, sse, stdio)',
          },
          limit: {
            type: 'number',
            description: 'Max results (default: 100)',
          },
        },
      },
    },
    {
      name: 'get_mcp_server',
      description: 'Get detailed information about a registered MCP server.',
      inputSchema: {
        type: 'object',
        properties: {
          server_id: {
            type: 'string',
            description: 'Server ID',
          },
        },
        required: ['server_id'],
      },
    },
    {
      name: 'connect_mcp_server',
      description: 'Connect to a registered HTTP/SSE MCP server and discover its tools.',
      inputSchema: {
        type: 'object',
        properties: {
          server_id: {
            type: 'string',
            description: 'Server ID to connect to',
          },
        },
        required: ['server_id'],
      },
    },
    {
      name: 'disconnect_mcp_server',
      description: 'Disconnect from a registered MCP server.',
      inputSchema: {
        type: 'object',
        properties: {
          server_id: {
            type: 'string',
            description: 'Server ID to disconnect from',
          },
        },
        required: ['server_id'],
      },
    },
    {
      name: 'proxy_mcp_call',
      description: 'Call a tool on a registered MCP server. Requires the server to be connected.',
      inputSchema: {
        type: 'object',
        properties: {
          server_id: {
            type: 'string',
            description: 'Server ID',
          },
          tool_name: {
            type: 'string',
            description: 'Tool name on the remote server',
          },
          args: {
            type: 'object',
            description: 'Arguments to pass to the tool',
          },
        },
        required: ['server_id', 'tool_name'],
      },
    },
    {
      name: 'discover_mcp_tools',
      description:
        "Discover tools available on a registered MCP server. Updates the server's capabilities.",
      inputSchema: {
        type: 'object',
        properties: {
          server_id: {
            type: 'string',
            description: 'Server ID',
          },
        },
        required: ['server_id'],
      },
    },
    {
      name: 'get_mcp_health',
      description:
        'Get health status of registered MCP servers. Checks a specific server or all servers.',
      inputSchema: {
        type: 'object',
        properties: {
          server_id: {
            type: 'string',
            description: 'Optional: specific server ID to check',
          },
        },
      },
    },
  ];
}

// ---------------------------------------------------------------------------
// Tool Handlers
// ---------------------------------------------------------------------------

export async function handleMCPRegistryTool(name, args, config) {
  if (!isFeatureEnabled('mcpRegistry')) {
    return {
      content: [
        {
          type: 'text',
          text: 'MCP Registry feature is disabled. Enable it in project config: features.mcpRegistry = true',
        },
      ],
    };
  }

  try {
    let result;

    switch (name) {
      case 'register_mcp_server':
        result = await handleRegister(args, config);
        break;
      case 'unregister_mcp_server':
        result = await handleUnregister(args, config);
        break;
      case 'list_mcp_servers':
        result = await handleList(args, config);
        break;
      case 'get_mcp_server':
        result = await handleGet(args, config);
        break;
      case 'connect_mcp_server':
        result = await handleConnect(args, config);
        break;
      case 'disconnect_mcp_server':
        result = await handleDisconnect(args, config);
        break;
      case 'proxy_mcp_call':
        result = await handleProxyCall(args, config);
        break;
      case 'discover_mcp_tools':
        result = await handleDiscover(args, config);
        break;
      case 'get_mcp_health':
        result = await handleHealth(args, config);
        break;
      default:
        result = { error: `Unknown MCP registry tool: ${name}` };
    }

    return {
      content: [
        {
          type: 'text',
          text: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (err) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ error: err.message || 'MCP registry operation failed' }, null, 2),
        },
      ],
    };
  }
}

// ---------------------------------------------------------------------------
// Individual Handlers
// ---------------------------------------------------------------------------

/**
 * Project-scoping guard: verifies the server belongs to the caller's project.
 * Returns an error object when access is denied (or the server does not
 * exist); returns null when access is allowed. Mirrors the check used by
 * HTTP routes so MCP tools and REST endpoints enforce the same boundary.
 */
async function assertProjectAccess(serverId, config) {
  const server = await getServer(serverId);
  if (!server) {
    return { error: `Server not found: ${serverId}` };
  }

  const project = config?.project;
  if (project && server.project && server.project !== project) {
    return { error: `Server not found: ${serverId}` };
  }

  return null;
}

async function handleRegister(args, config) {
  const server = await registerServer({
    name: args.name,
    type: args.type || 'http',
    url: args.url,
    command: args.command,
    env: args.env,
    auth_type: args.auth_type || 'none',
    auth_config: args.auth_config,
    tags: args.tags,
    project: args.project || config?.project || 'default',
    agent: config?.agent || 'unknown',
  });

  return {
    success: true,
    message: `Server "${args.name}" registered with ID: ${server.server_id}`,
    server,
  };
}

async function handleUnregister(args, config) {
  const denied = await assertProjectAccess(args.server_id, config);
  if (denied) return denied;

  const result = await unregisterServer(args.server_id);

  if (result.success) {
    return {
      success: true,
      message: `Server "${result.name}" (${result.server_id}) removed from registry`,
    };
  }

  return result;
}

async function handleList(args, config) {
  const project = args.project || config?.project || 'default';
  const servers = await listServers({
    project,
    status: args.status,
    type: args.type,
    limit: args.limit,
  });

  return {
    servers,
    count: servers.length,
    message:
      servers.length === 0
        ? 'No MCP servers registered'
        : `Found ${servers.length} registered MCP server(s)`,
  };
}

async function handleGet(args, config) {
  const denied = await assertProjectAccess(args.server_id, config);
  if (denied) return denied;

  const server = await getServer(args.server_id);
  return { server };
}

async function handleConnect(args, config) {
  const denied = await assertProjectAccess(args.server_id, config);
  if (denied) return denied;

  const result = await connectToServer(args.server_id);

  if (result.success) {
    return {
      ...result,
      message: `Connected to server. Found ${result.toolCount} tool(s): ${(result.tools || []).map((t) => t.name).join(', ')}`,
    };
  }

  return result;
}

async function handleDisconnect(args, config) {
  const denied = await assertProjectAccess(args.server_id, config);
  if (denied) return denied;

  const result = await disconnectFromServer(args.server_id);

  if (result.success) {
    return {
      ...result,
      message: `Disconnected from server ${args.server_id}`,
    };
  }

  return result;
}

async function handleProxyCall(args, config) {
  const denied = await assertProjectAccess(args.server_id, config);
  if (denied) return denied;

  const result = await proxyToolCall(args.server_id, args.tool_name, args.args || {});

  return result;
}

async function handleDiscover(args, config) {
  const denied = await assertProjectAccess(args.server_id, config);
  if (denied) return denied;

  const result = await discoverTools(args.server_id);

  return {
    ...result,
    message: `Discovered ${result.count} tool(s) on server ${args.server_id}`,
  };
}

async function handleHealth(args, config) {
  if (args.server_id) {
    const denied = await assertProjectAccess(args.server_id, config);
    if (denied) return denied;

    return await checkServerHealth(args.server_id);
  }

  const servers = await getHealthSummary();
  return {
    encryption: getEncryptionStatus(),
    servers,
    count: servers.length,
  };
}
