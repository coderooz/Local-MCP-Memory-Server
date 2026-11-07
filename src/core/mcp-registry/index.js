/**
 * MCP Registry — Business Logic
 *
 * Manages registered MCP servers: CRUD operations, connection management,
 * tool discovery, and HTTP proxying to external MCP servers.
 */

import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../database/sqlite/index.js';
import { TIMEOUTS, resetCircuitBreaker } from './proxy.js';
import { call as mcpCall, closeSession, resetSession } from './session.js';
import { encryptAuthConfig, decryptAuthConfig } from './crypto.js';

const TABLE = 'mcp_servers';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function now() {
  return new Date().toISOString();
}

function buildId() {
  return `srv_${uuidv4().slice(0, 12)}`;
}

function maskAuth(authConfig) {
  if (!authConfig || typeof authConfig !== 'object') return authConfig;
  const masked = { ...authConfig };
  for (const key of Object.keys(masked)) {
    if (
      typeof masked[key] === 'string' &&
      (key.toLowerCase().includes('key') ||
        key.toLowerCase().includes('secret') ||
        key.toLowerCase().includes('token') ||
        key.toLowerCase().includes('password'))
    ) {
      masked[key] = masked[key].slice(0, 4) + '****';
    }
  }
  return masked;
}

// ---------------------------------------------------------------------------
// Registry CRUD
// ---------------------------------------------------------------------------

export async function registerServer(config) {
  const db = getDatabase();
  const col = db.collection(TABLE);

  const id = buildId();
  const ts = now();

  const doc = {
    id,
    agent: config.agent || 'unknown',
    project: config.project || 'default',
    sessionId: config.sessionId || null,
    scope: config.scope || 'private',
    server_id: config.server_id || id,
    name: config.name,
    type: config.type || 'http',
    command: config.command || null,
    url: config.url || null,
    env: JSON.stringify(config.env || {}),
    auth_type: config.auth_type || 'none',
    auth_config: encryptAuthConfig(config.auth_config || {}),
    status: 'registered',
    health: JSON.stringify({ lastCheck: null, latency: null, errorCount: 0 }),
    capabilities: JSON.stringify(config.capabilities || []),
    tags: JSON.stringify(config.tags || []),
    metadata: JSON.stringify(config.metadata || {}),
    version: 1,
    createdAt: ts,
    updatedAt: ts
  };

  await col.insertOne(doc);
  return { server_id: id, status: 'registered', name: doc.name };
}

export async function unregisterServer(serverId) {
  const db = getDatabase();
  const col = db.collection(TABLE);

  const existing = await col.findOne({ server_id: serverId });
  if (!existing) {
    return { success: false, error: 'Server not found' };
  }

  await col.deleteOne({ server_id: serverId });
  clearDiscoveredTools(serverId);
  resetCircuitBreaker(serverId);
  resetSession(serverId);
  return { success: true, server_id: serverId, name: existing.name };
}

/**
 * Decrypt an auth_config column value for EXTERNAL surfaces.
 * Never throws — when ciphertext cannot be decrypted (secret missing), a
 * non-sensitive placeholder is returned so list/detail views keep working.
 */
function decryptForDisplay(value) {
  try {
    return decryptAuthConfig(value);
  } catch {
    return { encrypted: true, unavailable: true };
  }
}

export async function getServer(serverId) {
  const db = getDatabase();
  const col = db.collection(TABLE);

  const server = await col.findOne({ server_id: serverId });
  if (!server) return null;

  return {
    ...server,
    auth_config: maskAuth(decryptForDisplay(server.auth_config))
  };
}

/**
 * Internal-only read: returns the server WITHOUT masking auth_config.
 *
 * Used exclusively by the proxy path (connect / discover / proxy / health),
 * which must send real credentials upstream via buildHeaders().
 * Decrypts `enc:v1:` ciphertext (throws ENCRYPTION_UNAVAILABLE when the
 * instance has no MCP_MASTER_SECRET — fail closed).
 * NEVER expose this result to HTTP routes, MCP tool output, or logs —
 * all external surfaces must use getServer()/listServers() (masked).
 */
