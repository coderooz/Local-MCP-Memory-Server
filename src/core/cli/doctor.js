/**
 * `doctor` health checks.
 *
 * Every check is independent and returns a status so the command can run even
 * when the database is missing or a client config is unreadable. No check
 * writes to a client configuration file.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

import { describePaths, ensureDir, isInside } from '../paths/index.js';
import { loadUserConfig } from '../config/user-config.js';
import { getInstallState, listAgentStatus } from './install-state.js';
import { listRunningServers } from './api-client.js';
import { getPackageInfo, PACKAGE_ROOT } from './package-info.js';

const MIN_NODE_MAJOR = 22;

function check(id, label, status, detail) {
  return { id, label, status, detail };
}

function writableProbe(dir) {
  try {
    ensureDir(dir);
    const probe = path.join(dir, `.write-probe-${process.pid}-${Date.now()}`);
    fs.writeFileSync(probe, 'ok', 'utf8');
    fs.rmSync(probe, { force: true });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

function checkNodeVersion() {
  const major = Number(process.versions.node.split('.')[0]);
  if (major >= MIN_NODE_MAJOR) {
    return check('node', 'Node.js version', 'pass', `v${process.versions.node}`);
  }
  return check(
    'node',
    'Node.js version',
    'fail',
    `v${process.versions.node} is below the required >=${MIN_NODE_MAJOR}`
  );
}

function checkDatabase(paths) {
  const dbPath = paths.dbPath;

  if (isInside(dbPath, PACKAGE_ROOT)) {
    return check(
      'database-location',
      'Database location',
      'fail',
      `database resolves inside the package directory (${dbPath}); set MCP_DB_PATH or LOCAL_MCP_MEMORY_HOME`
    );
  }

  if (!fs.existsSync(dbPath)) {
    return check(
      'database',
      'Database',
      'warn',
      `not created yet at ${dbPath} (created on first start)`
    );
  }

  let db = null;
  try {
    // Imported lazily: `doctor` must work even when native modules fail to load.
    const BetterSqlite3 = requireBetterSqlite3();
    db = new BetterSqlite3(dbPath, { readonly: true, fileMustExist: true });

    const integrity = db.prepare('PRAGMA integrity_check').all();
    const result = integrity.map((row) => Object.values(row)[0]).join('; ');

    const journal = db.prepare('PRAGMA journal_mode').get();
    const journalMode = journal ? Object.values(journal)[0] : 'unknown';

    const tables = db
      .prepare(
        "SELECT count(*) AS n FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
      )
      .get();

    if (result !== 'ok') {
      return check('database', 'Database integrity', 'fail', `integrity_check: ${result}`);
    }

    return check(
      'database',
      'Database',
      'pass',
      `${tables.n} tables, journal_mode=${journalMode}, integrity=ok`
    );
  } catch (error) {
    return check('database', 'Database', 'fail', `cannot read ${dbPath}: ${error.message}`);
  } finally {
    if (db) {
      try {
        db.close();
      } catch {
        /* ignore */
      }
    }
  }
}

function requireBetterSqlite3() {
  const mod = createRequire(import.meta.url);
  return mod('better-sqlite3');
}

function checkWritableDirs(paths) {
  const results = [];
  for (const [id, label, dir] of [
    ['data-dir', 'Data directory', paths.dataDir],
    ['config-dir', 'Config directory', paths.configDir],
  ]) {
    const probe = writableProbe(dir);
    results.push(
      check(
        id,
        label,
        probe.ok ? 'pass' : 'fail',
        probe.ok ? dir : `${dir} is not writable: ${probe.error}`
      )
    );
  }
  return results;
}

function checkConfigFile(paths) {
  const loaded = loadUserConfig();
  if (!loaded.exists) {
    return check('config', 'User config', 'warn', `not created yet at ${paths.configFile}`);
  }
  if (loaded.issues.length > 0) {
    return check('config', 'User config', 'fail', loaded.issues.join('; '));
  }
  return check('config', 'User config', 'pass', paths.configFile);
}

function checkSecrets(paths) {
  if (!fs.existsSync(paths.secretsFile)) {
    return check(
      'secrets',
      'Secrets file',
      'warn',
      'no secrets.json yet (created on first server start)'
    );
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(paths.secretsFile, 'utf8'));
    if (!parsed.jwtSecret) {
      return check('secrets', 'Secrets file', 'warn', 'secrets.json has no jwtSecret');
    }
    if (process.platform !== 'win32') {
      const mode = fs.statSync(paths.secretsFile).mode & 0o777;
      if (mode & 0o077) {
        return check(
          'secrets',
          'Secrets file',
          'warn',
          `permissions ${mode.toString(8)} are broader than 0600`
        );
      }
    }
    return check('secrets', 'Secrets file', 'pass', paths.secretsFile);
  } catch (error) {
    return check('secrets', 'Secrets file', 'fail', `cannot parse: ${error.message}`);
  }
}

function checkAgents() {
  const status = listAgentStatus();
  const installed = status.filter((entry) => entry.clientDetected);
  const registered = installed.filter((entry) => entry.registered);

  if (installed.length === 0) {
    return check('agents', 'AI agent registration', 'warn', 'no supported client detected');
  }
  if (registered.length === 0) {
    return check(
      'agents',
      'AI agent registration',
      'warn',
      `detected ${installed.map((e) => e.id).join(', ')} but none registered; run "local-mcp-memory init"`
    );
  }
  return check('agents', 'AI agent registration', 'pass', registered.map((e) => e.id).join(', '));
}

async function checkServers() {
  const servers = await listRunningServers();
  if (servers.length === 0) {
    return check(
      'server',
      'Running servers',
      'warn',
      'none listening (normal when no MCP client is connected)'
    );
  }
  const summary = servers.map((s) => `${s.project}@${s.port}`).join(', ');
  return check('server', 'Running servers', 'pass', `${servers.length} active: ${summary}`);
}

/**
 * Run every check.
 *
 * @returns {Promise<{ok: boolean, paths: object, install: object, checks: Array}>}
 */
export async function runDoctor() {
  const paths = describePaths();
  const pkg = getPackageInfo();
  const checks = [];

  checks.push(checkNodeVersion());
  checks.push(...checkWritableDirs(paths));
  checks.push(checkConfigFile(paths));
  checks.push(checkDatabase(paths));
  checks.push(checkSecrets(paths));
  checks.push(checkAgents());
  checks.push(await checkServers());

  const failures = checks.filter((entry) => entry.status === 'fail').length;

  return {
    ok: failures === 0,
    package: { name: pkg.name, version: pkg.version, root: PACKAGE_ROOT },
    paths,
    install: getInstallState(),
    checks,
    summary: {
      pass: checks.filter((entry) => entry.status === 'pass').length,
      warn: checks.filter((entry) => entry.status === 'warn').length,
      fail: failures,
    },
  };
}
