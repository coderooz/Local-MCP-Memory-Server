/**
 * MCP Registry — Streamable HTTP session layer.
 *
 * The registry talks to *external* MCP servers. Per the MCP specification the
 * Streamable HTTP transport is not a bare JSON-RPC endpoint: a client must
 *
 *   1. send `initialize` and negotiate a protocol version,
 *   2. capture the `Mcp-Session-Id` response header (when the server issues one),
 *   3. send the `notifications/initialized` notification,
 *   4. attach `Mcp-Session-Id` and `MCP-Protocol-Version` to every later request,
 *   5. advertise `Accept: application/json, text/event-stream` and be able to
 *      read a response delivered as a Server-Sent Events stream,
 *   6. `DELETE` the session on close.
 *
 * `proxy.js` keeps the policy concerns (circuit breaker, timeout budget, auth
 * header injection, secret scrubbing). This module adds the protocol handshake
 * and session lifecycle on top, so registry calls interoperate with real MCP
 * servers rather than only with bare JSON-RPC stubs.
 */

import crypto from 'node:crypto';

import { getPackageInfo } from '../cli/package-info.js';
import { buildHeaders, guardCircuit } from './proxy.js';

/** Newest protocol revision this client speaks; servers may negotiate down. */
export const PROTOCOL_VERSION = '2025-11-25';

/** Revisions this client can interoperate with. */
export const SUPPORTED_PROTOCOL_VERSIONS = Object.freeze([
  '2025-11-25',
  '2025-06-18',
  '2025-03-26',
  '2024-11-05',
  '2024-10-07',
]);

const SESSION_HEADER = 'mcp-session-id';
const PROTOCOL_HEADER = 'mcp-protocol-version';

/** Sessions keyed by server identity + URL + credential fingerprint. */
const sessions = new Map();

let requestCounter = 0;

function nextRequestId() {
  // Monotonic and collision-free across concurrent callers (Date.now() is not).
  requestCounter = (requestCounter + 1) % Number.MAX_SAFE_INTEGER;
  return `${Date.now()}-${requestCounter}`;
}

function clientInfo() {
  try {
    const info = getPackageInfo();
    return { name: info.name, version: info.version };
  } catch {
    return { name: 'local-mcp-memory', version: '0.0.0' };
  }
}

function authFingerprint(server) {
  const raw =
    typeof server.auth_config === 'string'
      ? server.auth_config
      : JSON.stringify(server.auth_config || {});
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 16);
}

function sessionKey(server) {
  const id = server.server_id || server.id || 'unknown';
  return `${id}|${server.url}|${server.auth_type || 'none'}|${authFingerprint(server)}`;
}

function getSessionEntry(server) {
  const key = sessionKey(server);
  let entry = sessions.get(key);
  if (!entry) {
    entry = {
      key,
      serverId: server.server_id || server.id || null,
      sessionId: null,
      protocolVersion: null,
      serverInfo: null,
      capabilities: null,
      initializedAt: null,
      initPromise: null,
    };
    sessions.set(key, entry);
  }
  return entry;
}

/**
 * Create a JSON-RPC error object from an MCP `error` payload.
 */
function toRpcError(error) {
  const err = new Error(error.message || 'MCP server returned an error');
  err.code = error.code;
  if (error.data !== undefined) err.data = error.data;
  return err;
}

function httpError(status, statusText, body) {
  const err = new Error(`HTTP ${status}: ${statusText}${body ? ` — ${body.slice(0, 200)}` : ''}`);
  err.status = status;
  return err;
}

// ---------------------------------------------------------------------------
// Server-Sent Events reader
// ---------------------------------------------------------------------------

/**
 * Read an SSE body until the JSON-RPC response matching `expectedId` arrives.
 *
 * MCP servers may keep the stream open for further notifications, so the
 * reader is cancelled as soon as the answer is found instead of waiting for
 * the connection to close.
 */
