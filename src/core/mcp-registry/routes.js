/**
 * MCP Registry HTTP Routes
 *
 * Provides HTTP API for managing registered MCP servers.
 * Mounted at /mcp in server.js.
 *
 * Authorization:
 *   - Write operations (POST/PUT/DELETE) require valid auth (JWT or API key)
 *   - Read operations (GET) use optional auth
 *   - All servers are scoped by project (from auth context or query param)
 *   - Agent must be registered in the project to manage servers
 */

import {
  registerServer,
  unregisterServer,
  getServer,
  getServerRaw,
  listServers,
  updateServer,
  connectToServer,
  disconnectFromServer,
  checkServerHealth,
  getHealthSummary,
  discoverTools,
  startHealthSweep
} from './index.js';
import { TIMEOUTS } from './proxy.js';
import { call as mcpCall } from './session.js';
import { getEncryptionStatus, warnIfEncryptionDisabled } from './crypto.js';
import { requireAuth, optionalAuth } from '../auth/index.js';
import { isFeatureEnabled } from '../../../core/config/project-config-loader.js';

/**
 * Effective project scope of the caller: JWT claim first, then API-key scope.
 * `null` means unscoped (no project constraint enforced).
 */
function getCallerProject(req) {
  return req.user?.project || req.apiKey?.project || null;
}

/**
 * Admin elevation gate for registry writes (POST / DELETE).
 * Opt-in via `features.mcpRegistryAdminGate = true` (default: disabled).
 * Accepts JWT role admin/owner, or an API key with the 'admin' permission.
 */
function passesRegistryAdminGate(req) {
  if (!isFeatureEnabled('mcpRegistryAdminGate')) return true;
  if (req.user?.role && ['admin', 'owner'].includes(req.user.role)) return true;
  if (Array.isArray(req.apiKey?.permissions) && req.apiKey.permissions.includes('admin')) {
    return true;
  }
  return false;
}

/**
 * Register MCP registry routes on an Express app
 */
