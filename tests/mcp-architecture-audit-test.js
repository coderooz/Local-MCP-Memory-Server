#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert';

import {
  getRuntimeFilePath,
  resolveProjectContext,
  scanActiveMcpServers,
  isPortAlive
} from '../core/config/runtime-state.js';
import {
  getConnectionResolver,
  resetConnectionResolver,
  RECOVERY_STRATEGY
} from '../core/config/connectionResolver.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/mcp_memory';

const testResults = [];
const managedChildren = new Set();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomProjectName(prefix) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

function createProjectConfig(projectRoot, projectName, basePort) {
  const configPath = path.join(projectRoot, `${projectName}.project-mcp.json`);
  const config = {
    project: {
      name: projectName,
      scope: 'project',
      environment: 'test'
    },
    connection: {
      strategy: 'runtime-first',
      preferredPortRange: [basePort, basePort + 20],
      fallbackPorts: [basePort, basePort + 1, basePort + 2, basePort + 5],
      retry: {
        maxRetries: 5,
        backoff: 'exponential',
        baseDelay: 200,
        maxDelay: 3200
      },
      healthCheck: {
        enabled: true,
        timeout: 5000,
        retries: 3,
        interval: 1000
      }
    },
    features: {
      multiAgent: true
    }
  };

  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
}

function createTempProject(prefix, basePort) {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), `mcp-${prefix}-`));
  const projectName = randomProjectName(prefix);
  fs.writeFileSync(path.join(projectRoot, '.mcp-project'), `${projectName}\n`, 'utf8');
  createProjectConfig(projectRoot, projectName, basePort);
  return { projectRoot, projectName };
}

function spawnNode(scriptRelativePath, env, { cwd = REPO_ROOT } = {}) {
  const scriptPath = path.join(REPO_ROOT, scriptRelativePath);
  const child = spawn(process.execPath, [scriptPath], {
    cwd,
    env: {
      ...process.env,
      ...env
    },
    stdio: ['pipe', 'pipe', 'pipe']
  });

  managedChildren.add(child);
  child.stdout.on('data', () => {});
  child.stderr.on('data', () => {});
  child.on('exit', () => managedChildren.delete(child));
  return child;
}

async function killChild(child, timeoutMs = 3000) {
  if (!child || child.killed || child.exitCode !== null) {
    return;
  }

  child.kill('SIGTERM');
  const start = Date.now();
  while (child.exitCode === null && Date.now() - start < timeoutMs) {
    await sleep(100);
  }

  if (child.exitCode === null) {
    child.kill('SIGKILL');
    await sleep(200);
  }

  if (child.exitCode === null && process.platform === 'win32' && child.pid) {
    try {
      execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    } catch {}
  }
}

async function cleanupChildren() {
  for (const child of [...managedChildren]) {
    await killChild(child, 1000);
  }
}

async function waitFor(conditionFn, timeoutMs = 15000, intervalMs = 200) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const value = await conditionFn();
    if (value) {
      return value;
    }
    await sleep(intervalMs);
  }
  throw new Error('Timed out waiting for condition');
}

function runtimePathFor(projectRoot, projectName) {
  resolveProjectContext(projectName, projectRoot);
  return getRuntimeFilePath(projectName);
}

async function waitForRuntime(projectRoot, projectName, timeoutMs = 20000, predicate = null) {
  const runtimePath = runtimePathFor(projectRoot, projectName);
  return waitFor(async () => {
    try {
      if (!fs.existsSync(runtimePath)) {
        return null;
      }
      const parsed = JSON.parse(fs.readFileSync(runtimePath, 'utf8'));
      if (
        parsed &&
        typeof parsed.port === 'number' &&
        typeof parsed.pid === 'number' &&
        typeof parsed.signature === 'string' &&
        parsed.signature.length > 0
      ) {
        if (predicate && !predicate(parsed)) {
          return null;
        }
        return parsed;
      }
      return null;
    } catch {
      return null;
    }
  }, timeoutMs);
}