async function readSseMessage(response, expectedId, signal) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let resolved = null;

  const cancel = () => {
    // fire-and-forget: releasing the socket must never fail the request
    reader.cancel().catch(() => {});
  };

  try {
    for (;;) {
      if (signal?.aborted) {
        const abort = new Error('The operation was aborted');
        abort.name = 'AbortError';
        throw abort;
      }

      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      let boundary = buffer.search(/\r?\n\r?\n/);
      while (boundary !== -1) {
        const rawEvent = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + (buffer.startsWith('\r\n\r\n', boundary) ? 4 : 2));

        const dataLines = rawEvent
          .split(/\r?\n/)
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).replace(/^ /, ''));

        if (dataLines.length > 0) {
          const payload = dataLines.join('\n');
          let message = null;
          try {
            message = JSON.parse(payload);
          } catch {
            message = null;
          }

          if (message && String(message.id) === String(expectedId)) {
            resolved = message;
            cancel();
            return message;
          }
          // Notifications and unrelated responses are intentionally ignored.
        }

        boundary = buffer.search(/\r?\n\r?\n/);
      }
    }
  } finally {
    if (!resolved) cancel();
  }

  throw new Error('MCP server closed the event stream without a response');
}

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

function requestHeaders(server, session) {
  const headers = buildHeaders(server);
  if (session?.sessionId) headers[SESSION_HEADER] = session.sessionId;
  if (session?.protocolVersion) headers[PROTOCOL_HEADER] = session.protocolVersion;
  return headers;
}

/**
 * POST one JSON-RPC message and return the parsed response message.
 *
 * @returns {Promise<{message: object|null, sessionId: string|null}>}
 */
async function post(server, body, { session, signal } = {}) {
  if (!server.url) throw new Error('Server URL not configured');

  const response = await fetch(server.url, {
    method: 'POST',
    headers: requestHeaders(server, session),
    body: JSON.stringify(body),
    signal,
  });

  const sessionId = response.headers.get(SESSION_HEADER);
  const contentType = (response.headers.get('content-type') || '').toLowerCase();

  if (!response.ok) {
    let text = '';
    try {
      text = await response.text();
    } catch {
      text = '';
    }
    throw httpError(response.status, response.statusText, text);
  }

  // Notifications are acknowledged with 202 Accepted and no body.
  if (response.status === 202 || response.status === 204) {
    return { message: null, sessionId };
  }

  if (contentType.includes('text/event-stream')) {
    const message = body.id === undefined ? null : await readSseMessage(response, body.id, signal);
    return { message, sessionId };
  }

  const text = await response.text();
  if (!text) return { message: null, sessionId };
  return { message: JSON.parse(text), sessionId };
}

/**
 * Run one transport operation under the shared circuit breaker and timeout
 * budget. `fn` receives an AbortSignal.
 */
async function withCircuit(serverId, timeoutMs, fn) {
  const guard = guardCircuit(serverId);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const result = await fn(controller.signal);
    guard.success();
    return result;
  } catch (err) {
    if (err.code === 'CIRCUIT_OPEN') throw err;

    let failure = err;
    if (err.name === 'AbortError') {
      failure = new Error(`Request timed out after ${timeoutMs}ms`);
      failure.code = 'TIMEOUT';
    }
    guard.failure(failure);
    throw failure;
  } finally {
    clearTimeout(timer);
    guard.release();
  }
}

function validateInitializeResult(result) {
  if (!result || typeof result !== 'object') {
    throw new Error('MCP initialize returned no result');
  }
  if (typeof result.protocolVersion !== 'string') {
    throw new Error('MCP initialize returned no protocolVersion');
  }
  if (!SUPPORTED_PROTOCOL_VERSIONS.includes(result.protocolVersion)) {
    throw new Error(
      `MCP server negotiated unsupported protocol version "${result.protocolVersion}"`
    );
  }
  return result;
}

async function initialize(server, entry, timeoutMs) {
  const serverId = entry.serverId;

  const result = await withCircuit(serverId, timeoutMs, async (signal) => {
    const { message, sessionId } = await post(
      server,
      {
        jsonrpc: '2.0',
        id: nextRequestId(),
        method: 'initialize',
        params: {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: clientInfo(),
        },
      },
      { signal }
    );

    if (!message) throw new Error('MCP initialize returned an empty response');
    if (message.error) throw toRpcError(message.error);

    return { init: validateInitializeResult(message.result), sessionId };
  });

  entry.sessionId = result.sessionId || null;
  entry.protocolVersion = result.init.protocolVersion;
  entry.serverInfo = result.init.serverInfo || null;
  entry.capabilities = result.init.capabilities || null;
  entry.initializedAt = new Date().toISOString();

  // `notifications/initialized` completes the handshake. Failures here are
  // surfaced: a server that rejects the notification is not usable.
  await withCircuit(serverId, timeoutMs, async (signal) => {
    await post(
      server,
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      { session: entry, signal }
    );
  });

  return entry;
}