export async function getServerRaw(serverId) {
  const db = getDatabase();
  const col = db.collection(TABLE);
  const server = await col.findOne({ server_id: serverId });
  if (!server) return null;

  return {
    ...server,
    auth_config: decryptAuthConfig(server.auth_config)
  };
}

export async function listServers(filters = {}) {
  const db = getDatabase();
  const col = db.collection(TABLE);

  const query = {};
  if (filters.project) query.project = filters.project;
  if (filters.status) query.status = filters.status;
  if (filters.type) query.type = filters.type;

  const servers = await col
    .find(query)
    .limit(filters.limit || 100)
    .toArray();

  return servers.map((s) => ({
    ...s,
    auth_config: maskAuth(decryptForDisplay(s.auth_config))
  }));
}

export async function updateServer(serverId, updates) {
  const db = getDatabase();
  const col = db.collection(TABLE);

  const existing = await col.findOne({ server_id: serverId });
  if (!existing) {
    return { success: false, error: 'Server not found' };
  }

  const allowed = [
    'name',
    'type',
    'command',
    'url',
    'env',
    'auth_type',
    'auth_config',
    'status',
    'health',
    'capabilities',
    'tags',
    'metadata'
  ];

  const setOps = { updatedAt: now(), version: (existing.version || 1) + 1 };
  for (const key of allowed) {
    if (updates[key] !== undefined) {
      if (
        key === 'auth_config' &&
        typeof updates[key] === 'object' &&
        !Array.isArray(updates[key])
      ) {
        // Re-encrypt whenever a plaintext credential object is written.
        setOps[key] = encryptAuthConfig(updates[key]);
      } else {
        setOps[key] =
          typeof updates[key] === 'object' ? JSON.stringify(updates[key]) : updates[key];
      }
    }
  }

  await col.findOneAndUpdate({ server_id: serverId }, { $set: setOps });

  // A changed endpoint or credential invalidates accumulated breaker history
  // and any negotiated session.
  if (updates.url !== undefined && updates.url !== existing.url) {
    resetCircuitBreaker(serverId);
    resetSession(serverId);
  }
  if (updates.auth_config !== undefined || updates.auth_type !== undefined) {
    resetSession(serverId);
  }

  return getServer(serverId);
}

// ---------------------------------------------------------------------------
// Connection Management
// ---------------------------------------------------------------------------

export async function connectToServer(serverId) {
  const server = await getServerRaw(serverId);
  if (!server) {
    return { success: false, error: 'Server not found' };
  }

  if (server.type === 'stdio') {
    return {
      success: false,
      error:
        'stdio servers cannot be connected via HTTP proxy. Metadata-only registration available.'
    };
  }

  if (!server.url) {
    return { success: false, error: 'Server URL not configured' };
  }

  // Attempt to discover tools from the server
  try {
    const tools = await discoverTools(serverId);
    await updateServer(serverId, {
      status: 'connected',
      health: {
        lastCheck: now(),
        latency: 0,
        errorCount: 0
      }
    });
    // Populate dynamic tool cache
    setDiscoveredTools(serverId, server.name, tools.tools || []);
    return {
      success: true,
      server_id: serverId,
      status: 'connected',
      tools: tools.tools || [],
      toolCount: (tools.tools || []).length
    };
  } catch (err) {
    await updateServer(serverId, {
      status: 'error',
      health: {
        lastCheck: now(),
        latency: null,
        errorCount: (server.health?.errorCount || 0) + 1
      }
    });
    return {
      success: false,
      error: err.message || 'Connection failed',
      server_id: serverId
    };
  }
}

