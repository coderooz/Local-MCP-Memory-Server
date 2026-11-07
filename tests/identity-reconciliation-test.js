/**
 * Identity Reconciliation & Naming Verification Test Suite
 *
 * Validates Objective A:
 * - Canonical project identity is `local-mcp-memory`
 * - Package metadata (`package.json`) name is `local-mcp-memory`
 * - CLI executable entry points expose canonical `local-mcp-memory`
 * - Runtime paths, user-config, and agent-config adapters agree on canonical identity
 * - Identity resolution precedence, environment overrides, and fallback behaviors work deterministically
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

test('Identity - Canonical package.json metadata', () => {
  const pkgPath = path.join(ROOT_DIR, 'package.json');
  assert.ok(fs.existsSync(pkgPath), 'package.json must exist');

  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  assert.equal(pkg.name, 'local-mcp-memory', 'Package name must be canonical "local-mcp-memory"');
  assert.ok(pkg.bin, 'package.json must declare bin');
  assert.equal(
    pkg.bin['local-mcp-memory'],
    './bin/cli.js',
    'Canonical binary "local-mcp-memory" must map to ./bin/cli.js'
  );
  assert.equal(
    pkg.bin['mcp-memory'],
    './bin/cli.js',
    'Alias "mcp-memory" must map to ./bin/cli.js'
  );
  assert.equal(
    pkg.bin['local-memory-mcp'],
    './bin/cli.js',
    'Compatibility alias "local-memory-mcp" must map to ./bin/cli.js'
  );
});

test('Identity - CLI entry point name', async () => {
  const cliPath = path.join(ROOT_DIR, 'bin', 'cli.js');
  assert.ok(fs.existsSync(cliPath), 'bin/cli.js must exist');
  const cliContent = fs.readFileSync(cliPath, 'utf8');

  assert.ok(
    cliContent.includes(".name('local-mcp-memory')"),
    'bin/cli.js must configure program name as "local-mcp-memory"'
  );
});

test('Identity - Runtime paths APP_DIR_NAME', async () => {
  const { APP_DIR_NAME, DB_FILE_NAME, describePaths } = await import('../src/core/paths/index.js');
  assert.equal(APP_DIR_NAME, 'local-mcp-memory', 'APP_DIR_NAME must be "local-mcp-memory"');
  assert.equal(DB_FILE_NAME, 'mcp-memory.db', 'DB_FILE_NAME must be "mcp-memory.db"');

  const paths = describePaths();
  assert.ok(paths.dataDir.includes('local-mcp-memory'), 'Data dir must contain canonical identity');
  assert.ok(paths.configDir.includes('local-mcp-memory'), 'Config dir must contain canonical identity');
});

test('Identity - Agent configuration adapters canonical naming', async () => {
  const { SERVER_NAME, PACKAGE_NAME } = await import('../src/core/setup/agent-configs.js');
  assert.equal(SERVER_NAME, 'local-mcp-memory', 'Agent config SERVER_NAME must be "local-mcp-memory"');
  assert.equal(PACKAGE_NAME, 'local-mcp-memory', 'Agent config PACKAGE_NAME must be "local-mcp-memory"');
});

test('Identity - utils/projectIdentity resolution precedence', async () => {
  const { resolveProjectIdentity, findProjectRoot } = await import('../utils/projectIdentity.js');

  // 1. Project root detection
  const detectedRoot = findProjectRoot(ROOT_DIR);
  assert.ok(detectedRoot, 'Project root must be found');

  // 2. Environment variable override takes precedence
  const customEnv = { MCP_PROJECT: 'custom-override-project', MCP_AGENT: 'custom-agent' };
  const resolved = resolveProjectIdentity(ROOT_DIR, customEnv);
  assert.equal(
    resolved.project,
    'custom-override-project',
    'Environment MCP_PROJECT must take precedence when provided'
  );

  // 3. Derived project when MCP_PROJECT is omitted
  const derivedResolved = resolveProjectIdentity(ROOT_DIR, {});
  assert.ok(derivedResolved.project, 'Project name must be derived from directory or package.json');
  assert.equal(
    derivedResolved.project,
    'local-mcp-memory',
    'Derived project from root package.json must be "local-mcp-memory"'
  );
});

test('Identity - Disallow unverified/empty project or agent', async () => {
  const { validateIdentity } = await import('../core/config/runtime-state.js').catch(() => ({}));
  // Ensure that empty or invalid identity inputs are handled safely
  const { resolveProjectIdentity } = await import('../utils/projectIdentity.js');
  const emptyEnvResult = resolveProjectIdentity(ROOT_DIR, { MCP_PROJECT: '' });
  assert.notEqual(emptyEnvResult.project, '', 'Empty project string must fall back to valid name');
  assert.notEqual(emptyEnvResult.project, 'default', 'Must not fall back to generic "default"');
});
