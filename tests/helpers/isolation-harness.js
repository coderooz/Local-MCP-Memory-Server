#!/usr/bin/env node

/**
 * WP-A Isolation & Contract Verification Harness
 *
 * Boots the REAL active runtime (the Express app defined in server.js) against
 * throwaway resources:
 *
 *   - SQLite database      -> MCP_DB_PATH     -> <temp>/data/mcp-memory.db
 *   - project root         -> MCP_PROJECT_ROOT-> <temp>/project
 *   - project identity     -> MCP_PROJECT / MCP_AGENT
 *   - HTTP listener        -> 127.0.0.1 on an OS-assigned ephemeral port
 *
 * Safety properties (relied upon by every suite that uses this harness):
 *   - loopback only; never binds 0.0.0.0 / ::
 *   - ephemeral port only; never 3799 and never the 47000-47020 range
 *   - never reads or writes ./data, users.json or the user runtime state
 *   - never probes a pre-running server: it starts its own listener and only
 *     ever talks to 127.0.0.1:<ephemeral>
 *
 * The harness deliberately does NOT call startServer(): that path allocates a
 * port from the shared 47000-47020 range and can "reuse" an already-running
 * instance for the same project name. The harness injects the database into
 * the app directly (app.locals.db) and owns its own listener instead.
 */

import fs from 'fs';
import http from 'http';
import net from 'net';
import os from 'os';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..', '..');

/**
 * The app applies a per-IP rate limiter of 120 requests/minute. Suites must
 * stay well below that, otherwise requests start failing with HTTP 429.
 */
export const REQUEST_BUDGET = 100;

const HARNESS_ENV_KEYS = ['MCP_DB_PATH', 'MCP_PROJECT_ROOT', 'MCP_PROJECT', 'MCP_AGENT'];

function slug(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .slice(0, 60);
}

function importFromRoot(relativePath) {
  return import(pathToFileURL(path.join(ROOT, relativePath)).href);
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const timer = setTimeout(() => {
      socket.destroy();
      resolve(false);
    }, 1000);

    socket.once('connect', () => {
      clearTimeout(timer);
      socket.destroy();
      resolve(false);
    });
    socket.once('error', () => {
      clearTimeout(timer);
      socket.destroy();
      resolve(true);
    });
    socket.connect(port, '127.0.0.1');
  });
}

/**
 * Boots an isolated runtime and returns a handle used by the suites.
 *
 * @param {object} options
 * @param {string} [options.label]    Short label used in temp paths / identity
 * @param {string} [options.project]  Explicit project identity for the run
 * @returns {Promise<object>} harness handle
 */