export async function disconnectFromServer(serverId) {
  const server = await getServerRaw(serverId);
  if (!server) {
    return { success: false, error: 'Server not found' };
  }

  // End the remote Streamable HTTP session (best effort) before forgetting it.
  await closeSession(server);

  await updateServer(serverId, {
    status: 'registered',
    capabilities: []
  });

  clearDiscoveredTools(serverId);

  return { success: true, server_id: serverId, status: 'registered' };
}

export async function getServerStatus(serverId) {
  const server = await getServer(serverId);
  if (!server) return null;

  return {
    server_id: server.server_id,
    name: server.name,
    type: server.type,
    status: server.status,
    health: server.health,
    capabilities: server.capabilities
  };
}

// ---------------------------------------------------------------------------
// Tool Discovery
// ---------------------------------------------------------------------------

export async function discoverTools(serverId) {
  const server = await getServerRaw(serverId);
  if (!server) {
    throw new Error('Server not found');
  }

  if (server.type === 'stdio') {
    return { tools: [], note: 'stdio servers — tool discovery not supported' };
  }

  if (!server.url) {
    throw new Error('Server URL not configured');
  }

  // Send MCP tools/list using an initialized Streamable HTTP session.
  const response = await mcpCall(server, 'tools/list', {}, TIMEOUTS.discovery);

  const tools = response?.result?.tools || [];

  // Update server capabilities
  await updateServer(serverId, {
    capabilities: tools.map((t) => ({
      name: t.name,
      description: t.description
    }))
  });

  return { tools, count: tools.length };
}

// ---------------------------------------------------------------------------
// HTTP Proxy — implementation lives in ./proxy.js (shared with routes.js)
// ---------------------------------------------------------------------------

