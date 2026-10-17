/**
 * MCP Registry — HTTP Proxy
 *
 * Shared JSON-RPC proxy used by the business-logic layer (index.js) and the
 * HTTP routes (routes.js). Provides:
 *   - auth header injection from RAW (unmasked) credentials
 *   - per-server circuit breaker: closed → open → half-open
 *   - bounded, named timeout policy per operation type (no magic numbers)
 *
 * Connection reuse: relies on Node's global fetch (undici) keep-alive agent,
 * which pools connections per origin — no extra dependency required.
 *
 * Security: callers MUST pass the raw server record (getServerRaw) so real
 * credentials are sent upstream; route/tool outputs must never echo them.
 */

// ---------------------------------------------------------------------------
// Timeout policy (named constants)
// ---------------------------------------------------------------------------

export const TIMEOUTS = Object.freeze({
  health: 5000,
  toolCall: 10000,
  discovery: 15000,
  default: 10000,
});

// ---------------------------------------------------------------------------
// Circuit breaker (in-memory, per server_id)
// ---------------------------------------------------------------------------

export const BREAKER_DEFAULTS = Object.freeze({
  failureThreshold: 5, // consecutive failures before opening
  coolOffMs: 30000, // how long the breaker stays open before probing
  halfOpenMaxCalls: 1, // probe requests allowed while half-open
});

let breakerConfig = { ...BREAKER_DEFAULTS };

const breakers = new Map();
// entry: { state, failures, openedAt, probesInFlight, lastError }

/**
 * Tune breaker thresholds (ops/testing). Omitted fields keep current values.
 */
export function configureCircuitBreaker(overrides = {}) {
  breakerConfig = { ...breakerConfig, ...overrides };
}

function getEntry(serverId) {
  let entry = breakers.get(serverId);
  if (!entry) {
    entry = { state: 'closed', failures: 0, openedAt: 0, probesInFlight: 0, lastError: null };
    breakers.set(serverId, entry);
  }
  return entry;
}

function transitionToHalfOpenIfReady(entry) {
  if (entry.state === 'open' && Date.now() - entry.openedAt >= breakerConfig.coolOffMs) {
    entry.state = 'half-open';
    entry.probesInFlight = 0;
  }
}

/**
 * Inspect breaker state. Returns:
 *   { open: boolean, state, retryAfterMs, lastError }
 * `open: true` means the next call should fail fast.
 */
export function getCircuitState(serverId) {
  const entry = getEntry(serverId);
  transitionToHalfOpenIfReady(entry);

  if (entry.state === 'open') {
    const elapsed = Date.now() - entry.openedAt;
    return {
      open: true,
      state: 'open',
      retryAfterMs: Math.max(0, breakerConfig.coolOffMs - elapsed),
      lastError: entry.lastError,
    };
  }

  if (entry.state === 'half-open' && entry.probesInFlight >= breakerConfig.halfOpenMaxCalls) {
    // A probe is already in flight — fail fast rather than pile on.
    return { open: true, state: 'half-open', retryAfterMs: 0, lastError: entry.lastError };
  }

  return { open: false, state: entry.state, retryAfterMs: 0, lastError: entry.lastError };
}

function recordSuccess(serverId) {
  const entry = getEntry(serverId);
  entry.state = 'closed';
  entry.failures = 0;
  entry.openedAt = 0;
  entry.probesInFlight = 0;
  entry.lastError = null;
}

function recordFailure(serverId, error) {
  const entry = getEntry(serverId);
  entry.failures += 1;
  entry.lastError = error?.message || String(error);

  if (entry.state === 'half-open') {
    // Probe failed — reopen immediately.
    entry.state = 'open';
    entry.openedAt = Date.now();
    entry.probesInFlight = 0;
    return;
  }

  if (entry.state === 'closed' && entry.failures >= breakerConfig.failureThreshold) {
    entry.state = 'open';
    entry.openedAt = Date.now();
  }
}

/**
 * Reset the breaker for a server (config change, unregister, manual recovery).
 */
