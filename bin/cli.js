#!/usr/bin/env node

/**
 * local-mcp-memory CLI
 *
 * Two kinds of commands:
 *  - installation commands (`init`, `start`, `status`, `doctor`, `config`,
 *    `update`, `uninstall`, `migrate`) that manage the per-user installation
 *  - data commands (`search`, `store`, `create-task`, …) that talk to a
 *    running server over HTTP
 *
 * Rules this file must keep:
 *  - never hardcode a version, a port, or a package-relative path
 *  - never write to a client config the user did not select
 *  - never print to stdout in stdio mode (it would corrupt the MCP stream)
 */

import { Command } from 'commander';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { PACKAGE_ROOT, getPackageInfo, packagePath } from '../src/core/cli/package-info.js';
import {
  describePaths,
  ensureAppDirs,
  getDataDir,
  getRuntimeDir
} from '../src/core/paths/index.js';
import {
  loadUserConfig,
  saveUserConfig,
  validateUserConfig
} from '../src/core/config/user-config.js';
import { loadEnvironment } from '../src/core/config/load-env.js';
import {
  applyAgents,
  clearInstallState,
  getInstallState,
  listAgentStatus,
  recordInstall,
  removeAgents,
  resolveAgentSelection
} from '../src/core/cli/install-state.js';
import { runDoctor } from '../src/core/cli/doctor.js';
import {
  fetchHealth,
  listRunningServers,
  requestJson,
  resolveServerPort
} from '../src/core/cli/api-client.js';

const pkg = getPackageInfo();

// ---------------------------------------------------------------------------
// Output helpers
// ---------------------------------------------------------------------------

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code) => (text) => (useColor ? `\u001b[${code}m${text}\u001b[0m` : String(text));
const green = paint('32');
const yellow = paint('33');
const red = paint('31');
const dim = paint('2');
const bold = paint('1');

function print(value = '') {
  process.stdout.write(`${value}\n`);
}

function printJson(value) {
  print(JSON.stringify(value, null, 2));
}

function ok(message) {
  print(`${green('✔')} ${message}`);
}

function warn(message) {
  print(`${yellow('!')} ${message}`);
}

function fail(message) {
  print(`${red('✖')} ${message}`);
}

function heading(message) {
  print(`\n${bold(message)}`);
}

function isJson() {
  return Boolean(program.opts().json);
}

function exitWith(code) {
  process.exit(code);
}

// ---------------------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------------------

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function getAtPath(object, dotted) {
  return dotted
    .split('.')
    .reduce((current, key) => (current == null ? undefined : current[key]), object);
}

function setAtPath(object, dotted, value) {
  const keys = dotted.split('.');
  const last = keys.pop();
  let cursor = object;
  for (const key of keys) {
    if (typeof cursor[key] !== 'object' || cursor[key] === null) cursor[key] = {};
    cursor = cursor[key];
  }
  cursor[last] = value;
  return object;
}

function coerceValue(raw) {
  if (raw === 'null') return null;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (raw !== '' && Number.isFinite(Number(raw))) return Number(raw);
  return raw;
}

function requireServer(portFlag) {
  return resolveServerPort({ port: portFlag }).then((resolved) => {
    if (!resolved) {
      fail('No running memory server found.');
      print(dim('  Start one with: local-mcp-memory start --mode http'));
      exitWith(1);
    }
    return resolved;
  });
}

async function apiGet(port, requestPath) {
  const { status, body } = await requestJson({ port, path: requestPath });
  if (status >= 400) {
    throw new Error(body?.error || body?.message || `HTTP ${status}`);
  }
  return body;
}

async function apiPost(port, requestPath, payload) {
  const { status, body } = await requestJson({
    port,
    path: requestPath,
    method: 'POST',
    body: payload
  });
  if (status >= 400) {
    throw new Error(body?.error || body?.message || `HTTP ${status}`);
  }
  return body;
}

function pidFilePath() {
  return path.join(getRuntimeDir(), 'server.pid');
}

// ---------------------------------------------------------------------------
// Program
// ---------------------------------------------------------------------------

const program = new Command();

program
  .name('local-mcp-memory')
  .description('Local MCP Memory Server — persistent multi-agent memory over MCP')
  .version(pkg.version)
  .option('--json', 'machine-readable JSON output where supported')
  .showHelpAfterError();