export function registerMCPRegistryRoutes(app) {
  // Ops visibility: warn once at startup if encryption-at-rest is unavailable.
  warnIfEncryptionDisabled();

  // Periodic health sweep (opt-in): 60s cadence, connected servers only.
  if (isFeatureEnabled('mcpRegistryHealthSweep')) {
    startHealthSweep(60000);
  }
  // POST /mcp/servers — Register a new server (auth required)
  app.post('/mcp/servers', requireAuth, async (req, res) => {
    try {
      if (!passesRegistryAdminGate(req)) {
        return res.status(403).json({
          success: false,
          error: 'Admin role required to register MCP servers (features.mcpRegistryAdminGate)'
        });
      }

      const { name, type, url, command, env, auth_type, auth_config, tags } = req.body;
      // Project scope: explicit body/query wins, else the caller's own scope.
      const project = req.body.project || req.query.project || getCallerProject(req) || 'default';

      if (!name) {
        return res.status(400).json({
          success: false,
          error: 'Server name is required'
        });
      }

      // Agent must be registered in the same project
      const agent =
        req.user?.username || req.apiKey?.project || req.headers['x-agent-id'] || 'unknown';

      const result = await registerServer({
        name,
        type: type || 'http',
        url,
        command,
        env,
        auth_type: auth_type || 'none',
        auth_config,
        tags,
        project,
        agent
      });

      res.status(201).json(result);
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // GET /mcp/servers — List servers (optional auth, project-scoped)
  app.get('/mcp/servers', optionalAuth, async (req, res) => {
    try {
      const { status, type, limit } = req.query;
      // Project scope: from auth context or query param
      const project = req.user?.project || req.apiKey?.project || req.query.project;

      const filter = {};
      if (project) filter.project = project;
      if (status) filter.status = status;
      if (type) filter.type = type;
      if (limit) filter.limit = parseInt(limit);

      const servers = await listServers(filter);
      res.json({ servers, count: servers.length });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // GET /mcp/servers/:id — Get server details (optional auth)
  app.get('/mcp/servers/:id', optionalAuth, async (req, res) => {
    try {
      const server = await getServer(req.params.id);
      if (!server) {
        return res.status(404).json({ success: false, error: 'Server not found' });
      }
      // Project-scoped: only show servers from caller's project
      const callerProject = getCallerProject(req);
      if (callerProject && server.project !== callerProject) {
        return res.status(404).json({ success: false, error: 'Server not found' });
      }
      res.json({ server });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // PUT /mcp/servers/:id — Update server config (auth required)
  app.put('/mcp/servers/:id', requireAuth, async (req, res) => {
    try {
      const server = await getServer(req.params.id);
      if (!server) {
        return res.status(404).json({ success: false, error: 'Server not found' });
      }
      // Project-scoped: only allow updates to own project's servers
      const callerProject = getCallerProject(req);
      if (callerProject && server.project !== callerProject) {
        return res
          .status(403)
          .json({ success: false, error: 'Access denied: server belongs to different project' });
      }

      const result = await updateServer(req.params.id, req.body);
      res.json(result);
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // DELETE /mcp/servers/:id — Unregister server (auth required)
  app.delete('/mcp/servers/:id', requireAuth, async (req, res) => {
    try {
      if (!passesRegistryAdminGate(req)) {
        return res.status(403).json({
          success: false,
          error: 'Admin role required to unregister MCP servers (features.mcpRegistryAdminGate)'
        });
      }

      const server = await getServer(req.params.id);
      if (!server) {
        return res.status(404).json({ success: false, error: 'Server not found' });
      }
      const callerProject = getCallerProject(req);
      if (callerProject && server.project !== callerProject) {
        return res
          .status(403)
          .json({ success: false, error: 'Access denied: server belongs to different project' });
      }

      const result = await unregisterServer(req.params.id);
      res.json(result);
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /mcp/servers/:id/connect — Connect to server (auth required)
  app.post('/mcp/servers/:id/connect', requireAuth, async (req, res) => {
    try {
      const server = await getServer(req.params.id);
      if (!server) {
        return res.status(404).json({ success: false, error: 'Server not found' });
      }
      const callerProject = getCallerProject(req);
      if (callerProject && server.project !== callerProject) {
        return res
          .status(403)
          .json({ success: false, error: 'Access denied: server belongs to different project' });
      }

      const result = await connectToServer(req.params.id);
      if (!result.success) {
        return res.status(400).json(result);
      }
      res.json(result);
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /mcp/servers/:id/disconnect — Disconnect from server (auth required)
  app.post('/mcp/servers/:id/disconnect', requireAuth, async (req, res) => {
    try {
      const server = await getServer(req.params.id);
      if (!server) {
        return res.status(404).json({ success: false, error: 'Server not found' });
      }
      const callerProject = getCallerProject(req);
      if (callerProject && server.project !== callerProject) {
        return res
          .status(403)
          .json({ success: false, error: 'Access denied: server belongs to different project' });
      }

      const result = await disconnectFromServer(req.params.id);
      if (!result.success) {
        return res.status(400).json(result);
      }
      res.json(result);
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /mcp/servers/:id/health — Trigger health check (auth required)
  app.post('/mcp/servers/:id/health', requireAuth, async (req, res) => {
    try {
      const server = await getServer(req.params.id);
      if (!server) {
        return res.status(404).json({ success: false, error: 'Server not found' });
      }
      const callerProject = getCallerProject(req);
      if (callerProject && server.project !== callerProject) {
        return res
          .status(403)
          .json({ success: false, error: 'Access denied: server belongs to different project' });
      }

      const result = await checkServerHealth(req.params.id);
      res.json(result);
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // GET /mcp/health — Health summary for all servers (optional auth)
  app.get('/mcp/health', optionalAuth, async (req, res) => {
    try {
      const summary = await getHealthSummary();
      res.json({ servers: summary, encryption: getEncryptionStatus() });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /mcp/servers/:id/tools — Discover tools (auth required)
  app.post('/mcp/servers/:id/tools', requireAuth, async (req, res) => {
    try {
      const server = await getServer(req.params.id);
      if (!server) {
        return res.status(404).json({ success: false, error: 'Server not found' });
      }
      const callerProject = getCallerProject(req);
      if (callerProject && server.project !== callerProject) {
        return res
          .status(403)
          .json({ success: false, error: 'Access denied: server belongs to different project' });
      }

      const result = await discoverTools(req.params.id);
      res.json(result);
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /mcp/proxy/:id/jsonrpc — Proxy MCP JSON-RPC request (auth required)
  app.post('/mcp/proxy/:id/jsonrpc', requireAuth, async (req, res) => {
    try {
      const { method, params } = req.body;
      if (!method) {
        return res.status(400).json({
          success: false,
          error: 'JSON-RPC method is required'
        });
      }

      const server = await getServerRaw(req.params.id);
      if (!server) {
        return res.status(404).json({ success: false, error: 'Server not found' });
      }
      const callerProject = getCallerProject(req);
      if (callerProject && server.project !== callerProject) {
        return res
          .status(403)
          .json({ success: false, error: 'Access denied: server belongs to different project' });
      }

      if (server.type === 'stdio') {
        return res.status(400).json({
          success: false,
          error: 'stdio servers cannot be proxied via HTTP'
        });
      }

      if (!server.url) {
        return res.status(400).json({ success: false, error: 'Server URL not configured' });
      }

      // Shared session path: performs the MCP handshake, injects real auth
      // headers, enforces the timeout policy, and applies the circuit breaker.
      try {
        const { message } = await mcpCall(server, method, params || {}, TIMEOUTS.default);
        res.json(message);
      } catch (err) {
        if (err.code === 'CIRCUIT_OPEN') {
          return res.status(503).json({
            error: 'MCP_SERVER_UNAVAILABLE',
            message: err.message,
            details: { breaker: 'open', retry_after_ms: err.retryAfterMs }
          });
        }
        return res.status(502).json({ success: false, error: err.message });
      }
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });
}
