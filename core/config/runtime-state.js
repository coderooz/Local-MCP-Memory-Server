import net from 'node:net';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { exec as execCb } from 'node:child_process';
import { promisify } from 'node:util';
import { EventEmitter } from 'node:events';
import { getDiscoveryPorts, getConfigValue, PROJECT_NAME } from './project-config-loader.js';
import { findProjectRoot, slugifyProjectName } from '../../utils/projectIdentity.js';

const exec = promisify(execCb);

const RUNTIME_FILE_NAME = '.mcp-runtime.json';
const RUNTIME_LOCK_TIMEOUT = 5000;
const LOCK_RETRY_DELAY_MS = 50;
const LOCK_STALE_MS = 30000;
const PORT_CACHE_TTL = 5000;
const PROCESS_SIGNATURE = crypto.randomUUID();

let currentProjectName = null;
let currentProjectRoot = null;
let lastKnownPort = null;
let lastPortCheck = 0;

let inMemoryRuntime = {
  port: null,
  pid: null,
  startedAt: null,
  hostname: null,
  status: 'stopped',
  project: null,
  signature: null
};

const runtimeEmitter = new EventEmitter();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ensureValidPort(port) {
  return Number.isInteger(port) && port > 0 && port <= 65535;
}

function isRuntimeShape(runtime) {
  return (
    runtime &&
    typeof runtime === 'object' &&
    ensureValidPort(runtime.port) &&
    Number.isInteger(runtime.pid) &&
    runtime.pid > 0 &&
    typeof runtime.project === 'string' &&
    runtime.project.trim().length > 0 &&
    typeof runtime.signature === 'string' &&
    runtime.signature.trim().length > 0
  );
}

function resolveProjectRoot() {
  if (currentProjectRoot) {
    return currentProjectRoot;
  }

  if (process.env.MCP_PROJECT_ROOT) {
    return path.resolve(process.env.MCP_PROJECT_ROOT);
  }

  try {
    return findProjectRoot(process.cwd());
  } catch {}

  return path.resolve(process.cwd());
}

function resolveProjectName(projectName = null) {
  if (projectName) {
    return slugifyProjectName(projectName);
  }

  if (currentProjectName) {
    return currentProjectName;
  }

  if (process.env.MCP_PROJECT) {
    return slugifyProjectName(process.env.MCP_PROJECT);
  }

  if (PROJECT_NAME) {
    return slugifyProjectName(PROJECT_NAME);
  }

  return slugifyProjectName(path.basename(resolveProjectRoot()));
}

function normalizeRuntime(runtime, projectName = null) {
  const now = new Date().toISOString();
  return {
    port: runtime.port,
    pid: runtime.pid,
    startedAt: runtime.startedAt || Date.now(),
    hostname: runtime.hostname || os.hostname(),
    status: runtime.status || 'running',
    project: resolveProjectName(runtime.project || projectName),
    signature: runtime.signature || PROCESS_SIGNATURE,
    lastUpdated: now
  };
}

export function resolveProjectContext(projectName = null, projectRoot = null) {
  const resolvedRoot = path.resolve(projectRoot || resolveProjectRoot());
  const resolvedProject = resolveProjectName(projectName);
  currentProjectRoot = resolvedRoot;
  currentProjectName = resolvedProject;
  return {
    projectRoot: resolvedRoot,
    projectName: resolvedProject
  };
}

export function getRuntimeDirectory() {
  return resolveProjectRoot();
}

export function setProjectRoot(projectRoot) {
  currentProjectRoot = path.resolve(projectRoot || resolveProjectRoot());
}

export function setCurrentProject(projectName) {
  currentProjectName = resolveProjectName(projectName);
}

export function getRuntimeFilePath(projectName = null) {
  if (projectName) {
    setCurrentProject(projectName);
  }
  return path.join(getRuntimeDirectory(), RUNTIME_FILE_NAME);
}