export async function createHarness({ label = 'harness', project } = {}) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), `wp-a-${slug(label)}-`));
  const dbDir = path.join(tempRoot, 'data');
  const projectRoot = path.join(tempRoot, 'project');

  fs.mkdirSync(dbDir, { recursive: true });
  fs.mkdirSync(projectRoot, { recursive: true });

  const dbPath = path.join(dbDir, 'mcp-memory.db');
  const identity = slug(project || `wp-a-${label}-${process.pid}`);

  const previousEnv = {};
  for (const key of HARNESS_ENV_KEYS) {
    previousEnv[key] = process.env[key];
  }

  process.env.MCP_DB_PATH = dbPath;
  process.env.MCP_PROJECT_ROOT = projectRoot;
  process.env.MCP_PROJECT = identity;
  process.env.MCP_AGENT = 'wp-a-harness';

  const { app } = await importFromRoot('server.js');
  const { initializeDatabase, disconnectDatabase } = await importFromRoot(
    'src/core/database/sqlite/index.js'
  );
  const { initLogger, logError } = await importFromRoot('shared/utils/logger.js');

  const db = await initializeDatabase(dbPath);

  initLogger(db);
  app.locals.db = db;
  app.locals.logError = logError;

  const httpServer = http.createServer(app);

  await new Promise((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(0, '127.0.0.1', () => resolve());
  });

  const address = httpServer.address();
  const port = typeof address === 'object' && address ? address.port : null;
  const baseUrl = `http://127.0.0.1:${port}`;

  let requestCount = 0;
  let closed = false;

  /**
   * Performs one HTTP request against the ephemeral loopback listener.
   *
   * @param {string} method
   * @param {string} route
   * @param {object} [options]
   * @param {object} [options.body]
   * @param {object} [options.headers]
   * @param {string} [options.token]
   * @returns {Promise<{status:number, json:object|null, text:string}>}
   */
  async function request(method, route, { body, headers = {}, token } = {}) {
    if (closed) {
      throw new Error('harness.request() called after harness.close()');
    }

    requestCount += 1;

    if (requestCount > REQUEST_BUDGET) {
      throw new Error(
        `harness request budget (${REQUEST_BUDGET}) exceeded: the per-IP rate limiter ` +
          '(120/min) would start rejecting requests. Reduce the number of HTTP calls.'
      );
    }

    const options = { method, headers: { 'Content-Type': 'application/json', ...headers } };
    if (token) {
      options.headers.Authorization = `Bearer ${token}`;
    }
    if (body !== undefined) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(baseUrl + route, options);
    const text = await response.text();
    let json = null;

    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }

    if (response.status === 429) {
      throw new Error(
        'HTTP 429 from the rate limiter: the suite issued too many requests for one agent key. ' +
          'Use a distinct agent id per test group.'
      );
    }

    return { status: response.status, json, text };
  }

  /**
   * Reads directly from the isolated database (storage-level verification).
   *
   * @param {string} collection
   * @param {object} [filter]
   * @returns {Promise<object[]>}
   */
  async function readCollection(collection, filter = {}) {
    return db.collection(collection).find(filter).toArray();
  }

  /**
   * Shuts the harness down and returns teardown evidence.
   *
   * @returns {Promise<object>}
   */
  async function close() {
    if (closed) {
      return { alreadyClosed: true };
    }
    closed = true;

    await new Promise((resolve) => httpServer.close(resolve));

    const evidence = {
      listenerClosed: !httpServer.listening,
      portReleased: await isPortFree(port),
      requestsIssued: requestCount,
    };

    await disconnectDatabase();
    evidence.databaseClosed = true;

    for (const key of HARNESS_ENV_KEYS) {
      if (previousEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previousEnv[key];
      }
    }
    evidence.envRestored = true;

    fs.rmSync(tempRoot, { recursive: true, force: true });
    evidence.tempRootRemoved = !fs.existsSync(tempRoot);
    evidence.dbFileRemoved = !fs.existsSync(dbPath);
    evidence.projectRootRemoved = !fs.existsSync(projectRoot);

    return evidence;
  }

  return {
    app,
    baseUrl,
    close,
    db,
    dbPath,
    identity,
    port,
    projectRoot,
    readCollection,
    request,
    getRequestCount: () => requestCount,
    tempRoot,
  };
}

/**
 * Detects a cross-project leak in a by-id read response.
 *
 * @param {object} responseJson Parsed response body of a by-id read
 * @param {string} callerProject Project the caller claims
 * @returns {{leaked:boolean, ownerProject:string|null, callerProject:string}}
 */
export function detectByIdProjectLeak(responseJson, callerProject) {
  const context = responseJson && responseJson.context ? responseJson.context : null;

  if (!context) {
    return { leaked: false, ownerProject: null, callerProject };
  }

  const ownerProject = context.project || null;

  return {
    leaked: ownerProject !== null && ownerProject !== callerProject,
    ownerProject,
    callerProject,
  };
}

/**
 * Detects a cross-project mutation by comparing the stored document before and
 * after an update attempt.
 *
 * @param {object} before Stored document before the attempt
 * @param {object} after Stored document after the attempt
 * @returns {{mutated:boolean, field:string|null}}
 */
export function detectMutationLeak(before, after) {
  if (!before || !after) {
    return { mutated: false, field: null };
  }

  const fields = [
    'content',
    'summary',
    'lifecycle',
    'importance',
    'type',
    'title',
    'description',
    'status',
    'assigned_to',
  ];
  for (const field of fields) {
    if (before[field] !== after[field]) {
      return { mutated: true, field };
    }
  }

  return { mutated: false, field: null };
}

/**
 * Detects whether a project-scoped collection read returned a record owned by
 * another project.
 *
 * @param {object[]} records Records returned by a scoped list endpoint
 * @param {string} callerProject Project the caller claims
 * @param {string[]} [allowedProjects] Additional projects allowed in the result
 * @returns {{leaked:boolean, foreignProjects:string[]}}
 */
