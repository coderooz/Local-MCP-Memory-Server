import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

test('Workspace Governance — .agent/ Directory Completeness', async (t) => {
  const requiredFiles = [
    '.agent/README.md',
    '.agent/AGENTS.md',
    '.agent/config/agent-policy.json',
    '.agent/config/workspace-policy.json',
    '.agent/config/capabilities.json',
    '.agent/instructions/SYSTEM.md',
    '.agent/instructions/PROJECT_RULES.md',
    '.agent/instructions/WORKFLOW.md',
    '.agent/instructions/SECURITY.md',
    '.agent/instructions/TESTING.md',
    '.agent/instructions/DOCUMENTATION.md',
    '.agent/instructions/RELEASE_POLICY.md',
    '.agent/context/PROJECT_OVERVIEW.md',
    '.agent/context/ARCHITECTURE.md',
    '.agent/context/CURRENT_STATE.md',
    '.agent/context/DECISIONS.md',
    '.agent/context/ACTIVE_WORK.md',
    '.agent/context/KNOWN_LIMITATIONS.md',
    '.agent/memory/README.md',
    '.agent/memory/SESSION_LOG.md',
    '.agent/memory/HANDOFF.md',
    '.agent/maps/PROJECT_MAP.md',
    '.agent/maps/LOGIC_MAP.md',
    '.agent/maps/DEPENDENCY_MAP.md',
    '.agent/maps/DATA_FLOW_MAP.md',
    '.agent/adapters/README.md',
    '.agent/adapters/antigravity/README.md',
    '.agent/adapters/opencode/README.md',
    '.agent/adapters/codex/README.md',
    '.agent/adapters/claude/README.md',
    '.agent/adapters/cline/README.md',
    '.agent/adapters/cursor/README.md',
    '.agent/adapters/windsurf/README.md',
    '.agent/adapters/roo/README.md',
    '.agent/templates/TASK_HANDOFF.md',
    '.agent/templates/SESSION_SUMMARY.md',
    '.agent/templates/DECISION_RECORD.md',
    '.agent/templates/INCIDENT_REPORT.md',
    '.agent/schemas/memory-entry.schema.json',
    '.agent/schemas/agent-config.schema.json',
    '.agent/schemas/handoff.schema.json',
  ];

  for (const relPath of requiredFiles) {
    const fullPath = path.join(ROOT, relPath);
    assert.ok(fs.existsSync(fullPath), `Required .agent file missing: ${relPath}`);
    const stat = fs.statSync(fullPath);
    assert.ok(stat.size > 20, `File appears empty: ${relPath}`);
  }
});

test('Workspace Governance — Root Compatibility Bootstrap Files', async (t) => {
  const bootstrapFiles = [
    'AGENTS.md',
    'CLAUDE.md',
    'GEMINI.md',
    'CODEX.md',
    'OPENCODE.md',
    '.clinerules',
  ];

  for (const relPath of bootstrapFiles) {
    const fullPath = path.join(ROOT, relPath);
    assert.ok(fs.existsSync(fullPath), `Bootstrap file missing: ${relPath}`);
    const content = fs.readFileSync(fullPath, 'utf8');
    assert.match(content, /\.agent\/AGENTS\.md/, `${relPath} must reference .agent/AGENTS.md`);
    assert.match(content, /\.agent\//, `${relPath} must reference .agent/ directory`);
  }
});

test('Workspace Governance — .workspace/ Canonical Directory Completeness', async (t) => {
  const requiredWorkspaceFiles = [
    '.workspace/README.md',
    '.workspace/INDEX.md',
    '.workspace/decisions/ADR-001-sqlite-engine.md',
    '.workspace/decisions/ADR-002-strict-esm.md',
    '.workspace/decisions/ADR-003-dual-repository-isolation.md',
    '.workspace/decisions/ADR-004-unified-agent-workspace.md',
    '.workspace/decisions/ADR-005-zero-data-loss-migration.md',
    '.workspace/specifications/SPEC-001-mcp-implementation.md',
    '.workspace/specifications/SPEC-002-sqlite-storage-engine.md',
    '.workspace/specifications/SPEC-003-multi-agent-workspace.md',
    '.workspace/plans/PLAN-001-release-cutover.md',
    '.workspace/plans/PLAN-002-mongodb-migration.md',
    '.workspace/templates/ADR_TEMPLATE.md',
    '.workspace/templates/SPEC_TEMPLATE.md',
    '.workspace/templates/PLAN_TEMPLATE.md',
    '.workspace/archive/README.md',
    '.workspace/reports/README.md',
    '.workspace/reports/INDEX.md',
    '.workspace/resources/README.md',
  ];

  for (const relPath of requiredWorkspaceFiles) {
    const fullPath = path.join(ROOT, relPath);
    assert.ok(fs.existsSync(fullPath), `Required .workspace file missing: ${relPath}`);
  }
});

test('Workspace Governance — Relative Markdown Link Integrity', async (t) => {
  const scanFiles = [
    '.agent/README.md',
    '.agent/adapters/README.md',
    '.workspace/README.md',
    '.workspace/INDEX.md',
    'AGENTS.md',
    'CLAUDE.md',
    'GEMINI.md',
    'CODEX.md',
    'OPENCODE.md',
    '.clinerules',
  ];

  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;

  for (const relPath of scanFiles) {
    const fullPath = path.join(ROOT, relPath);
    const content = fs.readFileSync(fullPath, 'utf8');
    let match;
    while ((match = linkRegex.exec(content)) !== null) {
      const target = match[2];
      // Skip external links and anchors
      if (target.startsWith('http://') || target.startsWith('https://') || target.startsWith('#')) {
        continue;
      }
      const cleanTarget = target.split('#')[0];
      if (!cleanTarget) continue;

      const targetPath = path.resolve(path.dirname(fullPath), cleanTarget);
      assert.ok(
        fs.existsSync(targetPath),
        `Broken link in ${relPath}: "${target}" resolves to missing path: "${targetPath}"`
      );
    }
  }
});

test('Workspace Governance — Zero Secrets Scan', async (t) => {
  const secretPatterns = [
    /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/,
    /sk-[a-zA-Z0-9]{32,}/,
    /ghp_[a-zA-Z0-9]{36}/,
    /mongodb:\/\/[^:]+:[^@]+@/,
  ];

  function checkDir(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules' && entry.name !== '.git') {
          checkDir(fullPath);
        }
      } else if (entry.isFile() && (entry.name.endsWith('.md') || entry.name.endsWith('.json'))) {
        const text = fs.readFileSync(fullPath, 'utf8');
        for (const pattern of secretPatterns) {
          assert.strictEqual(
            pattern.test(text),
            false,
            `Secret pattern matched in file: ${fullPath}`
          );
        }
      }
    }
  }

  checkDir(path.join(ROOT, '.agent'));
});

test('Workspace Governance — Setup Adapters Enumerate All Supported Agents', async (t) => {
  const { getAdapters } = await import('../src/core/setup/agent-configs.js');
  const adapters = getAdapters();
  const ids = adapters.map((a) => a.id);

  const expectedIds = ['opencode', 'codex', 'claude', 'antigravity', 'cursor', 'windsurf', 'cline', 'roo'];
  for (const exp of expectedIds) {
    assert.ok(ids.includes(exp), `Agent adapter missing from getAdapters(): ${exp}`);
  }
});