async function acquireFileLock(filePath, timeout = RUNTIME_LOCK_TIMEOUT, staleMs = LOCK_STALE_MS) {
  const lockPath = `${filePath}.lock`;
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    try {
      const fd = await fs.promises.open(lockPath, 'wx');
      await fd.writeFile(
        JSON.stringify(
          {
            pid: process.pid,
            createdAt: Date.now()
          },
          null,
          2
        ),
        'utf8'
      );
      await fd.close();
      return lockPath;
    } catch (error) {
      if (error.code !== 'EEXIST') {
        return null;
      }

      try {
        const stats = await fs.promises.stat(lockPath);
        if (Date.now() - stats.mtimeMs > staleMs) {
          await fs.promises.unlink(lockPath);
          continue;
        }
      } catch {}

      await sleep(LOCK_RETRY_DELAY_MS);
    }
  }

  return null;
}

async function releaseFileLock(filePath) {
  const lockPath = `${filePath}.lock`;
  try {
    await fs.promises.unlink(lockPath);
    return true;
  } catch {
    return false;
  }
}

async function atomicWriteRuntimeFile(runtimeData, projectName = null) {
  const filePath = getRuntimeFilePath(projectName);
  const lockToken = await acquireFileLock(filePath);
  if (!lockToken) {
    return null;
  }

  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    const dir = path.dirname(filePath);
    await fs.promises.mkdir(dir, { recursive: true });

    const payload = normalizeRuntime(runtimeData, projectName);
    await fs.promises.writeFile(tempPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    await fs.promises.rename(tempPath, filePath);
    return filePath;
  } catch {
    try {
      await fs.promises.unlink(tempPath);
    } catch {}
    return null;
  } finally {
    await releaseFileLock(filePath);
  }
}

export function readRuntimeFile(projectName = null) {
  const filePath = getRuntimeFilePath(projectName);
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }

    const content = fs.readFileSync(filePath, 'utf8');
    if (!content || !content.trim()) {
      return null;
    }

    const runtime = JSON.parse(content);
    if (!isRuntimeShape(runtime)) {
      return null;
    }

    return normalizeRuntime(runtime, projectName);
  } catch {
    try {
      fs.unlinkSync(filePath);
    } catch {}
    return null;
  }
}

export async function deleteRuntimeFile(projectName = null, options = {}) {
  const { force = false } = options || {};
  const filePath = getRuntimeFilePath(projectName);
  const lockToken = await acquireFileLock(filePath);
  if (!lockToken) {
    return false;
  }

  try {
    if (!fs.existsSync(filePath)) {
      return true;
    }

    if (!force) {
      const runtime = readRuntimeFile(projectName);
      if (runtime && runtime.pid !== process.pid) {
        return false;
      }
    }

    await fs.promises.unlink(filePath);
    return true;
  } catch {
    return false;
  } finally {
    await releaseFileLock(filePath);
  }
}

export async function withProjectLock(lockName, fn, options = {}) {
  const { timeout = RUNTIME_LOCK_TIMEOUT } = options;
  const { projectName } = resolveProjectContext();
  const basePath = path.join(getRuntimeDirectory(), `.mcp-${projectName}-${lockName}`);
  const lockToken = await acquireFileLock(basePath, timeout);
  if (!lockToken) {
    throw new Error(`Failed to acquire lock: ${lockName}`);
  }

  try {
    return await fn();
  } finally {
    await releaseFileLock(basePath);
  }
}

export async function isValidPID(pid) {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error.code === 'ESRCH') {
      return false;
    }
    return true;
  }
}

export async function isPortAlive(port) {
  if (!ensureValidPort(port)) {
    return false;
  }

  return new Promise((resolve) => {
    const socket = new net.Socket();
    const timeout = 1000;

    const timer = setTimeout(() => {
      socket.destroy();
      resolve(false);
    }, timeout);

    socket.connect(port, '127.0.0.1', () => {
      clearTimeout(timer);
      socket.destroy();
      resolve(true);
    });

    socket.on('error', () => {
      clearTimeout(timer);
      socket.destroy();
      resolve(false);
    });
  });
}

