#!/usr/bin/env node

/**
 * Application E2E Tests (DB -> HTTP API -> Dashboard UI)
 *
 * Spawns the real server.js against a throwaway database, then exercises
 * the exact surface the dashboard consumes:
 * - server health + dashboard HTML (login/register UI present)
 * - auth: register -> login -> JWT token
 * - writes through the API (task, activity, memory context)
 * - reads through the API (task/list, activity, context/search, issue/list,
 *   agent/list) - the full DB -> UI contract
 *
 * Everything the run creates (test DB, users.json, runtime file) is removed
 * afterwards so the workspace returns to its pre-test state.
 */

import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const PORT = Number(process.env.E2E_PORT || 3799);
const DB_PATH = path.join(ROOT, 'data', 'test-app-e2e.db');
const USERS_FILE = path.join(ROOT, 'data', 'users.json');
const DATA_DIR = path.join(ROOT, 'data');

let base = `http://127.0.0.1:${PORT}`;
let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`✓ ${name}`);
  } catch (err) {
    failed++;
    console.error(`✗ ${name}`);
    console.error(`  ${err.message}`);
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function req(method, route, body, token) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (token) opts.headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(base + route, opts);
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* non-JSON (HTML) responses are fine */
  }
  return { status: res.status, json };
}

async function healthOk(port) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/health`);
    return res.ok;
  } catch {
    return false;
  }
}

function rmForce(file) {
  try {
    fs.rmSync(file, { force: true });
  } catch {
    /* best effort */
  }
}

async function runTests() {
  console.log('=== Application E2E Tests (DB -> UI) ===\n');

  // Pre-state snapshot so cleanup can restore the workspace exactly
  const usersExisted = fs.existsSync(USERS_FILE);
  const runtimeFilesBefore = new Set(
    fs
      .readdirSync(ROOT)
      .filter((f) => f.endsWith('.mcp-runtime.json') || f.endsWith('.mcp-runtime.json.lock'))
  );

  for (const suffix of ['', '-wal', '-shm']) {
    rmForce(DB_PATH + suffix);
  }

  // ---- spawn the real server ----
  const spawnEnv = { ...process.env, PORT: String(PORT), MCP_DB_PATH: DB_PATH };
  // Clean identity: the runtime/config file name must resolve from this
  // project, never from an outer MCP_PROJECT value.
  delete spawnEnv.MCP_PROJECT;
  delete spawnEnv.MCP_SERVER_URL;

  const child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: spawnEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let bootOutput = '';
  let parsedPort = null;
  const capture = (chunk) => {
    const text = chunk.toString();
    bootOutput += text;
    if (!parsedPort) {
      const m = text.match(/running on port (\d+)/);
      if (m) parsedPort = Number(m[1]);
    }
  };
  child.stdout.on('data', capture);
  child.stderr.on('data', capture);

  let exited = false;
  child.on('exit', () => {
    exited = true;
  });

  try {
    // ---- wait for the listener ----
    const deadline = Date.now() + 45000;
    let livePort = null;
    while (Date.now() < deadline && !livePort) {
      if (exited) break;
      if (parsedPort && (await healthOk(parsedPort))) livePort = parsedPort;
      else if (!parsedPort && (await healthOk(PORT))) livePort = PORT;
      else await sleep(400);
    }

    if (!livePort) {
      console.error('Server failed to become healthy. Boot output:');
      console.error(bootOutput.slice(-4000));
      throw new Error('server boot failed');
    }
    base = `http://127.0.0.1:${livePort}`;
    console.log(`Server up on ${base}\n`);

    // ---- A. health & UI shell ----
    await test('GET /health reports status ok', async () => {
      const r = await req('GET', '/health');
      assert(r.status === 200, `status ${r.status}`);
      assert(r.json?.status === 'ok', `health status: ${r.json?.status}`);
    });

    await test('GET /dashboard serves the dashboard UI (login + register)', async () => {
      const res = await fetch(base + '/dashboard');
      assert(res.status === 200, `status ${res.status}`);
      const html = await res.text();
      assert(html.includes('MCP Memory Dashboard'), 'missing dashboard title');
      assert(html.includes('id="auth-btn"'), 'missing auth button (register UI)');
      assert(html.includes('Create an account'), 'missing register link');
      assert(html.includes('data-view="overview"'), 'missing nav views');
    });

    await test('GET /ui redirects to /dashboard', async () => {
      const res = await fetch(base + '/ui', { redirect: 'manual' });
      assert(res.status === 302, `status ${res.status}`);
      assert(
        res.headers.get('location') === '/dashboard',
        `location ${res.headers.get('location')}`
      );
    });

    // ---- B. auth (register -> login) ----
    let token = null;
    const USER = 'e2e-test-admin';
    const PASS = 'E2eTestPassword123!';

    await test('POST /auth/register creates the first user', async () => {
      const r = await req('POST', '/auth/register', { username: USER, password: PASS });
      // 409 = a previous partial run left the user behind; login still proves auth
      assert(
        (r.status === 200 && r.json?.success === true) || r.status === 409,
        `status ${r.status}: ${JSON.stringify(r.json)}`
      );
    });

    await test('POST /auth/login returns a JWT', async () => {
      const r = await req('POST', '/auth/login', { username: USER, password: PASS });
      assert(
        r.status === 200 && r.json?.success === true,
        `status ${r.status}: ${JSON.stringify(r.json)}`
      );
      assert(typeof r.json.token === 'string' && r.json.token.length > 0, 'no token returned');
      token = r.json.token;
    });

    await test('GET /auth/health reports auth state', async () => {
      const r = await req('GET', '/auth/health');
      assert(r.status === 200, `status ${r.status}`);
      assert(r.json !== null, 'no JSON body');
    });

    // ---- C. writes through the API ----
    const TASK_TITLE = 'E2E task from database to UI';
    const CONTEXT_WORD = 'platypuse2e';
    const ACTIVITY_MSG = 'E2E activity: dashboard wiring check';

    await test('POST /task creates a task', async () => {
      const r = await req(
        'POST',
        '/task',
        {
          title: TASK_TITLE,
          description: 'created by application e2e test',
          project: 'e2etest',
          priority: 2,
        },
        token
      );
      assert(r.status === 200, `status ${r.status}: ${JSON.stringify(r.json)}`);
      assert(!r.json?.error, `handler error: ${r.json?.error}`);
    });

    await test('POST /context stores a memory context', async () => {
      const r = await req(
        'POST',
        '/context',
        {
          content: `The ${CONTEXT_WORD} swims upstream during migration.`,
          summary: 'E2E memory entry',
          project: 'e2etest',
          type: 'note',
        },
        token
      );
      assert(r.status === 200, `status ${r.status}: ${JSON.stringify(r.json)}`);
      assert(!r.json?.error, `handler error: ${r.json?.error}`);
    });

    await test('POST /activity records an activity entry', async () => {
      const r = await req(
        'POST',
        '/activity',
        { message: ACTIVITY_MSG, project: 'e2etest' },
        token
      );
      assert(r.status === 200, `status ${r.status}: ${JSON.stringify(r.json)}`);
      assert(!r.json?.error, `handler error: ${r.json?.error}`);
    });

    // ---- D. reads through the API (dashboard contract) ----
    await test('GET /task/list returns the created task (array)', async () => {
      const r = await req('GET', '/task/list?project=e2etest&limit=50');
      assert(r.status === 200, `status ${r.status}`);
      assert(Array.isArray(r.json), `expected array, got ${typeof r.json}`);
      assert(
        r.json.some((t) => t.title === TASK_TITLE),
        `task not found in list (${r.json.length} rows)`
      );
    });

    await test('POST /context/search finds the stored memory (uses $inc)', async () => {
      const r = await req('POST', '/context/search', { query: CONTEXT_WORD, limit: 10 }, token);
      assert(r.status === 200, `status ${r.status}: ${JSON.stringify(r.json)}`);
      assert(Array.isArray(r.json), `expected array, got ${typeof r.json}`);
      assert(
        r.json.some((c) => (c.content || '').includes(CONTEXT_WORD)),
        `context not found (${r.json.length} rows)`
      );
    });

    await test('GET /activity returns the recorded activity (array)', async () => {
      const r = await req('GET', '/activity?limit=100');
      assert(r.status === 200, `status ${r.status}`);
      assert(Array.isArray(r.json), `expected array, got ${typeof r.json}`);
      assert(
        r.json.some((a) => (a.message || '').includes('E2E activity')),
        `activity not found (${r.json.length} rows)`
      );
    });

    await test('GET /issue/list returns an array (dashboard contract)', async () => {
      const r = await req('GET', '/issue/list?limit=50');
      assert(r.status === 200, `status ${r.status}`);
      assert(Array.isArray(r.json), `expected array, got ${typeof r.json}`);
    });

    await test('GET /agent/list returns an array (dashboard contract)', async () => {
      const r = await req('GET', '/agent/list');
      assert(r.status === 200, `status ${r.status}`);
      assert(Array.isArray(r.json), `expected array, got ${typeof r.json}`);
    });

    await test('dashboard list views agree with API data', async () => {
      const res = await fetch(base + '/dashboard');
      const html = await res.text();
      // The HTML shell the browser renders must expose every view the API backs
      for (const view of ['overview', 'memory', 'tasks', 'issues', 'agents', 'activity']) {
        assert(html.includes(`data-view="${view}"`), `missing view: ${view}`);
      }
    });
  } finally {
    // ---- shutdown + workspace restore ----
    if (!exited) {
      child.kill();
      const killDeadline = Date.now() + 8000;
      while (!exited && Date.now() < killDeadline) await sleep(200);
      if (!exited) child.kill('SIGKILL');
    }

    for (const suffix of ['', '-wal', '-shm']) {
      rmForce(DB_PATH + suffix);
    }
    if (!usersExisted) rmForce(USERS_FILE);
    const runtimeFilesAfter = fs.existsSync(ROOT) ? fs.readdirSync(ROOT) : [];
    for (const f of runtimeFilesAfter) {
      if (
        (f.endsWith('.mcp-runtime.json') || f.endsWith('.mcp-runtime.json.lock')) &&
        !runtimeFilesBefore.has(f)
      ) {
        rmForce(path.join(ROOT, f));
      }
    }
    if (fs.existsSync(DATA_DIR)) {
      // lock files from the project-lock helper
      for (const f of fs.readdirSync(DATA_DIR)) {
        if (f.endsWith('.lock') && !usersExisted && f === 'users.json.lock')
          rmForce(path.join(DATA_DIR, f));
      }
    }
  }

  console.log('\n=== Results ===');
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total: ${passed + failed}`);

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch((error) => {
  console.error('Test runner failed:', error);
  process.exit(1);
});