/**
 * Ensure an initialized session exists for a server.
 *
 * Concurrent callers share one handshake.
 *
 * @param {object} server - RAW server record
 * @param {number} [timeoutMs]
 */
export async function ensureSession(server, timeoutMs = 10000) {
  const entry = getSessionEntry(server);
  if (entry.protocolVersion) return entry;

  if (!entry.initPromise) {
    entry.initPromise = initialize(server, entry, timeoutMs).finally(() => {
      entry.initPromise = null;
    });
  }

  return entry.initPromise;
}

/**
 * Call an MCP method on an external server using an initialized session.
 *
 * @param {object} server - RAW server record (getServerRaw)
 * @param {string} method - MCP method name (e.g. `tools/list`)
 * @param {object} [params]
 * @param {number} [timeoutMs]
 * @returns {Promise<{message: object, result: object|null, sessionId: string|null}>}
 */
export async function call(server, method, params = {}, timeoutMs = 10000) {
  const serverId = server.server_id || server.id;

  const attempt = async () => {
    const entry = await ensureSession(server, timeoutMs);

    return withCircuit(serverId, timeoutMs, async (signal) => {
      const { message, sessionId } = await post(
        server,
        { jsonrpc: '2.0', id: nextRequestId(), method, params },
        { session: entry, signal }
      );

      if (!message) throw new Error(`MCP ${method} returned an empty response`);
      if (message.error) throw toRpcError(message.error);

      return {
        message,
        result: message.result === undefined ? null : message.result,
        sessionId: sessionId || entry.sessionId,
      };
    });
  };

  try {
    return await attempt();
  } catch (err) {
    // A 404 means the server forgot the session (restart, eviction). Drop the
    // cached handshake and retry exactly once.
    if (err.status === 404) {
      resetSession(server);
      return attempt();
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Session lifecycle
// ---------------------------------------------------------------------------

function entryMatches(entry, serverId) {
  return serverId === undefined || entry.serverId === serverId;
}

/**
 * Forget the cached session for one server (or every server when no id is
 * given). Does not contact the remote server.
 */
export function resetSession(serverOrId) {
  const serverId =
    typeof serverOrId === 'string' ? serverOrId : serverOrId?.server_id || serverOrId?.id;

  for (const [key, entry] of sessions) {
    if (entryMatches(entry, serverId)) sessions.delete(key);
  }
}

/**
 * Terminate the remote session (best effort) and drop it locally.
 */
export async function closeSession(server, timeoutMs = 5000) {
  const id = server.server_id || server.id;
  const entry = ensureEntryOnly(server);

  if (entry?.sessionId && server.url) {
    try {
      await withCircuit(id, timeoutMs, async (signal) => {
        const response = await fetch(server.url, {
          method: 'DELETE',
          headers: requestHeaders(server, entry),
          signal,
        });
        if (!response.ok && response.status !== 404 && response.status !== 405) {
          throw httpError(response.status, response.statusText, '');
        }
        return true;
      });
    } catch {
      // Session teardown is best effort: the local cache is cleared regardless.
    }
  }

  resetSession(server);
  return { ok: true };
}

function ensureEntryOnly(server) {
  return sessions.get(sessionKey(server)) || null;
}

/**
 * Inspect the cached session for diagnostics and tests.
 */
export function describeSession(server) {
  const entry = ensureEntryOnly(server);
  if (!entry) return null;
  return {
    sessionId: entry.sessionId,
    protocolVersion: entry.protocolVersion,
    serverInfo: entry.serverInfo,
    capabilities: entry.capabilities,
    initializedAt: entry.initializedAt,
  };
}

export default {
  PROTOCOL_VERSION,
  SUPPORTED_PROTOCOL_VERSIONS,
  ensureSession,
  call,
  resetSession,
  closeSession,
  describeSession,
};
