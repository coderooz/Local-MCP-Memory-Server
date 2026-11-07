/**
 * Documentation Consistency & Link Verification Script
 *
 * Verifies that:
 * 1. All relative links in root markdown and docs/ exist on disk.
 * 2. No stale version claims (e.g. 2.4.x supported) remain in SECURITY.md.
 * 3. No stale port claims (e.g. PORT=4000) remain in README.md.
 * 4. All 17 CLI commands in bin/cli.js are documented in docs/cli-reference.md.
 * 5. All 8 agent adapters in agent-configs.js are documented in docs/mcp-integration.md.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

let errors = 0;
let passed = 0;

function check(assertion, message) {
  if (assertion) {
    passed++;
  } else {
    errors++;
    console.error(`[FAIL] ${message}`);
  }
}

console.log('--- 1. Stale Claim Verifications ---');

const securityMd = fs.readFileSync(path.join(ROOT_DIR, 'SECURITY.md'), 'utf8');
check(securityMd.includes('2.6.x'), 'SECURITY.md must list 2.6.x as supported');
check(!securityMd.includes('2.4.x   | :white_check_mark:'), 'SECURITY.md must not list 2.4.x as active supported');
check(securityMd.includes('JWT Authentication'), 'SECURITY.md must document JWT authentication');
check(securityMd.includes('API Key Management'), 'SECURITY.md must document API key management');
check(securityMd.includes('AES-256-GCM'), 'SECURITY.md must document AES-256-GCM token encryption');

const readmeMd = fs.readFileSync(path.join(ROOT_DIR, 'README.md'), 'utf8');
check(!readmeMd.includes('PORT=4000'), 'README.md must not contain stale PORT=4000');
check(readmeMd.includes('Google Antigravity'), 'README.md must mention Google Antigravity');
check(readmeMd.includes('Roo Code'), 'README.md must mention Roo Code');

console.log('--- 2. CLI Command Parity ---');

const cliReference = fs.readFileSync(path.join(ROOT_DIR, 'docs', 'cli-reference.md'), 'utf8');
const cliSource = fs.readFileSync(path.join(ROOT_DIR, 'bin', 'cli.js'), 'utf8');

const expectedCommands = [
  'init', 'start', 'stop', 'status', 'doctor', 'config', 'update',
  'uninstall', 'migrate', 'search', 'store', 'create-task', 'list-tasks',
  'create-issue', 'list-issues', 'list-agents', 'health'
];

for (const cmd of expectedCommands) {
  check(cliReference.includes(`### \`${cmd}`), `docs/cli-reference.md must document '${cmd}' command`);
}

console.log('--- 3. Agent Adapter Parity ---');

const mcpIntegration = fs.readFileSync(path.join(ROOT_DIR, 'docs', 'mcp-integration.md'), 'utf8');
const expectedAdapters = [
  'Antigravity', 'Claude', 'Cursor', 'Windsurf', 'Cline', 'Roo Code', 'Codex', 'OpenCode'
];

for (const adapter of expectedAdapters) {
  check(mcpIntegration.includes(adapter), `docs/mcp-integration.md must cover '${adapter}'`);
}

console.log('--- 4. Relative Link Validation ---');

const docFiles = [
  'README.md',
  'SECURITY.md',
  'CONTRIBUTING.md',
  'docs/README.md',
  'docs/cli-reference.md',
  'docs/configuration.md',
  'docs/mcp-integration.md',
  'docs/development/README.md',
  'docs/development/testing-guide.md',
  'docs/development/adding-mcp-tool.md',
  'docs/development/adding-agent-adapter.md',
  '.workspace/INDEX.md',
  '.workspace/PRI/README.md',
  '.workspace/LFI/README.md',
  '.agent/AGENTS.md'
];

const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;

for (const relFile of docFiles) {
  const filePath = path.join(ROOT_DIR, relFile);
  if (!fs.existsSync(filePath)) {
    check(false, `Expected documentation file missing: ${relFile}`);
    continue;
  }

  const content = fs.readFileSync(filePath, 'utf8');
  let match;
  while ((match = linkRegex.exec(content)) !== null) {
    const rawTarget = match[2].trim();
    // Skip external URLs, mailto, and anchors
    if (rawTarget.startsWith('http://') || rawTarget.startsWith('https://') || rawTarget.startsWith('mailto:') || rawTarget.startsWith('#')) {
      continue;
    }

    // Strip hash anchors
    const targetPathOnly = rawTarget.split('#')[0];
    if (!targetPathOnly) continue;

    const resolvedTarget = path.resolve(path.dirname(filePath), targetPathOnly);
    check(
      fs.existsSync(resolvedTarget),
      `In ${relFile}: relative link '${rawTarget}' resolves to nonexistent target '${resolvedTarget}'`
    );
  }
}

console.log('\n--- Summary ---');
console.log(`Passed checks: ${passed}`);
console.log(`Failed checks: ${errors}`);

if (errors > 0) {
  process.exit(1);
} else {
  console.log('All documentation consistency and link checks passed cleanly!');
}
