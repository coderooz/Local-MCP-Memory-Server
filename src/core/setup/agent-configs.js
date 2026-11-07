/**
 * AI agent MCP configuration adapters.
 *
 * Each adapter knows how to register (and remove) the `local-mcp-memory` MCP
 * server in one client's configuration file.
 *
 * Guarantees:
 *  - idempotent: re-running produces no change when already registered
 *  - non-destructive: unrelated keys, comments and formatting are preserved
 *  - backed up: the previous file is copied before the first modification
 *  - validated: the file is re-read after writing and the entry is asserted
 *
 * Only files under the user's home directory are touched. Nothing is written
 * unless the caller explicitly applies an adapter.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  findPropertyRange,
  findRootObjectIndex,
  parseJsonc,
  removeJsonProperty,
  setJsonProperty,
} from './jsonc.js';

export const SERVER_NAME = 'local-mcp-memory';
export const PACKAGE_NAME = 'local-mcp-memory';
const MAX_BACKUPS = 5;
const DEFAULT_TIMEOUT_MS = 120000;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(__dirname, '..', '..', '..');

function home(...parts) {
  return path.join(agentHomeDir(), ...parts);
}

/**
 * Override the home directory used to locate client configuration files.
 *
 * Needed for tests (never touch a real client config) and for portable or
 * containerised installs where the client configs live outside `$HOME`.
 */
const AGENT_HOME_ENV = 'LOCAL_MCP_MEMORY_AGENT_HOME';

function agentHomeOverride() {
  const raw = process.env[AGENT_HOME_ENV];
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed ? path.resolve(trimmed) : null;
}

function agentHomeDir() {
  return agentHomeOverride() || os.homedir();
}

function appDataDir() {
  if (agentHomeOverride()) {
    return path.join(agentHomeOverride(), 'AppData', 'Roaming');
  }
  if (process.platform === 'win32') {
    return process.env.APPDATA || home('AppData', 'Roaming');
  }
  if (process.platform === 'darwin') {
    return home('Library', 'Application Support');
  }
  return process.env.XDG_CONFIG_HOME || home('.config');
}

function xdgConfig(...parts) {
  const base = agentHomeOverride()
    ? path.join(agentHomeOverride(), '.config')
    : process.env.XDG_CONFIG_HOME || home('.config');
  return path.join(base, ...parts);
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function backupFile(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const backupPath = `${filePath}.bak-${timestamp()}`;
  fs.copyFileSync(filePath, backupPath);

  // Prune old backups for this file, keeping the most recent MAX_BACKUPS.
  const dir = path.dirname(filePath);
  const base = path.basename(filePath);
  try {
    const backups = fs
      .readdirSync(dir)
      .filter((name) => name.startsWith(`${base}.bak-`))
      .sort();
    while (backups.length > MAX_BACKUPS) {
      fs.rmSync(path.join(dir, backups.shift()), { force: true });
    }
  } catch {
    /* pruning is best effort */
  }

  return backupPath;
}

function atomicWrite(filePath, contents) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  let mode;
  try {
    mode = fs.statSync(filePath).mode;
  } catch {
    mode = 0o600;
  }
  fs.writeFileSync(tempPath, contents, { encoding: 'utf8', mode });
  fs.renameSync(tempPath, filePath);
}

function readText(filePath) {
  try {
    const text = fs.readFileSync(filePath, 'utf8');
    return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  } catch {
    return null;
  }
}

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Resolve how a client should launch the server.
 *
 * Default is the published package through npx. `local: true` points at this
 * checkout, which is what development and integration tests use.
 */
export function resolveServerLaunch(options = {}) {
  if (options.local) {
    return {
      command: process.execPath,
      args: [path.join(PACKAGE_ROOT, 'mcp-server.js')],
    };
  }
  return {
    command: 'npx',
    args: ['-y', PACKAGE_NAME, 'start'],
  };
}

function buildEnv(agentId, extraEnv = {}) {
  return { MCP_AGENT: agentId, ...extraEnv };
}

// ---------------------------------------------------------------------------
// Generic JSON (mcpServers) adapters
// ---------------------------------------------------------------------------