export async function validatePortWithHealth(port, options = {}) {
  const {
    expectedProject = null,
    expectedSignature = null,
    requireSignature = false,
    timeoutMs = getConfigValue('connection.healthCheck.timeout', 5000)
  } = options;

  if (!ensureValidPort(port)) {
    return { valid: false, reason: 'invalid_port', port };
  }

  const alive = await isPortAlive(port);
  if (!alive) {
    return { valid: false, reason: 'port_not_alive', port };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetch(`http://localhost:${port}/health`, {
      method: 'GET',
      headers: { 'X-MCP-Health-Check': 'true' },
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      return { valid: false, reason: 'health_check_failed', port };
    }

    const data = await response.json();
    if (!data || data.service !== 'MCP') {
      return { valid: false, reason: 'not_mcp_server', port };
    }

    if (expectedProject && data.project && data.project !== expectedProject) {
      return {
        valid: false,
        reason: 'project_mismatch',
        port,
        expectedProject,
        observedProject: data.project
      };
    }

    if (requireSignature && (!data.signature || typeof data.signature !== 'string')) {
      return { valid: false, reason: 'missing_signature', port };
    }

    if (expectedSignature && data.signature !== expectedSignature) {
      return {
        valid: false,
        reason: 'signature_mismatch',
        port,
        expectedSignature,
        observedSignature: data.signature
      };
    }

    return {
      valid: true,
      reason: 'ok',
      port,
      data: {
        status: data.status,
        version: data.version,
        project: data.project,
        uptime: data.uptime,
        pid: data.pid,
        signature: data.signature
      }
    };
  } catch (error) {
    return {
      valid: false,
      reason: 'health_check_error',
      port,
      error: error.message
    };
  }
}

export async function validateRuntime(runtime, options = {}) {
  const {
    expectedProject = null,
    expectedSignature = null,
    requireSignature = true
  } = options;

  if (!runtime || runtime.status === 'stopped') {
    return { valid: false, reason: 'runtime_stopped' };
  }

  if (!ensureValidPort(runtime.port)) {
    return { valid: false, reason: 'missing_or_invalid_port' };
  }

  if (!Number.isInteger(runtime.pid) || runtime.pid <= 0) {
    return { valid: false, reason: 'missing_or_invalid_pid' };
  }

  const project = runtime.project || expectedProject || resolveProjectName();
  if (expectedProject && project !== expectedProject) {
    return {
      valid: false,
      reason: 'project_mismatch',
      expectedProject,
      observedProject: project
    };
  }

  if (requireSignature && (!runtime.signature || typeof runtime.signature !== 'string')) {
    return { valid: false, reason: 'missing_signature' };
  }

  if (expectedSignature && runtime.signature !== expectedSignature) {
    return {
      valid: false,
      reason: 'signature_mismatch',
      expectedSignature,
      observedSignature: runtime.signature
    };
  }

  const pidAlive = await isValidPID(runtime.pid);
  if (!pidAlive) {
    return {
      valid: false,
      reason: 'pid_not_alive',
      pid: runtime.pid
    };
  }

  const healthValidation = await validatePortWithHealth(runtime.port, {
    expectedProject: project,
    expectedSignature: runtime.signature || expectedSignature,
    requireSignature
  });

  if (!healthValidation.valid) {
    return healthValidation;
  }

  if (healthValidation.data?.pid && healthValidation.data.pid !== runtime.pid) {
    return {
      valid: false,
      reason: 'pid_mismatch',
      runtimePid: runtime.pid,
      healthPid: healthValidation.data.pid
    };
  }

  return {
    valid: true,
    reason: 'ok',
    data: {
      ...normalizeRuntime(runtime, project),
      health: healthValidation.data
    }
  };
}

async function getActiveListeningPorts() {
  const ports = new Set();

  const parseAndAdd = (candidate) => {
    const parsed = Number(candidate);
    if (Number.isInteger(parsed) && parsed > 0 && parsed <= 65535) {
      ports.add(parsed);
    }
  };

  if (process.platform === 'win32') {
    try {
      const { stdout } = await exec('netstat -ano -p tcp');
      for (const line of stdout.split(/\r?\n/)) {
        const match = line.match(/^\s*TCP\s+\S+:(\d+)\s+\S+\s+LISTENING\s+\d+\s*$/i);
        if (match) {
          parseAndAdd(match[1]);
        }
      }
    } catch {}
  } else {
    try {
      const { stdout } = await exec('lsof -nP -iTCP -sTCP:LISTEN');
      for (const line of stdout.split(/\r?\n/)) {
        const match = line.match(/:(\d+)\s+\(LISTEN\)/);
        if (match) {
          parseAndAdd(match[1]);
        }
      }
    } catch {
      try {
        const { stdout } = await exec('ss -ltn');
        for (const line of stdout.split(/\r?\n/)) {
          const match = line.match(/:(\d+)\s*$/);
          if (match) {
            parseAndAdd(match[1]);
          }
        }
      } catch {}
    }
  }

  return Array.from(ports.values()).sort((a, b) => a - b);
}

export async function scanActiveMcpServers(options = {}) {
  const { expectedProject = null, maxPorts = 64, timeoutMs = 400 } = options;
  const activePorts = await getActiveListeningPorts();
  const configuredPorts = new Set(getDiscoveryPorts() || []);
  const prioritizedPorts =
    activePorts.length > 0
      ? [...activePorts].sort((a, b) => {
          const aPreferred = configuredPorts.has(a) ? 1 : 0;
          const bPreferred = configuredPorts.has(b) ? 1 : 0;
          if (aPreferred !== bPreferred) {
            return bPreferred - aPreferred;
          }
          return a - b;
        })
      : Array.from(configuredPorts.values());

  const portsToCheck = prioritizedPorts.slice(0, maxPorts);
  const checks = await Promise.all(
    portsToCheck.map(async (port) => {
      const validation = await validatePortWithHealth(port, {
        expectedProject,
        timeoutMs
      });
      if (!validation.valid) {
        return null;
      }

      return {
        port,
        pid: validation.data?.pid || null,
        project: validation.data?.project || expectedProject || resolveProjectName(),
        signature: validation.data?.signature || null,
        uptime: validation.data?.uptime || 0
      };
    })
  );

  const servers = checks.filter(Boolean);

  return servers.sort((a, b) => (b.uptime || 0) - (a.uptime || 0));
}

export async function recoverRuntimeFromActiveServers(options = {}) {
  const projectName = resolveProjectName(options.projectName);
  const servers = await scanActiveMcpServers({ expectedProject: projectName });
  if (!servers.length) {
    return null;
  }

  const selected = servers[0];
  if (!selected.signature || !selected.pid || !ensureValidPort(selected.port)) {
    return null;
  }

  const recovered = normalizeRuntime(
    {
      port: selected.port,
      pid: selected.pid,
      project: projectName,
      signature: selected.signature,
      startedAt: Date.now() - Math.max(0, Number(selected.uptime || 0) * 1000),
      hostname: os.hostname(),
      status: 'running'
    },
    projectName
  );

  const written = await atomicWriteRuntimeFile(recovered, projectName);
  if (!written) {
    return null;
  }

  inMemoryRuntime = recovered;
  lastKnownPort = recovered.port;
  lastPortCheck = Date.now();
  runtimeEmitter.emit('state:updated', { ...inMemoryRuntime });
  return recovered;
}

export function getRuntimeState() {
  return { ...inMemoryRuntime };
}

export function updateRuntimeState(updates) {
  inMemoryRuntime = {
    ...inMemoryRuntime,
    ...updates
  };
  runtimeEmitter.emit('state:updated', { ...inMemoryRuntime });
  return { ...inMemoryRuntime };
}

export async function checkPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        resolve({ inUse: true, available: false });
        return;
      }
      resolve({ inUse: false, available: false });
    });
    server.once('listening', () => {
      server.close(() => {
        resolve({ inUse: false, available: true });
      });
    });
    server.listen(port, '127.0.0.1');
  });
}