export function detectListLeak(records, callerProject, allowedProjects = []) {
  const allowed = new Set([callerProject, ...allowedProjects]);
  const foreign = [];

  for (const record of records || []) {
    if (record && record.project && !allowed.has(record.project)) {
      foreign.push(record.project);
    }
  }

  return { leaked: foreign.length > 0, foreignProjects: [...new Set(foreign)] };
}

/**
 * Minimal assertion helpers shared by the suites.
 */
export const assert = {
  ok(condition, message) {
    if (!condition) {
      throw new Error(message || 'Expected condition to be true');
    }
  },

  equal(actual, expected, message) {
    if (actual !== expected) {
      throw new Error(`${message || 'Values differ'} | expected: ${expected} | actual: ${actual}`);
    }
  },

  notEqual(actual, unexpected, message) {
    if (actual === unexpected) {
      throw new Error(`${message || 'Values must differ'} | both: ${actual}`);
    }
  },

  includes(haystack, needle, message) {
    if (typeof haystack !== 'string' || !haystack.includes(needle)) {
      throw new Error(`${message || 'Missing expected content'}`);
    }
  },
};

/**
 * Test runner with three explicit outcome kinds:
 *
 *   test()        - the contract must hold; a failure fails the suite
 *   characterize()- records observed semantics; asserts structure only
 *   gap()         - asserts the DESIRED invariant; a failure means the known
 *                   production gap is still open (regression detector)
 *
 * @param {object} [options]
 * @param {string} [options.title]
 * @returns {object} runner
 */
export function createRunner({ title = 'WP-A suite' } = {}) {
  const results = [];
  let passed = 0;
  let failed = 0;
  let gaps = 0;
  let closedGaps = 0;

  async function run(kind, name, fn) {
    try {
      const observation = await fn();
      passed += 1;
      results.push({ kind, name, status: 'PASS' });

      if (kind === 'characterize') {
        const detail = observation && observation.observed ? observation.observed : '';
        console.log(`✓ [characterized] ${name}`);
        if (detail) {
          console.log(`    observed: ${detail}`);
        }
        if (observation && observation.unresolved) {
          console.log(
            '    note: semantics unresolved - pending a product decision (not a pass/fail claim)'
          );
        }
      } else if (kind === 'gap') {
        closedGaps += 1;
        console.log(`✓ [gap closed] ${name}`);
      } else {
        console.log(`✓ ${name}`);
      }
    } catch (error) {
      if (kind === 'gap') {
        gaps += 1;
        results.push({ kind, name, status: 'GAP', error: error.message });
        console.log(`✗ [gap detected] ${name}`);
        console.log(`    ${error.message}`);
      } else {
        failed += 1;
        results.push({ kind, name, status: 'FAIL', error: error.message });
        console.error(`✗ ${name}`);
        console.error(`    ${error.message}`);
      }
    }
  }

  return {
    test: (name, fn) => run('test', name, fn),
    characterize: (name, fn) => run('characterize', name, fn),
    gap: (name, fn) => run('gap', name, fn),
    results,

    /**
     * Prints the summary and returns the process exit code.
     *
     * @param {object} [options]
     * @param {boolean} [options.gapsFail] Exit non-zero while gaps are open
     * @returns {number}
     */
    finish({ gapsFail = false } = {}) {
      console.log('');
      console.log('='.repeat(60));
      console.log(`${title} - summary`);
      console.log('='.repeat(60));
      console.log(`  passed:        ${passed}`);
      console.log(`  failed:        ${failed}`);
      console.log(`  gaps detected: ${gaps}`);
      console.log(`  gaps closed:   ${closedGaps}`);

      if (failed > 0) {
        console.log('');
        console.log('Failures:');
        for (const result of results.filter((r) => r.status === 'FAIL')) {
          console.log(`  ✗ ${result.name}: ${result.error}`);
        }
      }

      if (gaps > 0) {
        console.log('');
        console.log('Open production gaps (detected, not fixed here):');
        for (const result of results.filter((r) => r.status === 'GAP')) {
          console.log(`  ✗ ${result.name}: ${result.error}`);
        }
      }

      console.log('');

      if (failed > 0) {
        return 1;
      }
      if (gapsFail && gaps > 0) {
        return 1;
      }
      return 0;
    },
  };
}