// ---------------------------------------------------------------------------
// init
// ---------------------------------------------------------------------------

program
  .command('init')
  .description('prepare the per-user installation and register with AI clients')
  .option(
    '-a, --agent <ids...>',
    'client ids to register (opencode, codex, claude, cursor, windsurf, cline)'
  )
  .option('--all', 'register every supported client, creating configs when missing', false)
  .option('--local', 'launch this checkout instead of the published package (development)', false)
  .option('--skip-agents', 'only create config and directories, never touch a client config', false)
  .option('-p, --port <port>', 'preferred HTTP port (0 = dynamic)')
  .option('--project <project>', 'default project identifier')
  .option('--scope <scope>', 'default memory scope (project|global)')
  .option('--dry-run', 'preview changes without writing config or touching client configurations', false)
  .action(async (options) => {
    const dryRun = Boolean(options.dryRun);
    const created = dryRun ? describePaths() : ensureAppDirs();
    const loaded = loadUserConfig();
    const next = JSON.parse(JSON.stringify(loaded.config));

    if (options.port !== undefined) setAtPath(next, 'server.port', Number(options.port));
    if (options.project !== undefined) setAtPath(next, 'identity.project', options.project);
    if (options.scope !== undefined) setAtPath(next, 'identity.scope', options.scope);

    const validation = validateUserConfig(next);
    if (!validation.valid) {
      fail('Invalid configuration:');
      for (const issue of validation.issues) print(`  - ${issue}`);
      exitWith(2);
    }

    const wouldWriteConfig = !loaded.exists || JSON.stringify(next) !== JSON.stringify(loaded.config);
    const wroteConfig = wouldWriteConfig && !dryRun;
    if (wroteConfig) saveUserConfig(next);

    const results = [];
    let installState = getInstallState();

    if (!options.skipAgents) {
      const selection = resolveAgentSelection({
        agents: options.agent,
        all: options.all
      });

      if (selection.unknown.length > 0) {
        fail(`Unknown client id(s): ${selection.unknown.join(', ')}`);
        print(
          dim(
            `  Known ids: ${listAgentStatus()
              .map((entry) => entry.id)
              .join(', ')}`
          )
        );
        exitWith(2);
      }

      if (selection.selected.length === 0) {
        warn('No supported AI client detected; nothing registered.');
        print(dim('  Re-run with --all or --agent <id> to choose explicitly.'));
      } else {
        results.push(...applyAgents(selection.selected, { local: options.local, dryRun }));
      }

      if (!dryRun) {
        const succeeded = results.filter((entry) => entry.ok).map((entry) => entry.id);
        if (succeeded.length > 0) {
          installState = recordInstall({ version: pkg.version, agents: succeeded });
        } else if (results.length === 0) {
          installState = recordInstall({ version: pkg.version, agents: installState.agents });
        }
      }
    } else if (!dryRun) {
      installState = recordInstall({ version: pkg.version, agents: installState.agents });
    }

    if (isJson()) {
      printJson({
        ok: results.every((entry) => entry.ok),
        dryRun,
        package: { name: pkg.name, version: pkg.version },
        paths: created,
        configWritten: wroteConfig,
        wouldWriteConfig,
        configFile: loaded.filePath,
        install: installState,
        agents: results
      });
      exitWith(0);
    }

    heading(dryRun ? 'Installation (Dry Run)' : 'Installation');
    if (dryRun) print(dim('  Preview only — no files or client configurations modified.'));
    ok(`Package ${pkg.name}@${pkg.version}`);
    ok(`Data directory:   ${created.dataDir}`);
    ok(`Config directory: ${created.configDir}`);
    ok(`Database:         ${created.dbPath}`);
    print(
      wroteConfig
        ? `✔ Configuration written to ${loaded.filePath}`
        : wouldWriteConfig && dryRun
          ? dim(`Would write configuration to ${loaded.filePath}`)
          : dim(`Configuration unchanged: ${loaded.filePath}`)
    );

    if (results.length > 0) {
      heading('AI clients');
      for (const entry of results) {
        if (entry.ok) {
          const detail = entry.backup
            ? `${entry.action} (backup: ${path.basename(entry.backup)})`
            : entry.action;
          print(`  ${green('✔')} ${entry.id.padEnd(9)} ${detail} — ${entry.filePath}`);
        } else {
          print(`  ${red('✖')} ${entry.id.padEnd(9)} ${entry.error}`);
        }
      }
    }

    heading('Next steps');
    print('  local-mcp-memory doctor     verify the installation');
    print('  local-mcp-memory status     show servers and configuration');
    print('  Restart your AI client so it picks up the new MCP server.');
  });