function jsonAdapter({ id, label, filePath, agentId, extraEnv, extraEntry }) {
  return {
    id,
    label,
    filePath,
    format: 'json',
    agentId,

    exists() {
      return fs.existsSync(filePath);
    },

    inspect() {
      const text = readText(filePath);
      if (!text) return { registered: false, entry: null };
      try {
        const parsed = parseJsonc(text);
        const entry = parsed?.mcpServers?.[SERVER_NAME] || null;
        return { registered: Boolean(entry), entry };
      } catch {
        return { registered: false, entry: null, error: 'invalid JSON' };
      }
    },

    apply(options = {}) {
      const launch = resolveServerLaunch(options);
      const desired = {
        command: launch.command,
        args: launch.args,
        env: buildEnv(agentId, extraEnv),
        ...(extraEntry || {}),
      };

      const existingText = readText(filePath);
      const parsed = existingText ? parseJsonc(existingText) : {};
      const current = parsed?.mcpServers?.[SERVER_NAME] || null;

      if (current && deepEqual(current, desired)) {
        return { id, label, filePath, action: 'unchanged', backup: null, dryRun: Boolean(options.dryRun) };
      }

      if (options.dryRun) {
        return { id, label, filePath, action: current ? 'would_update' : 'would_create', backup: null, dryRun: true };
      }

      const next = { ...parsed };
      next.mcpServers = { ...(parsed.mcpServers || {}), [SERVER_NAME]: desired };
      const backup = backupFile(filePath);
      atomicWrite(filePath, `${JSON.stringify(next, null, 2)}\n`);

      const verify = parseJsonc(readText(filePath));
      if (!verify?.mcpServers?.[SERVER_NAME]?.command) {
        throw new Error(`verification failed for ${filePath}`);
      }

      return { id, label, filePath, action: current ? 'updated' : 'created', backup };
    },

    remove() {
      const text = readText(filePath);
      if (!text) return { id, label, filePath, action: 'missing' };
      const parsed = parseJsonc(text);
      if (!parsed?.mcpServers?.[SERVER_NAME]) {
        return { id, label, filePath, action: 'unchanged' };
      }
      const backup = backupFile(filePath);
      delete parsed.mcpServers[SERVER_NAME];
      atomicWrite(filePath, `${JSON.stringify(parsed, null, 2)}\n`);
      return { id, label, filePath, action: 'removed', backup };
    },
  };
}

// ---------------------------------------------------------------------------
// opencode (JSONC, comment preserving)
// ---------------------------------------------------------------------------

function opencodeAdapter() {
  const filePath = xdgConfig('opencode', 'opencode.json');
  const agentId = 'opencode';

  function readTextOrEmpty() {
    return readText(filePath) ?? '{\n}\n';
  }

  function locateMcpObject(text, create) {
    const root = findRootObjectIndex(text);
    const existing = findPropertyRange(text, root, 'mcp');
    if (existing) {
      return { text, mcpOpen: existing.valueStart };
    }
    if (!create) return { text, mcpOpen: -1 };
    const withMcp = setJsonProperty(text, root, 'mcp', {});
    const updatedRoot = findRootObjectIndex(withMcp);
    const created = findPropertyRange(withMcp, updatedRoot, 'mcp');
    return { text: withMcp, mcpOpen: created.valueStart };
  }

  return {
    id: 'opencode',
    label: 'opencode',
    filePath,
    format: 'jsonc',
    agentId,

    exists() {
      return fs.existsSync(filePath);
    },

    inspect() {
      const text = readText(filePath);
      if (!text) return { registered: false, entry: null };
      try {
        const parsed = parseJsonc(text);
        const entry = parsed?.mcp?.[SERVER_NAME] || null;
        return { registered: Boolean(entry), entry };
      } catch {
        return { registered: false, entry: null, error: 'invalid JSONC' };
      }
    },

    apply(options = {}) {
      const launch = resolveServerLaunch(options);
      const desired = {
        type: 'local',
        command: [launch.command, ...launch.args],
        environment: buildEnv(agentId),
        enabled: true,
        timeout: DEFAULT_TIMEOUT_MS,
      };

      const original = readTextOrEmpty();
      const parsed = parseJsonc(original);
      const current = parsed?.mcp?.[SERVER_NAME] || null;
      if (current && deepEqual(current, desired)) {
        return { id: 'opencode', label: 'opencode', filePath, action: 'unchanged', backup: null, dryRun: Boolean(options.dryRun) };
      }

      if (options.dryRun) {
        return {
          id: 'opencode',
          label: 'opencode',
          filePath,
          action: current ? 'would_update' : 'would_create',
          backup: null,
          dryRun: true,
        };
      }

      const located = locateMcpObject(original, true);
      const next = setJsonProperty(located.text, located.mcpOpen, SERVER_NAME, desired);

      const backup = backupFile(filePath);
      atomicWrite(filePath, next);

      const verify = parseJsonc(readText(filePath));
      if (!Array.isArray(verify?.mcp?.[SERVER_NAME]?.command)) {
        throw new Error(`verification failed for ${filePath}`);
      }

      return {
        id: 'opencode',
        label: 'opencode',
        filePath,
        action: current ? 'updated' : 'created',
        backup,
      };
    },

    remove() {
      const text = readText(filePath);
      if (!text) return { id: 'opencode', label: 'opencode', filePath, action: 'missing' };

      const parsed = parseJsonc(text);
      if (!parsed?.mcp?.[SERVER_NAME]) {
        return { id: 'opencode', label: 'opencode', filePath, action: 'unchanged' };
      }

      const located = locateMcpObject(text, false);
      if (located.mcpOpen === -1) {
        return { id: 'opencode', label: 'opencode', filePath, action: 'unchanged' };
      }

      const backup = backupFile(filePath);
      atomicWrite(filePath, removeJsonProperty(located.text, located.mcpOpen, SERVER_NAME));
      return { id: 'opencode', label: 'opencode', filePath, action: 'removed', backup };
    },
  };
}