export async function discoverPort(_fallbackPorts = null, options = {}) {
  const expectedProject = resolveProjectName(options.projectName);

  if (lastKnownPort && Date.now() - lastPortCheck < PORT_CACHE_TTL) {
    const validation = await validatePortWithHealth(lastKnownPort, {
      expectedProject
    });
    if (validation.valid) {
      return {
        port: lastKnownPort,
        pid: validation.data?.pid || null,
        signature: validation.data?.signature || null,
        project: validation.data?.project || expectedProject,
        fromCache: true
      };
    }
  }

  const servers = await scanActiveMcpServers({ expectedProject });
  if (!servers.length) {
    return null;
  }

  const selected = servers[0];
  lastKnownPort = selected.port;
  lastPortCheck = Date.now();
  return {
    port: selected.port,
    pid: selected.pid,
    signature: selected.signature,
    project: selected.project,
    fromCache: false
  };
}

export function onRuntimeUpdate(handler) {
  runtimeEmitter.on('state:updated', handler);
  return () => runtimeEmitter.off('state:updated', handler);
}

export async function setMcpRunning(
  port,
  pid = process.pid,
  projectName = null,
  signature = PROCESS_SIGNATURE
) {
  const resolvedProject = resolveProjectName(projectName);
  const runtime = normalizeRuntime(
    {
      port,
      pid,
      startedAt: Date.now(),
      hostname: os.hostname(),
      status: 'running',
      project: resolvedProject,
      signature
    },
    resolvedProject
  );

  inMemoryRuntime = runtime;
  lastKnownPort = runtime.port;
  lastPortCheck = Date.now();
  runtimeEmitter.emit('state:updated', { ...inMemoryRuntime });

  const written = await atomicWriteRuntimeFile(runtime, resolvedProject);
  if (!written) {
    throw new Error('Failed to persist runtime state');
  }
  return { ...inMemoryRuntime };
}