// ---------------------------------------------------------------------------
// start
// ---------------------------------------------------------------------------

program
  .command('start')
  .description('start the memory server (stdio for MCP clients, or http)')
  .option('-p, --port <port>', 'port to listen on (0 = dynamic)')
  .option('-m, --mode <mode>', 'stdio or http', 'stdio')
  .option('-d, --daemon', 'run the http server in the background', false)
  .action(async (options) => {
    const mode = String(options.mode).toLowerCase();
    if (!['stdio', 'http'].includes(mode)) {
      fail(`Unknown mode "${options.mode}" (expected stdio or http)`);
      exitWith(2);
    }

    // stdio mode owns stdout: every message must go to stderr.
    const log = mode === 'stdio' ? (line = '') => process.stderr.write(`${line}\n`) : print;

    ensureAppDirs();
    const env = { ...process.env };
    if (options.port !== undefined) env.PORT = String(options.port);

    const script = mode === 'stdio' ? packagePath('mcp-server.js') : packagePath('server.js');
    if (!fs.existsSync(script)) {
      fail(`Cannot find ${script} — the installation looks incomplete.`);
      exitWith(1);
    }

    if (mode === 'http' && options.daemon) {
      const child = spawn(process.execPath, [script], {
        cwd: getDataDir(),
        detached: true,
        stdio: 'ignore',
        env,
        windowsHide: true
      });
      child.unref();
      fs.mkdirSync(getRuntimeDir(), { recursive: true });
      fs.writeFileSync(pidFilePath(), String(child.pid), 'utf8');
      log(`Started HTTP server in the background (PID ${child.pid}).`);
      log('Stop it with: local-mcp-memory stop');
      return;
    }

    log(`Starting ${mode === 'stdio' ? 'MCP stdio' : 'HTTP API'} server…`);

    const child = spawn(process.execPath, [script], {
      stdio: 'inherit',
      env
    });

    const forward = (signal) => () => {
      try {
        child.kill(signal);
      } catch {
        /* already gone */
      }
    };
    process.on('SIGINT', forward('SIGINT'));
    process.on('SIGTERM', forward('SIGTERM'));

    child.on('error', (error) => {
      process.stderr.write(`Failed to start server: ${error.message}\n`);
      exitWith(1);
    });
    child.on('exit', (code, signal) => {
      if (signal) exitWith(0);
      exitWith(code ?? 0);
    });
  });

// ---------------------------------------------------------------------------
// stop
// ---------------------------------------------------------------------------

program
  .command('stop')
  .description('stop a background HTTP server started with --daemon')
  .action(() => {
    const file = pidFilePath();
    if (!fs.existsSync(file)) {
      warn('No background server recorded. Use your process manager or close the MCP client.');
      return;
    }

    const pid = Number(fs.readFileSync(file, 'utf8').trim());
    if (!Number.isInteger(pid) || pid <= 0) {
      fail(`Invalid PID file: ${file}`);
      exitWith(1);
    }

    try {
      process.kill(pid, 'SIGTERM');
      ok(`Sent SIGTERM to process ${pid}`);
    } catch (error) {
      warn(`Process ${pid} is not running (${error.code || error.message})`);
    }

    fs.rmSync(file, { force: true });
  });

// ---------------------------------------------------------------------------
// status
// ---------------------------------------------------------------------------