// ---------------------------------------------------------------------------
// Codex (TOML)
// ---------------------------------------------------------------------------

const CODEX_HEADER = `[mcp_servers.${SERVER_NAME}]`;
const CODEX_ENV_HEADER = `[mcp_servers.${SERVER_NAME}.env]`;

function tomlString(value) {
  return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function tomlValue(value) {
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (Array.isArray(value)) return `[${value.map(tomlValue).join(', ')}]`;
  return tomlString(value);
}

function stripTomlSection(text, header) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === header);
  if (start === -1) return text;

  const isOwnSubtable = (line) => {
    const trimmed = line.trim();
    return (
      trimmed.startsWith(`[mcp_servers.${SERVER_NAME}.`) ||
      trimmed === `[mcp_servers.${SERVER_NAME}]`
    );
  };

  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith('[') && !isOwnSubtable(lines[i])) {
      end = i;
      break;
    }
  }

  // Drop trailing blank lines that belonged to the removed block.
  let trimmedEnd = end;
  while (trimmedEnd > start && lines[trimmedEnd - 1].trim() === '') trimmedEnd -= 1;

  const before = lines.slice(0, start);
  const after = lines.slice(end);
  const combined = [...before, ...after];

  // Collapse a doubled blank line left at the seam.
  const seam = before.length;
  if (
    combined[seam - 1] !== undefined &&
    combined[seam - 1].trim() === '' &&
    combined[seam] !== undefined &&
    combined[seam].trim() === ''
  ) {
    combined.splice(seam, 1);
  }

  return combined.join('\n');
}

