/**
 * Version Single Source of Truth (SSOT) Regression Test Suite
 *
 * Verifies that:
 * 1. package.json is the authoritative version source.
 * 2. getPackageInfo() in src/core/cli/package-info.js resolves from package.json without caching staleness.
 * 3. CLI entry point (bin/cli.js) reports the authoritative package version.
 * 4. mcp-server.js serverInfo dynamically uses the package version.
 * 5. server.js health endpoints dynamically use the package version.
 * 6. No hardcoded server version string literals remain in root runtime entry points.
 * 7. package.json and package-lock.json versions remain synchronized.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

test('SSOT - package.json is valid and contains canonical version', () => {
  const pkgPath = path.join(ROOT_DIR, 'package.json');
  assert.ok(fs.existsSync(pkgPath), 'package.json must exist');

  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  assert.ok(pkg.version, 'package.json must declare a version');
  assert.match(pkg.version, /^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/, 'Version must follow SemVer format');
  assert.equal(pkg.version, '2.6.1', 'Release version must be strictly at 2.6.1');
});

test('SSOT - package-lock.json matches package.json version', () => {
  const lockPath = path.join(ROOT_DIR, 'package-lock.json');
  assert.ok(fs.existsSync(lockPath), 'package-lock.json must exist');

  const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf8'));

  assert.equal(lock.version, pkg.version, 'Root lockfile version must match package.json');
  if (lock.packages && lock.packages['']) {
    assert.equal(lock.packages[''].version, pkg.version, 'packages[""] version must match package.json');
  }
});

test('SSOT - src/core/cli/package-info.js exports authoritative version', async () => {
  const { getPackageInfo, PACKAGE_ROOT } = await import('../src/core/cli/package-info.js');
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf8'));

  assert.equal(PACKAGE_ROOT, ROOT_DIR, 'PACKAGE_ROOT must resolve to project root directory');
  const info = getPackageInfo();
  assert.equal(info.version, pkg.version, 'getPackageInfo().version must match package.json version');
  assert.equal(info.name, pkg.name, 'getPackageInfo().name must match package.json name');
});

test('SSOT - CLI reports exact package.json version via --version', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf8'));
  const cliPath = path.join(ROOT_DIR, 'bin', 'cli.js');

  const stdout = execFileSync(process.execPath, [cliPath, '--version'], {
    encoding: 'utf8',
    cwd: ROOT_DIR,
  }).trim();

  assert.equal(stdout, pkg.version, 'CLI --version output must equal package.json version');
});

test('SSOT - No hardcoded server version literals in mcp-server.js serverInfo', () => {
  const mcpServerSource = fs.readFileSync(path.join(ROOT_DIR, 'mcp-server.js'), 'utf8');

  // Verify serverInfo block in mcp-server.js references getPackageInfo().version
  const serverInfoMatch = mcpServerSource.match(/serverInfo:\s*\{[\s\S]*?version:\s*([^,\n]+)/);
  assert.ok(serverInfoMatch, 'mcp-server.js must define serverInfo with version');
  assert.match(
    serverInfoMatch[1].trim(),
    /getPackageInfo\(\)\.version/,
    'mcp-server.js serverInfo.version must dynamically invoke getPackageInfo().version'
  );
});

test('SSOT - No hardcoded server version literals in server.js health endpoints', () => {
  const serverSource = fs.readFileSync(path.join(ROOT_DIR, 'server.js'), 'utf8');

  // Ensure server.js does not contain hardcoded version literals
  const hardcodedInServer = serverSource.match(/\bversion:\s*['"]\d+\.\d+\.\d+['"]/g);
  assert.equal(
    hardcodedInServer,
    null,
    `server.js contains hardcoded version literals: ${hardcodedInServer}`
  );

  // Ensure server.js references getPackageInfo().version for health endpoints
  const healthMatches = serverSource.match(/version:\s*getPackageInfo\(\)\.version/g);
  assert.ok(healthMatches && healthMatches.length >= 2, 'server.js must use getPackageInfo().version in both health endpoints');
});

test('SSOT - Both root entry points import getPackageInfo', () => {
  const mcpServerSource = fs.readFileSync(path.join(ROOT_DIR, 'mcp-server.js'), 'utf8');
  assert.ok(
    mcpServerSource.includes("import { getPackageInfo } from './src/core/cli/package-info.js';"),
    'mcp-server.js must import getPackageInfo from package-info.js'
  );

  const serverSource = fs.readFileSync(path.join(ROOT_DIR, 'server.js'), 'utf8');
  assert.ok(
    serverSource.includes("import { getPackageInfo } from './src/core/cli/package-info.js';"),
    'server.js must import getPackageInfo from package-info.js'
  );
});