export async function setMcpStopped(options = {}) {
  const parsedOptions =
    typeof options === 'string' ? { projectName: options } : { ...(options || {}) };
  const { projectName = null, force = false } = parsedOptions;

  await deleteRuntimeFile(projectName, { force });

  inMemoryRuntime = {
    port: null,
    pid: null,
    startedAt: null,
    hostname: null,
    status: 'stopped',
    project: resolveProjectName(projectName),
    signature: null
  };

  runtimeEmitter.emit('state:updated', { ...inMemoryRuntime });
  return { ...inMemoryRuntime };
}

export async function isMcpRunning() {
  if (!inMemoryRuntime.port || !inMemoryRuntime.pid || inMemoryRuntime.status !== 'running') {
    return false;
  }

  const validation = await validateRuntime(inMemoryRuntime, {
    expectedProject: inMemoryRuntime.project,
    expectedSignature: inMemoryRuntime.signature,
    requireSignature: true
  });
  return validation.valid;
}

export function invalidateRuntime() {
  inMemoryRuntime = {
    port: null,
    pid: null,
    startedAt: null,
    hostname: null,
    status: 'stopped',
    project: resolveProjectName(),
    signature: null
  };
  runtimeEmitter.emit('state:invalidated');
}

export function clearRuntimeCache() {
  lastKnownPort = null;
  lastPortCheck = 0;
}

resolveProjectContext();

export const RUNTIME_FILE_PATH = getRuntimeFilePath();