program
  .command('status')
  .description('show installation, paths, database and running servers')
  .option('-p, --port <port>', 'probe a specific port')
  .action(async (options) => {
    const paths = describePaths();
    const install = getInstallState();
    const servers = await listRunningServers();
    const agents = listAgentStatus();

    let db = null;
    if (fs.existsSync(paths.dbPath)) {
      const stat = fs.statSync(paths.dbPath);
      db = { path: paths.dbPath, bytes: stat.size, modified: stat.mtime.toISOString() };
    }

    let health = null;
    const resolved = await resolveServerPort({ port: options.port });
    if (resolved) health = await fetchHealth(resolved.port);

    if (isJson()) {
      printJson({
        package: { name: pkg.name, version: pkg.version, root: PACKAGE_ROOT },
        install,
        paths,
        database: db,
        servers,
        agents,
        resolvedPort: resolved,
        health
      });
      return;
    }

    heading(`${pkg.name} ${pkg.version}`);
    print(`  ${dim('root')}    ${PACKAGE_ROOT}`);
    print(
      install.version
        ? `  ${dim('install')} ${install.version} since ${install.installedAt}`
        : `  ${dim('install')} not initialized (run "local-mcp-memory init")`
    );

    heading('Paths');
    print(`  ${dim('data')}    ${paths.dataDir}`);
    print(`  ${dim('config')}  ${paths.configDir}`);
    print(`  ${dim('db')}      ${paths.dbPath}`);

    heading('Database');
    if (db) {
      ok(`${formatBytes(db.bytes)} — last written ${db.modified}`);
    } else {
      warn('not created yet (created on first server start)');
    }

    heading('Servers');
    if (servers.length === 0) {
      warn('none listening');
    } else {
      for (const server of servers) {
        print(
          `  ${green('●')} ${String(server.project).padEnd(20)} port ${server.port}  pid ${server.pid ?? '?'}`
        );
      }
    }
    if (health)
      print(
        dim(`  health: ${health.status || 'ok'} (port ${resolved.port}, via ${resolved.source})`)
      );

    heading('AI clients');
    const detected = agents.filter((entry) => entry.clientDetected);
    if (detected.length === 0) {
      warn('no supported client detected');
    } else {
      for (const entry of detected) {
        const state = entry.registered ? green('registered') : dim('not registered');
        print(`  ${entry.id.padEnd(9)} ${state}  ${dim(entry.filePath)}`);
      }
    }
  });

// ---------------------------------------------------------------------------
// doctor
// ---------------------------------------------------------------------------

program
  .command('doctor')
  .description('diagnose the installation (never modifies client configs)')
  .action(async () => {
    const report = await runDoctor();

    if (isJson()) {
      printJson(report);
      exitWith(report.ok ? 0 : 1);
    }

    heading(`Doctor — ${report.package.name} ${report.package.version}`);
    const symbol = { pass: green('✔'), warn: yellow('!'), fail: red('✖') };
    for (const check of report.checks) {
      print(`  ${symbol[check.status] || '?'} ${check.label.padEnd(24)} ${dim(check.detail)}`);
    }

    heading('Summary');
    print(
      `  ${report.summary.pass} passed, ${report.summary.warn} warnings, ${report.summary.fail} failures`
    );
    if (!report.ok) {
      print(dim('\nFix the failures above, then re-run "local-mcp-memory doctor".'));
    }
    exitWith(report.ok ? 0 : 1);
  });

// ---------------------------------------------------------------------------
// config
// ---------------------------------------------------------------------------

const configCommand = program
  .command('config')
  .description('show or edit the per-user configuration')
  .action(() => {
    const loaded = loadUserConfig();
    const paths = describePaths();

    if (isJson()) {
      printJson({
        filePath: loaded.filePath,
        exists: loaded.exists,
        issues: loaded.issues,
        config: loaded.config,
        paths
      });
      return;
    }

    heading('Configuration');
    print(`  ${dim('file')} ${loaded.filePath}${loaded.exists ? '' : dim(' (not created yet)')}`);
    if (loaded.issues.length > 0) {
      for (const issue of loaded.issues) warn(issue);
    }
    printJson(loaded.config);

    heading('Paths');
    print(`  ${dim('data')}   ${paths.dataDir}`);
    print(`  ${dim('config')} ${paths.configDir}`);
    print(`  ${dim('db')}     ${paths.dbPath}`);
  });

configCommand
  .command('path')
  .description('print the configuration file path')
  .action(() => {
    print(loadUserConfig().filePath);
  });

configCommand
  .command('get <key>')
  .description('read one value (e.g. server.port)')
  .action((key) => {
    const value = getAtPath(loadUserConfig().config, key);
    if (value === undefined) {
      fail(`Unknown key: ${key}`);
      exitWith(2);
    }
    if (isJson()) printJson({ key, value });
    else print(typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value));
  });

