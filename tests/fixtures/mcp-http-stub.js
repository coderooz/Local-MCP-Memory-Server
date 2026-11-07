/**
 * Spec-faithful Streamable HTTP MCP server stub.
 *
 * Deliberately stricter than the naive JSON-RPC mocks used elsewhere in the
 * suite, so tests can prove real MCP interoperability:
 *
 *  - requires `Accept: application/json, text/event-stream` (406 otherwise)
 *  - requires `initialize` before any other request
 *  - issues and validates `Mcp-Session-Id`
 *  - requires `MCP-Protocol-Version` on post-initialize requests
 *  - can answer either as `application/json` or as an SSE stream
 *  - honours `DELETE` session termination
 *
 * The stub is validated independently in `mcp-protocol-conformance-test.js` by
 * connecting the official `@modelcontextprotocol/client` to it.
 */

import http from 'node:http';
import { randomUUID } from 'node:crypto';

const DEFAULT_TOOLS = [
  {
    name: 'echo',
    description: 'Echo the provided arguments',
    inputSchema: { type: 'object', properties: {} },
  },
];

function readBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => resolve(body));
  });
}

function acceptsEventStream(req) {
  const accept = String(req.headers.accept || '');
  return accept.includes('application/json') && accept.includes('text/event-stream');
}

/**
 * Start the stub server.
 *
 * @param {object} [options]
 * @param {string|null} [options.requireAuth] exact `Authorization` value required
 * @param {boolean} [options.sse] answer every request as an SSE stream
 * @param {boolean} [options.issueSession] issue and enforce `Mcp-Session-Id`
 * @param {string} [options.protocolVersion] version echoed by `initialize`
 * @param {boolean} [options.failInitialize] fail `initialize` with a JSON-RPC error
 * @param {Array} [options.tools] tools returned by `tools/list`
 * @returns {Promise<{url: string, port: number, stats: object, close: () => Promise<void>}>}
 */
export async function startMcpStub(options = {}) {
  const {
    requireAuth = null,
    sse = false,
    issueSession = true,
    protocolVersion = '2025-11-25',
    failInitialize = false,
    tools = DEFAULT_TOOLS,
  } = options;

  const sessions = new Set();
  const stats = {
    requests: 0,
    initializes: 0,
    initializedNotifications: 0,
    toolListCalls: 0,
    toolCalls: 0,
    sessionDeletes: 0,
    rejectedNoAccept: 0,
    rejectedNoSession: 0,
    lastAuth: null,
  };

  const server = http.createServer(async (req, res) => {
    stats.requests += 1;
    stats.lastAuth = req.headers.authorization || null;

    if (requireAuth && req.headers.authorization !== requireAuth) {
      res.statusCode = 401;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'unauthorized' }));
      return;
    }

    if (req.method === 'DELETE') {
      const id = req.headers['mcp-session-id'];
      sessions.delete(id);
      stats.sessionDeletes += 1;
      res.statusCode = 200;
      res.end('');
      return;
    }

    if (req.method !== 'POST') {
      res.statusCode = 405;
      res.end('');
      return;
    }

    const body = await readBody(req);
    let rpc = null;
    try {
      rpc = JSON.parse(body);
    } catch {
      res.statusCode = 400;
      res.end('');
      return;
    }

    // MCP Streamable HTTP: the client MUST advertise both media types.
    if (!acceptsEventStream(req)) {
      stats.rejectedNoAccept += 1;
      res.statusCode = 406;
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          error: 'Not Acceptable: must accept application/json and text/event-stream',
        })
      );
      return;
    }

    const sessionId = req.headers['mcp-session-id'];
    const isInitialize = rpc.method === 'initialize';

    // Everything except `initialize` requires a valid session (when enforced).
    // Per the spec a *missing* session is 400 and an *unknown* session is 404.
    if (!isInitialize && issueSession) {
      if (!sessionId) {
        stats.rejectedNoSession += 1;
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Bad Request: missing Mcp-Session-Id' }));
        return;
      }
      if (!sessions.has(sessionId)) {
        stats.rejectedNoSession += 1;
        res.statusCode = 404;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Not Found: unknown Mcp-Session-Id' }));
        return;
      }
    }

    if (!isInitialize && issueSession) {
      const sentVersion = req.headers['mcp-protocol-version'];
      if (!sentVersion) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Bad Request: missing MCP-Protocol-Version' }));
        return;
      }
    }

    const respond = (payload) => {
      if (rpc.id === undefined) {
        res.statusCode = 202;
        res.end('');
        return;
      }
      if (sse) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.end(`event: message\ndata: ${JSON.stringify(payload)}\n\n`);
        return;
      }
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(payload));
    };

    if (rpc.method === 'initialize') {
      stats.initializes += 1;

      if (failInitialize) {
        respond({
          jsonrpc: '2.0',
          id: rpc.id,
          error: { code: -32000, message: 'initialize refused by stub' },
        });
        return;
      }

      const id = randomUUID();
      if (issueSession) {
        sessions.add(id);
        res.setHeader('Mcp-Session-Id', id);
      }
      respond({
        jsonrpc: '2.0',
        id: rpc.id,
        result: {
          protocolVersion: rpc.params?.protocolVersion || protocolVersion,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 'mcp-conformance-stub', version: '1.0.0' },
        },
      });
      return;
    }

    if (rpc.method === 'notifications/initialized') {
      stats.initializedNotifications += 1;
      res.statusCode = 202;
      res.end('');
      return;
    }

    if (rpc.method === 'tools/list') {
      stats.toolListCalls += 1;
      respond({ jsonrpc: '2.0', id: rpc.id, result: { tools } });
      return;
    }

    if (rpc.method === 'tools/call') {
      stats.toolCalls += 1;
      const name = rpc.params?.name;
      const args = rpc.params?.arguments || {};
      respond({
        jsonrpc: '2.0',
        id: rpc.id,
        result: {
          content: [{ type: 'text', text: `${name}:${JSON.stringify(args)}` }],
          isError: false,
        },
      });
      return;
    }

    if (rpc.method === 'ping') {
      respond({ jsonrpc: '2.0', id: rpc.id, result: {} });
      return;
    }

    respond({
      jsonrpc: '2.0',
      id: rpc.id,
      error: { code: -32601, message: `Method not found: ${rpc.method}` },
    });
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  return {
    url: `http://127.0.0.1:${port}/mcp`,
    port,
    stats,
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections?.();
        server.close(resolve);
      }),
  };
}
