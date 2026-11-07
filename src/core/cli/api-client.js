/**
 * HTTP client for the local memory server.
 *
 * The CLI talks to the same Express API the dashboard and MCP shim use. A
 * server may be listening on any port (dynamic allocation starts at 47000), so
 * the port is resolved from, in order: an explicit flag, `PORT`, the project
 * runtime file, and finally an active-server scan.
 */

import http from 'node:http';
import { readRuntimeFile } from '../../../core/config/runtime-state.js';
import {
  scanActiveMcpServers,
  validatePortWithHealth,
} from '../../../core/config/runtime-state.js';

const DEFAULT_TIMEOUT_MS = 10000;

function normalisePort(value) {
  if (value === null || value === undefined || value === '') return null;
  const port = Number(value);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) return null;
  return port;
}

/**
 * Perform a JSON request against a server port.
 *
 * @param {object} options
 * @param {number} options.port
 * @param {string} [options.method]
 * @param {string} options.path
 * @param {object|null} [options.body]
 * @param {string|null} [options.token] - JWT or API key
 * @param {number} [options.timeoutMs]
 * @returns {Promise<{status: number, body: any}>}
 */
export function requestJson(options) {
  const {
    port,
    method = 'GET',
    path: requestPath,
    body = null,
    token = null,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = options;

  return new Promise((resolve, reject) => {
    const payload = body === null ? null : JSON.stringify(body);
    const headers = { Accept: 'application/json' };
    if (payload) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(payload);
    }
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: requestPath,
        method,
        headers,
        timeout: timeoutMs,
      },
      (res) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          let parsed = null;
          if (data) {
            try {
              parsed = JSON.parse(data);
            } catch {
              parsed = { raw: data };
            }
          }
          resolve({ status: res.statusCode || 0, body: parsed });
        });
      }
    );

    req.on('timeout', () => {
      req.destroy(new Error(`request timed out after ${timeoutMs}ms`));
    });
    req.on('error', reject);

    if (payload) req.write(payload);
    req.end();
  });
}

/**
 * Read the project runtime file, if any. Never throws.
 *
 * @returns {object|null}
 */
export function readProjectRuntime() {
  try {
    return readRuntimeFile();
  } catch {
    return null;
  }
}

/**
 * Resolve the port of a running server.
 *
 * @param {object} [options]
 * @param {number|string|null} [options.port] - explicit override
 * @param {boolean} [options.scan] - fall back to an active-server scan
 * @returns {Promise<{port: number, source: string, project?: string, pid?: number}|null>}
 */
export async function resolveServerPort(options = {}) {
  const explicit = normalisePort(options.port);
  if (explicit) {
    return { port: explicit, source: 'flag' };
  }

  const fromEnv = normalisePort(process.env.PORT);
  if (fromEnv) {
    return { port: fromEnv, source: 'env' };
  }

  const runtime = readProjectRuntime();
  if (runtime && normalisePort(runtime.port)) {
    const validation = await validatePortWithHealth(runtime.port, {
      expectedProject: runtime.project,
      expectedSignature: runtime.signature,
      requireSignature: true,
    });
    if (validation.valid) {
      return {
        port: runtime.port,
        source: 'runtime-file',
        project: runtime.project,
        pid: runtime.pid,
      };
    }
  }

  if (options.scan !== false) {
    try {
      const servers = await scanActiveMcpServers();
      if (servers.length > 0) {
        return {
          port: servers[0].port,
          source: 'scan',
          project: servers[0].project,
          pid: servers[0].pid,
        };
      }
    } catch {
      /* scanning is best effort */
    }
  }

  return null;
}

/**
 * Fetch `/health` from a port. Returns null when the port is not an MCP server.
 *
 * @param {number} port
 * @returns {Promise<object|null>}
 */
export async function fetchHealth(port) {
  try {
    const { status, body } = await requestJson({ port, path: '/health', timeoutMs: 3000 });
    if (status !== 200 || !body || body.service !== 'MCP') return null;
    return body;
  } catch {
    return null;
  }
}

/**
 * List every MCP memory server currently listening on this machine.
 *
 * @returns {Promise<Array<{port: number, pid: number|null, project: string, uptime: number}>>}
 */
export async function listRunningServers() {
  try {
    return await scanActiveMcpServers();
  } catch {
    return [];
  }
}