configCommand
  .command('set <key> <value>')
  .description('write one value (e.g. server.port 47100)')
  .action((key, raw) => {
    const loaded = loadUserConfig();
    const next = JSON.parse(JSON.stringify(loaded.config));
    setAtPath(next, key, coerceValue(raw));

    const validation = validateUserConfig(next);
    if (!validation.valid) {
      fail(`Invalid value for ${key}:`);
      for (const issue of validation.issues) print(`  - ${issue}`);
      exitWith(2);
    }

    saveUserConfig(next);
    ok(`${key} = ${JSON.stringify(getAtPath(next, key))}`);
    print(dim(`  ${loaded.filePath}`));
  });

// ---------------------------------------------------------------------------
// update
// ---------------------------------------------------------------------------

program
  .command('update')
  .description('refresh the installation after upgrading the package')
  .option('--check', 'report drift without writing anything', false)
  .action((options) => {
    const install = getInstallState();
    const outdated = install.version !== pkg.version;
    const agents = install.agents;

    if (options.check) {
      if (!install.version) {
        warn('Not initialized. Run "local-mcp-memory init".');
        exitWith(1);
      }
      if (outdated) {
        warn(
          `Installed ${install.version}, package ${pkg.version}. Run "local-mcp-memory update".`
        );
        exitWith(1);
      }
      ok(`Up to date (${pkg.version}).`);
      return;
    }

    const results = agents.length > 0 ? applyAgents(agents) : [];
    const state = recordInstall({ version: pkg.version, agents });

    if (isJson()) {
      printJson({
        previous: install.version,
        current: pkg.version,
        outdated,
        agents: results,
        install: state
      });
      return;
    }

    if (outdated)
      ok(`Updated installation metadata ${install.version || '(none)'} → ${pkg.version}`);
    else ok(`Already at ${pkg.version}`);

    for (const entry of results) {
      if (entry.ok) print(`  ${green('✔')} ${entry.id.padEnd(9)} ${entry.action}`);
      else print(`  ${red('✖')} ${entry.id.padEnd(9)} ${entry.error}`);
    }
  });

// ---------------------------------------------------------------------------
// uninstall
// ---------------------------------------------------------------------------

program
  .command('uninstall')
  .description('remove MCP client registrations (keeps your data by default)')
  .option('--purge', 'also delete the database, config and secrets', false)
  .option('--yes', 'skip the confirmation required by --purge', false)
  .action((options) => {
    const install = getInstallState();
    const registered = listAgentStatus()
      .filter((entry) => entry.registered)
      .map((entry) => entry.id);
    const targets = [...new Set([...install.agents, ...registered])];

    if (options.purge) {
      const paths = describePaths();
      if (!options.yes) {
        fail('--purge deletes your memory database and cannot be undone.');
        print('  It removes:');
        for (const dir of new Set([paths.dataDir, paths.configDir])) print(`    ${dir}`);
        print(dim('\n  Re-run with --purge --yes if you are certain.'));
        exitWith(2);
      }

      for (const dir of new Set([paths.dataDir, paths.configDir])) {
        fs.rmSync(dir, { recursive: true, force: true });
        ok(`Removed ${dir}`);
      }
      clearInstallState();
      print(dim('\nConfig directory was deleted; install metadata is gone with it.'));
      return;
    }

    const results = targets.length > 0 ? removeAgents(targets) : [];
    clearInstallState();

    if (isJson()) {
      printJson({ agents: results, dataKept: true });
      return;
    }

    for (const entry of results) {
      if (entry.ok) print(`  ${green('✔')} ${entry.id.padEnd(9)} ${entry.action}`);
      else print(`  ${red('✖')} ${entry.id.padEnd(9)} ${entry.error}`);
    }
    if (results.length === 0) warn('No client registration found.');
    ok('Client registrations removed. Your data is untouched.');
    print(dim('  Delete it later with: local-mcp-memory uninstall --purge --yes'));
  });

// ---------------------------------------------------------------------------
// migrate
// ---------------------------------------------------------------------------

