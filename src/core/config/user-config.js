/**
 * Per-user configuration file.
 *
 * Lives in the platform config directory (`src/core/paths/index.js`), separate
 * from the database. Every value is optional: `null` means "derive at runtime"
 * and environment variables always win over the file.
 *
 * This file is intentionally small. Project-level behaviour (ports, features,
 * plugins) still comes from `<project>/<name>.project-mcp.json`.
 */

import fs from 'node:fs';
import path from 'node:path';
import { getConfigFilePath, getConfigDir, ensureDir } from '../paths/index.js';

export const USER_CONFIG_VERSION = 1;

const DEFAULT_USER_CONFIG = {
  version: USER_CONFIG_VERSION,
  server: {
    port: 0,
    basePort: 47000,
  },
  database: {
    path: null,
  },
  identity: {
    agent: null,
    project: null,
    scope: null,
  },
  logging: {
    level: 'minimal',
  },
  install: {
    installedAt: null,
    version: null,
    agents: [],
  },
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function mergeDeep(target, source) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return target;
  }
  const out = { ...target };
  for (const [key, value] of Object.entries(source)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      out[key] = [...value];
      continue;
    }
    if (value && typeof value === 'object') {
      out[key] = mergeDeep(out[key] || {}, value);
      continue;
    }
    out[key] = value;
  }
  return out;
}

export function defaultUserConfig() {
  return clone(DEFAULT_USER_CONFIG);
}

export function validateUserConfig(config) {
  const issues = [];

  if (!config || typeof config !== 'object') {
    return { valid: false, issues: ['configuration must be a JSON object'] };
  }

  if (config.version !== undefined && config.version !== USER_CONFIG_VERSION) {
    issues.push(`unsupported config version: ${config.version}`);
  }

  const port = config.server?.port;
  if (port !== null && port !== undefined) {
    if (!Number.isInteger(port) || port < 0 || port > 65535) {
      issues.push('server.port must be an integer between 0 and 65535');
    }
  }

  const basePort = config.server?.basePort;
  if (basePort !== null && basePort !== undefined) {
    if (!Number.isInteger(basePort) || basePort < 1024 || basePort > 65535) {
      issues.push('server.basePort must be an integer between 1024 and 65535');
    }
  }

  const dbPath = config.database?.path;
  if (dbPath !== null && dbPath !== undefined && typeof dbPath !== 'string') {
    issues.push('database.path must be a string or null');
  }

  const scope = config.identity?.scope;
  if (scope !== null && scope !== undefined && !['project', 'global'].includes(scope)) {
    issues.push("identity.scope must be 'project', 'global' or null");
  }

  return { valid: issues.length === 0, issues };
}

/**
 * Read the user config. Returns defaults when the file is missing or invalid.
 * `issues` is populated for `doctor` without preventing startup.
 */
export function loadUserConfig() {
  const filePath = getConfigFilePath();
  const defaults = defaultUserConfig();

  if (!fs.existsSync(filePath)) {
    return { config: defaults, filePath, exists: false, issues: [] };
  }

  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const text = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
    const parsed = JSON.parse(text);
    const merged = mergeDeep(defaults, parsed);
    const validation = validateUserConfig(merged);
    return {
      config: merged,
      filePath,
      exists: true,
      issues: validation.issues,
    };
  } catch (error) {
    return {
      config: defaults,
      filePath,
      exists: true,
      issues: [`failed to parse config: ${error.message}`],
    };
  }
}

/**
 * Persist the user config atomically with owner-only permissions.
 */
export function saveUserConfig(config) {
  const filePath = getConfigFilePath();
  ensureDir(path.dirname(filePath));
  ensureDir(getConfigDir());

  const merged = mergeDeep(defaultUserConfig(), config);
  merged.version = USER_CONFIG_VERSION;

  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(merged, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
  fs.renameSync(tempPath, filePath);
  return { filePath, config: merged };
}

/**
 * Copy values from the config file into `process.env`, without ever overriding
 * an explicitly-set environment variable.
 */
export function applyUserConfigToEnv(config = loadUserConfig().config) {
  const setIfUnset = (name, value) => {
    if (value === null || value === undefined) return;
    if (process.env[name] !== undefined && process.env[name] !== '') return;
    process.env[name] = String(value);
  };

  setIfUnset('PORT', config.server?.port);
  setIfUnset('MCP_BASE_PORT', config.server?.basePort);
  setIfUnset('MCP_DB_PATH', config.database?.path);
  setIfUnset('MCP_AGENT', config.identity?.agent);
  setIfUnset('MCP_PROJECT', config.identity?.project);
  setIfUnset('MCP_SCOPE', config.identity?.scope);
  setIfUnset('LOG_LEVEL', config.logging?.level);

  return process.env;
}