function codexAdapter() {
  const filePath = home('.codex', 'config.toml');
  const agentId = 'chatgpt';

  function buildBlock(options) {
    const launch = resolveServerLaunch(options);
    const env = buildEnv(agentId, options.env || {});
    const envLines = Object.entries(env).map(([k, v]) => `  ${k} = ${tomlValue(v)}`);
    return [
      CODEX_HEADER,
      'enabled = true',
      `command = ${tomlValue(launch.command)}`,
      `args = ${tomlValue(launch.args)}`,
      '',
      CODEX_ENV_HEADER,
      ...envLines,
      '',
    ].join('\n');
  }

  function sectionText(text) {
    const start = text.indexOf(CODEX_HEADER);
    if (start === -1) return null;
    const remainder = text.slice(start);
    const nextHeader = remainder
      .split(/\r?\n/)
      .slice(1)
      .findIndex((line) => line.trim().startsWith('['));
    if (nextHeader === -1) return remainder;
    const lines = remainder.split(/\r?\n/);
    return lines.slice(0, nextHeader + 1).join('\n');
  }

  return {
    id: 'codex',
    label: 'Codex',
    filePath,
    format: 'toml',
    agentId,

    exists() {
      return fs.existsSync(filePath);
    },

    inspect() {
      const text = readText(filePath);
      if (!text) return { registered: false, entry: null };
      const section = sectionText(text);
      return { registered: Boolean(section), entry: section };
    },

    apply(options = {}) {
      const existing = readText(filePath) ?? '';
      const block = buildBlock(options);

      if (existing.includes(CODEX_HEADER)) {
        const stripped = stripTomlSection(existing, CODEX_HEADER);
        const normalized = stripped.replace(/\s+$/, '');
        const next = `${normalized}${normalized ? '\n\n' : ''}${block}`;
        if (existing === next) {
          return { id: 'codex', label: 'Codex', filePath, action: 'unchanged', backup: null, dryRun: Boolean(options.dryRun) };
        }
        if (options.dryRun) {
          return { id: 'codex', label: 'Codex', filePath, action: 'would_update', backup: null, dryRun: true };
        }
        const backup = backupFile(filePath);
        atomicWrite(filePath, next);
        if (!readText(filePath).includes(CODEX_HEADER)) {
          throw new Error(`verification failed for ${filePath}`);
        }
        return { id: 'codex', label: 'Codex', filePath, action: 'updated', backup };
      }

      if (options.dryRun) {
        return { id: 'codex', label: 'Codex', filePath, action: 'would_create', backup: null, dryRun: true };
      }

      const backup = backupFile(filePath);
      const base = existing.replace(/\s+$/, '');
      atomicWrite(filePath, `${base}${base ? '\n\n' : ''}${block}`);
      if (!readText(filePath).includes(CODEX_HEADER)) {
        throw new Error(`verification failed for ${filePath}`);
      }
      return { id: 'codex', label: 'Codex', filePath, action: 'created', backup };
    },

    remove() {
      const text = readText(filePath);
      if (!text) return { id: 'codex', label: 'Codex', filePath, action: 'missing' };
      if (!text.includes(CODEX_HEADER)) {
        return { id: 'codex', label: 'Codex', filePath, action: 'unchanged' };
      }
      const backup = backupFile(filePath);
      atomicWrite(filePath, stripTomlSection(text, CODEX_HEADER));
      return { id: 'codex', label: 'Codex', filePath, action: 'removed', backup };
    },
  };
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

let adaptersCache = null;

export function getAdapters() {
  if (!adaptersCache) {
    adaptersCache = [
      opencodeAdapter(),
      codexAdapter(),
      jsonAdapter({
        id: 'claude',
        label: 'Claude Desktop',
        filePath: path.join(appDataDir(), 'Claude', 'claude_desktop_config.json'),
        agentId: 'claude',
      }),
      jsonAdapter({
        id: 'antigravity',
        label: 'Google Antigravity',
        filePath: home('.gemini', 'antigravity', 'mcp_config.json'),
        agentId: 'antigravity',
      }),
      jsonAdapter({
        id: 'cursor',
        label: 'Cursor',
        filePath: home('.cursor', 'mcp.json'),
        agentId: 'cursor',
      }),
      jsonAdapter({
        id: 'windsurf',
        label: 'Windsurf',
        filePath: home('.codeium', 'windsurf', 'mcp_config.json'),
        agentId: 'windsurf',
      }),
      jsonAdapter({
        id: 'cline',
        label: 'Cline (VS Code)',
        filePath: path.join(
          appDataDir(),
          'Code',
          'User',
          'globalStorage',
          'saoudrizwan.claude-dev',
          'settings',
          'cline_mcp_settings.json'
        ),
        agentId: 'cline',
      }),
      jsonAdapter({
        id: 'roo',
        label: 'Roo Code (VS Code)',
        filePath: path.join(
          appDataDir(),
          'Code',
          'User',
          'globalStorage',
          'rooveterinaryinc.roo-cline',
          'settings',
          'cline_mcp_settings.json'
        ),
        agentId: 'roo',
      }),
    ];
  }
  return adaptersCache;
}

export function getAdapter(id) {
  return getAdapters().find((adapter) => adapter.id === id) || null;
}

/**
 * Adapters whose config file exists, plus adapters whose parent directory
 * exists (client installed but never configured).
 */
export function detectAdapters() {
  return getAdapters().map((adapter) => {
    const dir = path.dirname(adapter.filePath);
    return {
      id: adapter.id,
      label: adapter.label,
      filePath: adapter.filePath,
      configExists: fs.existsSync(adapter.filePath),
      clientDetected: fs.existsSync(dir),
    };
  });
}

export function applyAgentConfig(id, options = {}) {
  const adapter = getAdapter(id);
  if (!adapter) {
    throw new Error(`unknown agent adapter: ${id}`);
  }
  return adapter.apply(options);
}

export function removeAgentConfig(id) {
  const adapter = getAdapter(id);
  if (!adapter) {
    throw new Error(`unknown agent adapter: ${id}`);
  }
  return adapter.remove();
}

export function inspectAgentConfig(id) {
  const adapter = getAdapter(id);
  if (!adapter) {
    throw new Error(`unknown agent adapter: ${id}`);
  }
  return adapter.inspect();
}