program
  .command('migrate')
  .description('migrate a v2.5.x MongoDB instance into the local SQLite database')
  .option('--from <uri>', 'MongoDB connection string (default: MONGO_URI)')
  .option('--db <name>', 'source database name', 'mcp_memory')
  .option('--apply', 'write changes (default is a dry run)', false)
  .option('--backup <dir>', 'directory for the pre-migration backup')
  .option('--report <file>', 'write the migration report as JSON')
  .option('--resume', 'continue a previously interrupted migration', false)
  .option('--on-duplicate <policy>', 'duplicate policy: error, first or last', 'error')
  .option('--orphans <policy>', 'orphan reference policy: error, skip or nullify', 'error')
  .option('--db-path <path>', 'destination SQLite database (default: app data dir)')
  .option('--rollback', 'restore the destination from a migration snapshot', false)
  .option('--verify', 'verify a backup directory without restoring it', false)
  .option('--yes', 'confirm a rollback', false)
  .action(async (options) => {
    let migration;
    try {
      migration = await import('../src/core/migration/mongo-to-sqlite.js');
    } catch (error) {
      fail(`Migration tooling is unavailable: ${error.message}`);
      exitWith(1);
    }

    if (options.verify) {
      if (!options.backup) {
        fail('--verify requires --backup <dir>');
        exitWith(1);
      }
      const result = await migration.verifyBackup({ backupDir: options.backup });
      if (isJson()) {
        printJson(result);
        exitWith(result.ok ? 0 : 1);
      }
      if (result.ok) {
        ok(`Backup verified: ${options.backup}`);
        for (const entry of result.collections) {
          print(`  ${entry.name}: ${entry.actualCount} document(s)`);
        }
      } else {
        fail('Backup verification failed');
        for (const entry of result.collections.filter((item) => !item.ok)) {
          print(`  ${entry.name}: ${entry.error || 'checksum or count mismatch'}`);
        }
        exitWith(1);
      }
      return;
    }

    if (options.rollback) {
      if (!options.backup) {
        fail('--rollback requires --backup <dir>');
        exitWith(1);
      }
      const result = await migration.rollbackMigration({
        backupDir: options.backup,
        dbPath: options.dbPath,
        yes: Boolean(options.yes)
      });
      if (isJson()) {
        printJson(result);
        exitWith(result.ok ? 0 : 1);
      }
      if (result.ok) {
        ok(`Destination restored from ${result.restoredFrom}`);
        print(`  database: ${result.dbPath}`);
        print(`  integrity: ${result.integrity}`);
      } else {
        fail(result.error || 'Rollback failed');
        exitWith(1);
      }
      return;
    }

    const result = await migration.runMigration({
      uri: options.from || process.env.MONGO_URI,
      database: options.db,
      apply: Boolean(options.apply),
      backupDir: options.backup,
      reportPath: options.report,
      resume: Boolean(options.resume),
      onDuplicate: options.onDuplicate,
      orphans: options.orphans,
      dbPath: options.dbPath,
      onProgress: isJson() ? null : (message) => print(dim(`  ${message}`))
    });

    if (isJson()) {
      printJson(result);
      exitWith(result.ok ? 0 : 1);
    }

    if (!result.ok) {
      fail(result.error || 'Migration failed');
      exitWith(1);
    }
  });

// ---------------------------------------------------------------------------
// Data commands
// ---------------------------------------------------------------------------

function addPortOption(command) {
  return command.option(
    '-P, --server-port <port>',
    'port of a running server (auto-detected by default)'
  );
}

addPortOption(
  program
    .command('search <query>')
    .description('search stored memory')
    .option('-p, --project <project>', 'project filter')
    .option('-a, --agent <agent>', 'agent filter')
    .option('-l, --limit <limit>', 'max results', '10')
).action(async (query, options) => {
  const { port } = await requireServer(options.serverPort);
  const params = new URLSearchParams({ query, limit: options.limit });
  if (options.project) params.set('project', options.project);
  if (options.agent) params.set('agent', options.agent);
  try {
    printJson(await apiGet(port, `/context/search?${params}`));
  } catch (error) {
    fail(`Search failed: ${error.message}`);
    exitWith(1);
  }
});

addPortOption(
  program
    .command('store <content>')
    .description('store a memory context')
    .option('-t, --type <type>', 'memory type', 'general')
    .option('-a, --agent <agent>', 'agent id')
    .option('-p, --project <project>', 'project name')
    .option('-T, --tags <tags>', 'comma-separated tags')
).action(async (content, options) => {
  const { port } = await requireServer(options.serverPort);
  const payload = {
    content,
    type: options.type,
    agent: options.agent || process.env.MCP_AGENT || 'cli-user',
    project: options.project || process.env.MCP_PROJECT || 'default',
    tags: options.tags
      ? options.tags
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean)
      : []
  };
  try {
    printJson(await apiPost(port, '/context/store', payload));
  } catch (error) {
    fail(`Failed to store context: ${error.message}`);
    exitWith(1);
  }
});

