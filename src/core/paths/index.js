/**
 * Application Path Resolution
 *
 * Resolves the single per-user application data directory that owns the shared
 * SQLite database, runtime state, logs and configuration.
 *
 * Design rules (see docs/INSTALLATION.md):
 *  - The database NEVER lives inside the npm package, the npx cache, the
 *    current working directory, or a project repository by default.
 *  - One data directory per OS user, so every MCP client process shares the
 *    same database and project isolation happens through the `project` column.
 *  - Configuration and secrets live in the platform config directory, apart
 *    from the database file.
 *  - Every location can be overridden by an environment variable for tests,
 *    containers and advanced users.
 *
 * Overrides (highest precedence first):
 *  - LOCAL_MCP_MEMORY_HOME        app root; data = <home>, config = <home>/config
 *  - MCP_DB_PATH                  explicit database file
 *  - LOCAL_MCP_MEMORY_CONFIG_DIR  explicit config directory
 */

import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

export const APP_DIR_NAME = 'local-mcp-memory';
export const DB_FILE_NAME = 'mcp-memory.db';

const ENV_HOME = 'LOCAL_MCP_MEMORY_HOME';
const ENV_DB_PATH = 'MCP_DB_PATH';
const ENV_CONFIG_DIR = 'LOCAL_MCP_MEMORY_CONFIG_DIR';

let cache = null;

function readEnvPath(name) {
  const raw = process.env[name];
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return path.resolve(trimmed);
}

function platformDataDir() {
  const home = os.homedir();

  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
    return path.join(localAppData, APP_DIR_NAME);
  }

  if (process.platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support', APP_DIR_NAME);
  }

  const xdgData = process.env.XDG_DATA_HOME || path.join(home, '.local', 'share');
  return path.join(xdgData, APP_DIR_NAME);
}

function platformConfigDir() {
  const home = os.homedir();

  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
    return path.join(appData, APP_DIR_NAME);
  }

  if (process.platform === 'darwin') {
    // macOS has no separate XDG-style config root; keep config inside the
    // application support directory but in its own subfolder.
    return path.join(platformDataDir(), 'config');
  }

  const xdgConfig = process.env.XDG_CONFIG_HOME || path.join(home, '.config');
  return path.join(xdgConfig, APP_DIR_NAME);
}

function computePaths() {
  const home = readEnvPath(ENV_HOME);
  const configOverride = readEnvPath(ENV_CONFIG_DIR);

  const dataDir = home || platformDataDir();
  const configDir = configOverride || (home ? path.join(home, 'config') : platformConfigDir());
  const dbPath = readEnvPath(ENV_DB_PATH) || path.join(dataDir, DB_FILE_NAME);

  return {
    home,
    dataDir,
    configDir,
    dbPath,
    logDir: path.join(dataDir, 'logs'),
    runtimeDir: path.join(dataDir, 'runtime'),
    configFile: path.join(configDir, 'config.json'),
    secretsFile: path.join(configDir, 'secrets.json'),
    envFile: path.join(configDir, '.env'),
    overrides: {
      home: Boolean(home),
      configDir: Boolean(configOverride),
      dbPath: Boolean(readEnvPath(ENV_DB_PATH)),
    },
  };
}

function paths() {
  if (!cache) {
    cache = computePaths();
  }
  return cache;
}

/**
 * Drop the cached resolution. Required after mutating the environment in
 * tests or in long-lived processes that re-read configuration.
 */
export function resetPaths() {
  cache = null;
}

export function getAppRoot() {
  return paths().dataDir;
}

export function getDataDir() {
  return paths().dataDir;
}

export function getConfigDir() {
  return paths().configDir;
}

export function getLogDir() {
  return paths().logDir;
}

export function getRuntimeDir() {
  return paths().runtimeDir;
}

export function getDbPath() {
  return paths().dbPath;
}

export function getConfigFilePath() {
  return paths().configFile;
}

export function getSecretsFilePath() {
  return paths().secretsFile;
}

export function getEnvFilePath() {
  return paths().envFile;
}

export function getPathOverrides() {
  return { ...paths().overrides };
}

/**
 * Create a directory recursively if it does not exist.
 *
 * @param {string} dir
 * @returns {string} the same directory
 */
export function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Ensure the data, config, log and runtime directories exist.
 */
export function ensureAppDirs() {
  ensureDir(getDataDir());
  ensureDir(getConfigDir());
  ensureDir(getLogDir());
  ensureDir(getRuntimeDir());
  return describePaths();
}

/**
 * Ensure only the directory that owns the database exists.
 */
export function ensureDbDir() {
  const dir = path.dirname(getDbPath());
  ensureDir(dir);
  return dir;
}

/**
 * True when `child` is inside `parent` (or equal to it). Used to refuse to
 * place the database inside the installed package or the npx cache.
 */
export function isInside(child, parent) {
  const rel = path.relative(path.resolve(parent), path.resolve(child));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/**
 * Human readable path summary used by `doctor` and `config`.
 */
export function describePaths() {
  const p = paths();
  return {
    dataDir: p.dataDir,
    configDir: p.configDir,
    dbPath: p.dbPath,
    logDir: p.logDir,
    runtimeDir: p.runtimeDir,
    configFile: p.configFile,
    secretsFile: p.secretsFile,
    envFile: p.envFile,
    overrides: { ...p.overrides },
  };
}

export { ENV_HOME, ENV_DB_PATH, ENV_CONFIG_DIR };