async function waitForHealth(runtime, projectName, timeoutMs = 10000) {
  return waitFor(async () => {
    try {
      const response = await fetch(`http://localhost:${runtime.port}/health`, {
        method: 'GET',
        headers: { 'X-MCP-Health-Check': 'true' }
      });
      if (!response.ok) {
        return null;
      }
      const data = await response.json();
      if (data.service !== 'MCP') {
        return null;
      }
      if (data.project !== projectName) {
        return null;
      }
      if (!data.signature || data.signature !== runtime.signature) {
        return null;
      }
      return data;
    } catch {
      return null;
    }
  }, timeoutMs);
}

async function runTest(name, fn) {
  const start = Date.now();
  try {
    await fn();
    testResults.push({ name, status: 'PASS', durationMs: Date.now() - start });
    process.stderr.write(`PASS ${name}\n`);
  } catch (error) {
    testResults.push({
      name,
      status: 'FAIL',
      durationMs: Date.now() - start,
      error: error.message
    });
    process.stderr.write(`FAIL ${name}: ${error.message}\n`);
  }
}

await runTest('Test 1 - Multi-Agent Same Project', async () => {
  const { projectRoot, projectName } = createTempProject('same-project', 48100);
  const commonEnv = {
    MCP_PROJECT_ROOT: projectRoot,
    MCP_PROJECT: projectName,
    MCP_SCOPE: 'project',
    MONGO_URI,
    PORT: '0'
  };

  const agents = [
    spawnNode('mcp-server.js', { ...commonEnv, MCP_AGENT: 'agent-a' }),
    spawnNode('mcp-server.js', { ...commonEnv, MCP_AGENT: 'agent-b' }),
    spawnNode('mcp-server.js', { ...commonEnv, MCP_AGENT: 'agent-c' })
  ];

  const runtime = await waitForRuntime(projectRoot, projectName, 30000);
  await waitForHealth(runtime, projectName, 10000);

  const servers = await waitFor(
    async () => {
      const found = await scanActiveMcpServers({ expectedProject: projectName });
      return found.length > 0 ? found : null;
    },
    10000
  );

  assert.strictEqual(servers.length, 1, 'Expected exactly one MCP server for shared project');
  assert.strictEqual(servers[0].port, runtime.port, 'Runtime port must match discovered server');

  for (const agent of agents) {
    await killChild(agent);
  }
});

await runTest('Test 2 - Multi-Project Isolation', async () => {
  const projectA = createTempProject('project-a', 48200);
  const projectB = createTempProject('project-b', 48300);

  const serverA = spawnNode('server.js', {
    MCP_PROJECT_ROOT: projectA.projectRoot,
    MCP_PROJECT: projectA.projectName,
    MCP_SCOPE: 'project',
    MONGO_URI,
    PORT: '0'
  });

  const serverB = spawnNode('server.js', {
    MCP_PROJECT_ROOT: projectB.projectRoot,
    MCP_PROJECT: projectB.projectName,
    MCP_SCOPE: 'project',
    MONGO_URI,
    PORT: '0'
  });

  const runtimeA = await waitForRuntime(projectA.projectRoot, projectA.projectName, 30000);
  const runtimeB = await waitForRuntime(projectB.projectRoot, projectB.projectName, 30000);

  await waitForHealth(runtimeA, projectA.projectName, 10000);
  await waitForHealth(runtimeB, projectB.projectName, 10000);

  assert.notStrictEqual(runtimeA.port, runtimeB.port, 'Projects must not share the same port');
  assert.notStrictEqual(runtimeA.signature, runtimeB.signature, 'Projects must not share signature');

  await killChild(serverA);
  await killChild(serverB);
});

await runTest('Test 3 - Crash Recovery', async () => {
  const { projectRoot, projectName } = createTempProject('crash-recovery', 48400);
  const env = {
    MCP_PROJECT_ROOT: projectRoot,
    MCP_PROJECT: projectName,
    MCP_SCOPE: 'project',
    MONGO_URI,
    PORT: '0'
  };

  const server = spawnNode('server.js', env);
  const runtimeBefore = await waitForRuntime(projectRoot, projectName, 30000);
  await waitForHealth(runtimeBefore, projectName, 10000);

  await killChild(server, 1000);
  await waitFor(async () => !(await isPortAlive(runtimeBefore.port)), 10000, 250);

  const runtimePath = runtimePathFor(projectRoot, projectName);
  fs.writeFileSync(runtimePath, JSON.stringify(runtimeBefore, null, 2), 'utf8');

  const agent = spawnNode('mcp-server.js', { ...env, MCP_AGENT: 'recovery-agent' });
  const runtimeAfter = await waitForRuntime(
    projectRoot,
    projectName,
    30000,
    (runtime) => runtime.signature !== runtimeBefore.signature || runtime.pid !== runtimeBefore.pid
  );
  await waitForHealth(runtimeAfter, projectName, 10000);

  const pidChanged = runtimeAfter.pid !== runtimeBefore.pid;
  const signatureChanged = runtimeAfter.signature !== runtimeBefore.signature;
  assert.ok(
    pidChanged || signatureChanged,
    'Recovered runtime must reflect a fresh server identity (pid or signature change)'
  );

  await killChild(agent);
});