addPortOption(
  program
    .command('create-task <title>')
    .description('create a coordination task')
    .option('-d, --description <desc>', 'task description')
    .option('--priority <priority>', 'priority 1-5', '3')
    .option('-a, --assigned <agent>', 'assign to agent')
    .option('-p, --project <project>', 'project name')
).action(async (title, options) => {
  const { port } = await requireServer(options.serverPort);
  const payload = {
    title,
    description: options.description || '',
    priority: Number(options.priority),
    assigned_to: options.assigned || null,
    project: options.project || process.env.MCP_PROJECT || 'default'
  };
  try {
    printJson(await apiPost(port, '/task/create', payload));
  } catch (error) {
    fail(`Failed to create task: ${error.message}`);
    exitWith(1);
  }
});

addPortOption(
  program
    .command('list-tasks')
    .description('list tasks')
    .option('-s, --status <status>', 'filter by status')
    .option('-a, --assigned <agent>', 'filter by assigned agent')
    .option('-p, --project <project>', 'project filter')
    .option('-l, --limit <limit>', 'max results', '20')
).action(async (options) => {
  const { port } = await requireServer(options.serverPort);
  const params = new URLSearchParams({ limit: options.limit });
  if (options.status) params.set('status', options.status);
  if (options.assigned) params.set('assigned_to', options.assigned);
  if (options.project) params.set('project', options.project);
  try {
    printJson(await apiGet(port, `/task/list?${params}`));
  } catch (error) {
    fail(`Failed to list tasks: ${error.message}`);
    exitWith(1);
  }
});

addPortOption(
  program
    .command('create-issue <title>')
    .description('create an issue, note or blocker')
    .option('-t, --type <type>', 'bug|note|blocker|insight', 'note')
    .option('-d, --description <desc>', 'issue description')
    .option('-p, --project <project>', 'project name')
).action(async (title, options) => {
  const { port } = await requireServer(options.serverPort);
  const payload = {
    title,
    type: options.type,
    description: options.description || '',
    project: options.project || process.env.MCP_PROJECT || 'default'
  };
  try {
    printJson(await apiPost(port, '/issue/create', payload));
  } catch (error) {
    fail(`Failed to create issue: ${error.message}`);
    exitWith(1);
  }
});

addPortOption(
  program
    .command('list-issues')
    .description('list issues')
    .option('-s, --status <status>', 'filter by status')
    .option('-t, --type <type>', 'filter by type')
    .option('-p, --project <project>', 'project filter')
    .option('-l, --limit <limit>', 'max results', '20')
).action(async (options) => {
  const { port } = await requireServer(options.serverPort);
  const params = new URLSearchParams({ limit: options.limit });
  if (options.status) params.set('status', options.status);
  if (options.type) params.set('type', options.type);
  if (options.project) params.set('project', options.project);
  try {
    printJson(await apiGet(port, `/issue/list?${params}`));
  } catch (error) {
    fail(`Failed to list issues: ${error.message}`);
    exitWith(1);
  }
});

addPortOption(
  program
    .command('list-agents')
    .description('list registered agents')
    .option('-p, --project <project>', 'project filter')
).action(async (options) => {
  const { port } = await requireServer(options.serverPort);
  const params = new URLSearchParams();
  if (options.project) params.set('project', options.project);
  try {
    printJson(await apiGet(port, `/agent/list?${params}`));
  } catch (error) {
    fail(`Failed to list agents: ${error.message}`);
    exitWith(1);
  }
});

addPortOption(program.command('health').description('check a running server')).action(
  async (options) => {
    const { port } = await requireServer(options.serverPort);
    const health = await fetchHealth(port);
    if (!health) {
      fail(`Port ${port} did not answer like a memory server`);
      exitWith(1);
    }
    if (isJson()) printJson(health);
    else ok(`Healthy on port ${port}`);
  }
);

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

// Load per-user environment so PORT / MCP_PROJECT resolve exactly as they do
// inside the server processes. Failures must never stop the CLI.
try {
  loadEnvironment();
} catch {
  /* a broken config file is reported by `doctor`, not here */
}

program.parseAsync(process.argv).catch((error) => {
  fail(error?.message || String(error));
  exitWith(1);
});