export function resetCircuitBreaker(serverId) {
  breakers.delete(serverId);
}

function createCircuitOpenError(serverId, retryAfterMs) {
  const err = new Error(
    `Circuit open for server ${serverId} — failing fast, retry after ${Math.max(
      1,
      Math.ceil(retryAfterMs / 1000)
    )}s`
  );
  err.code = 'CIRCUIT_OPEN';
  err.retryAfterMs = retryAfterMs;
  return err;
}

/**
 * Scrub credentials from error text before it reaches logs or API responses.
 * Redacts query-string secrets (?api_key=..., &token=...) and anything that
 * looks like an auth header value (Bearer/ApiKey/Basic <value>).
 */
export function scrubSecrets(message) {
  if (typeof message !== 'string') return message;
  return message
    .replace(/([?&](?:api_key|apikey|key|token|secret|password|auth)=)[^&\s'"]+/gi, '$1[REDACTED]')
    .replace(/\b(Bearer|ApiKey|Basic)\s+[A-Za-z0-9+/=._~-]{6,}/gi, '$1 [REDACTED]');
}

// ---------------------------------------------------------------------------
// Auth header injection (raw credentials — internal use only)
// ---------------------------------------------------------------------------

export function buildHeaders(server) {
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  if (server.auth_type && server.auth_type !== 'none' && server.auth_config) {
    const config =
      typeof server.auth_config === 'string' ? JSON.parse(server.auth_config) : server.auth_config;

    switch (server.auth_type) {
      case 'api_key':
        if (config.key_header && config.key_value) {
          headers[config.key_header] = config.key_value;
        } else if (config.key_value) {
          headers['Authorization'] = `ApiKey ${config.key_value}`;
        }
        break;
      case 'bearer':
        if (config.token) {
          headers['Authorization'] = `Bearer ${config.token}`;
        }
        break;
      case 'basic':
        if (config.username && config.password) {
          const encoded = Buffer.from(`${config.username}:${config.password}`).toString('base64');
          headers['Authorization'] = `Basic ${encoded}`;
        }
        break;
    }
  }

  return headers;
}

// ---------------------------------------------------------------------------
// JSON-RPC request with breaker + timeout policy
// ---------------------------------------------------------------------------

/**
 * Send a JSON-RPC request to an MCP server.
 *
 * @param {object} server - RAW server record (getServerRaw) — never masked
 * @param {object} jsonRpcBody - { method, params } (id/jsonrpc added automatically)
 * @param {number} timeoutMs - bounded timeout; defaults to TIMEOUTS.default
 * @returns {Promise<object>} parsed JSON-RPC response
 * @throws {Error} with `code: 'CIRCUIT_OPEN'` + `retryAfterMs` when failing fast,
 *                 or an upstream/timeout error after recording breaker failure
 */
export async function proxyRequest(server, jsonRpcBody, timeoutMs = TIMEOUTS.default) {
  const serverId = server.server_id || server.id;
  const url = server.url;
  if (!url) throw new Error('Server URL not configured');

  const circuit = getCircuitState(serverId);
  if (circuit.open) {
    throw createCircuitOpenError(serverId, circuit.retryAfterMs);
  }

  const headers = buildHeaders(server);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const entry = breakers.get(serverId);
  const wasHalfOpen = entry?.state === 'half-open';
  if (wasHalfOpen) entry.probesInFlight += 1;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        ...jsonRpcBody,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    recordSuccess(serverId);
    return data;
  } catch (err) {
    if (err.code === 'CIRCUIT_OPEN') throw err;

    const failure =
      err.name === 'AbortError' ? new Error(`Request timed out after ${timeoutMs}ms`) : err;
    failure.message = scrubSecrets(failure.message);
    recordFailure(serverId, failure);
    throw failure;
  } finally {
    clearTimeout(timer);
    if (wasHalfOpen) {
      const current = breakers.get(serverId);
      if (current) current.probesInFlight = Math.max(0, current.probesInFlight - 1);
    }
  }
}