await runTest('Test 4 - Runtime Corruption Auto-Recovery', async () => {
  const { projectRoot, projectName } = createTempProject('corrupt-runtime', 48500);
  const env = {
    MCP_PROJECT_ROOT: projectRoot,
    MCP_PROJECT: projectName,
    MCP_SCOPE: 'project',
    MONGO_URI,
    PORT: '0'
  };

  const server = spawnNode('server.js', env);
  const runtimeBefore = await waitForRuntime(projectRoot, projectName, 30000);
  await waitForHealth(runtimeBefore, projectName, 10000);

  const runtimePath = runtimePathFor(projectRoot, projectName);
  fs.writeFileSync(runtimePath, '{corrupted-json', 'utf8');

  resetConnectionResolver();
  const resolver = getConnectionResolver({
    projectName,
    projectRoot,
    recoveryStrategy: RECOVERY_STRATEGY.SCAN,
    maxRetries: 5
  });
  const resolved = await resolver.resolveConnection();
  assert.strictEqual(resolved.success, true, 'Resolver should recover corrupted runtime');

  const runtimeAfter = await waitForRuntime(projectRoot, projectName, 15000);
  assert.strictEqual(runtimeAfter.port, runtimeBefore.port, 'Recovered runtime should keep active server');
  await waitForHealth(runtimeAfter, projectName, 10000);

  await killChild(server);
});

await runTest('Test 5 - VSCode Runtime Path/Null Safety', async () => {
  const { projectRoot, projectName } = createTempProject('vscode-path', 48600);
  const env = {
    MCP_PROJECT_ROOT: projectRoot,
    MCP_PROJECT: projectName,
    MCP_SCOPE: 'project',
    MONGO_URI,
    PORT: '0'
  };

  const server = spawnNode('server.js', env);
  await waitForRuntime(projectRoot, projectName, 30000);

  resolveProjectContext(projectName, projectRoot);
  const runtimePath = getRuntimeFilePath(projectName);
  assert.ok(runtimePath, 'Runtime path must not be null');
  assert.strictEqual(path.isAbsolute(runtimePath), true, 'Runtime path must be absolute');
  assert.strictEqual(
    runtimePath.startsWith(projectRoot),
    true,
    'Runtime path must resolve inside project root'
  );

  resetConnectionResolver();
  const resolver = getConnectionResolver({
    projectName,
    projectRoot,
    recoveryStrategy: RECOVERY_STRATEGY.SCAN,
    maxRetries: 5
  });
  const resolved = await resolver.resolveConnection();
  assert.strictEqual(resolved.success, true, 'Resolver should return non-null runtime connection');
  assert.strictEqual(typeof resolved.port, 'number', 'Resolved port must be numeric');

  await killChild(server);
});

await cleanupChildren();

const passed = testResults.filter((r) => r.status === 'PASS').length;
const failed = testResults.filter((r) => r.status === 'FAIL').length;

process.stderr.write('\nArchitecture Validation Summary\n');
for (const result of testResults) {
  if (result.status === 'PASS') {
    process.stderr.write(`- PASS: ${result.name} (${result.durationMs}ms)\n`);
  } else {
    process.stderr.write(`- FAIL: ${result.name} (${result.durationMs}ms) :: ${result.error}\n`);
  }
}

if (failed > 0) {
  process.stderr.write(`\nResult: ${passed} passed, ${failed} failed\n`);
  process.exit(1);
}

process.stderr.write(`\nResult: ${passed} passed, ${failed} failed\n`);
process.exit(0);