export async function proxyToolCall(serverId, toolName, args = {}) {
  const server = await getServerRaw(serverId);
  if (!server) {
    return { success: false, error: 'Server not found' };
  }

  if (server.type === 'stdio') {
    return {
      success: false,
      error: 'stdio servers cannot be proxied via HTTP'
    };
  }

  if (server.status === 'disabled') {
    return { success: false, error: 'Server is disabled' };
  }

  try {
    const result = await mcpCall(
      server,
      'tools/call',
      {
        name: toolName,
        arguments: args
      },
      TIMEOUTS.toolCall
    );

    // Reset error count on success
    if (server.health?.errorCount > 0) {
      await updateServer(serverId, {
        health: {
          lastCheck: now(),
          latency: 0,
          errorCount: 0
        }
      });
    }

    return {
      success: true,
      server_id: serverId,
      tool_name: toolName,
      result: result.result
    };
  } catch (err) {
    // Increment error count
    await updateServer(serverId, {
      status: 'error',
      health: {
        lastCheck: now(),
        latency: null,
        errorCount: (server.health?.errorCount || 0) + 1
      }
    });

    return {
      success: false,
      server_id: serverId,
      tool_name: toolName,
      error: err.message,
      ...(err.code ? { code: err.code } : {}),
      ...(err.retryAfterMs !== undefined ? { retry_after_ms: err.retryAfterMs } : {})
    };
  }
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

export async function checkServerHealth(serverId) {
  const server = await getServerRaw(serverId);
  if (!server) {
    return { success: false, error: 'Server not found' };
  }

  if (server.type === 'stdio') {
    return { server_id: serverId, status: 'registered', note: 'stdio server' };
  }

  const start = Date.now();
  try {
    await mcpCall(server, 'ping', {}, TIMEOUTS.health);
    const latency = Date.now() - start;

    await updateServer(serverId, {
      status: 'connected',
      health: { lastCheck: now(), latency, errorCount: 0 }
    });

    return {
      server_id: serverId,
      status: 'connected',
      latency,
      lastCheck: now()
    };
  } catch (err) {
    const errorCount = (server.health?.errorCount || 0) + 1;
    await updateServer(serverId, {
      status: 'error',
      health: { lastCheck: now(), latency: null, errorCount }
    });

    return {
      server_id: serverId,
      status: 'error',
      error: err.message,
      errorCount
    };
  }
}

export async function getHealthSummary() {
  const servers = await listServers();
  return servers.map((s) => ({
    server_id: s.server_id,
    name: s.name,
    status: s.status,
    health: s.health
  }));
}

// ---------------------------------------------------------------------------
// Periodic Health Sweep (config-gated; started by routes when enabled)
// ---------------------------------------------------------------------------

let healthSweepTimer = null;
let healthSweepRunning = false;

/**
 * Run one health-check pass over all `connected` servers.
 * Re-entrant guard: overlapping ticks are skipped, not queued.
 */
export async function runHealthSweep() {
  if (healthSweepRunning) return { skipped: true };

  healthSweepRunning = true;
  try {
    const servers = await listServers({ status: 'connected', limit: 100 });
    const results = [];
    for (const s of servers) {
      results.push(await checkServerHealth(s.server_id));
    }
    return { checked: results.length, results };
  } finally {
    healthSweepRunning = false;
  }
}

/**
 * Start the periodic sweep. `unref()`d so it never keeps the process alive.
 * Calling again replaces the previous timer.
 */
export function startHealthSweep(intervalMs = 60000) {
  stopHealthSweep();
  healthSweepTimer = setInterval(() => {
    void runHealthSweep();
  }, intervalMs);
  if (typeof healthSweepTimer.unref === 'function') healthSweepTimer.unref();
  return intervalMs;
}

export function stopHealthSweep() {
  if (healthSweepTimer) {
    clearInterval(healthSweepTimer);
    healthSweepTimer = null;
  }
}

// ---------------------------------------------------------------------------
// Dynamic Tool Registry (in-memory cache)
// ---------------------------------------------------------------------------

const discoveredToolsCache = new Map(); // server_id → { tools: [...], updatedAt: string }

/**
 * Get all discovered tools from connected servers, formatted for MCP tools/list.
 */
export function getDiscoveredTools() {
  const tools = [];
  for (const [serverId, entry] of discoveredToolsCache) {
    for (const tool of entry.tools) {
      tools.push({
        name: `mcp__${serverId}__${tool.name}`,
        description: `[via ${entry.serverName}] ${tool.description || ''}`,
        inputSchema: tool.inputSchema || { type: 'object', properties: {} },
        _mcp_registry: {
          server_id: serverId,
          original_name: tool.name
        }
      });
    }
  }
  return tools;
}

/**
 * Check if a tool name is a proxied MCP registry tool.
 */
export function isProxiedTool(toolName) {
  return toolName.startsWith('mcp__');
}

/**
 * Parse a proxied tool name to extract server_id and original tool name.
 */
export function parseProxiedToolName(toolName) {
  if (!toolName.startsWith('mcp__')) return null;
  const parts = toolName.split('__');
  if (parts.length < 3) return null;
  return {
    server_id: parts[1],
    original_name: parts.slice(2).join('__')
  };
}

/**
 * Call a proxied tool on its registered server.
 */
export async function callProxiedTool(toolName, args) {
  const parsed = parseProxiedToolName(toolName);
  if (!parsed) {
    return { success: false, error: `Invalid proxied tool name: ${toolName}` };
  }

  return proxyToolCall(parsed.server_id, parsed.original_name, args);
}

/**
 * Update the discovered tools cache for a server.
 * Called after connectToServer or discoverTools.
 */
export function setDiscoveredTools(serverId, serverName, tools) {
  discoveredToolsCache.set(serverId, {
    serverId,
    serverName,
    tools: tools || [],
    updatedAt: new Date().toISOString()
  });
}

/**
 * Clear discovered tools for a server.
 */
export function clearDiscoveredTools(serverId) {
  discoveredToolsCache.delete(serverId);
}

/**
 * Get the count of all discovered tools across all servers.
 */
export function getDiscoveredToolCount() {
  let count = 0;
  for (const entry of discoveredToolsCache.values()) {
    count += entry.tools.length;
  }
  return count;
}
