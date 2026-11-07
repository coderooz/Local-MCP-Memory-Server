import { execSync, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

async function runPhaseBVerification() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-pub-verify-'));
  const testDbDir = path.join(tempDir, 'test-db');
  fs.mkdirSync(testDbDir, { recursive: true });
  console.log(`[Phase B] Created isolated verification directory: ${tempDir}`);
  console.log(`[Phase B] Isolated database directory: ${testDbDir}`);

  try {
    fs.writeFileSync(
      path.join(tempDir, 'package.json'),
      JSON.stringify({ name: 'disposable-pub-test', type: 'module' }, null, 2)
    );

    console.log('[Phase B] Installing local-mcp-memory@2.6.1 from public npm registry...');
    execSync('npm install local-mcp-memory@2.6.1', {
      cwd: tempDir,
      stdio: 'inherit',
      env: { ...process.env, npm_config_registry: 'https://registry.npmjs.org/' }
    });
    console.log('[Phase B] Installation succeeded!');

    const pkgJsonPath = path.join(tempDir, 'node_modules', 'local-mcp-memory', 'package.json');
    if (!fs.existsSync(pkgJsonPath)) {
      throw new Error(`Package JSON missing at ${pkgJsonPath}`);
    }
    const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
    console.log(`[Phase B] Verified installed package: ${pkg.name}@${pkg.version}`);
    if (pkg.name !== 'local-mcp-memory' || pkg.version !== '2.6.1') {
      throw new Error(`Unexpected package name or version: ${pkg.name}@${pkg.version}`);
    }

    // Verify bin entries
    const expectedBins = ['local-mcp-memory', 'mcp-memory', 'local-memory-mcp'];
    for (const b of expectedBins) {
      if (!pkg.bin || !pkg.bin[b]) {
        throw new Error(`Missing expected bin declaration for ${b}`);
      }
      const binFile = path.resolve(path.join(tempDir, 'node_modules', 'local-mcp-memory'), pkg.bin[b]);
      if (!fs.existsSync(binFile)) {
        throw new Error(`Bin file target for ${b} does not exist: ${binFile}`);
      }
      console.log(`[Phase B] Verified bin alias '${b}' -> ${pkg.bin[b]}`);
    }

    // Test CLI help via node on bin/cli.js
    const cliPath = path.join(tempDir, 'node_modules', 'local-mcp-memory', 'bin', 'cli.js');
    const helpOutput = execSync(`node "${cliPath}" --help`, { cwd: tempDir, encoding: 'utf8' });
    if (!helpOutput.includes('Usage: local-mcp-memory') && !helpOutput.includes('mcp-memory')) {
      throw new Error('CLI help output unexpected: ' + helpOutput.slice(0, 200));
    }
    console.log('[Phase B] Verified CLI help output');

    const versionOutput = execSync(`node "${cliPath}" --version`, { cwd: tempDir, encoding: 'utf8' });
    if (!versionOutput.includes('2.6.1')) {
      throw new Error(`CLI version output does not match 2.6.1: ${versionOutput}`);
    }
    console.log(`[Phase B] Verified CLI --version output: ${versionOutput.trim()}`);

    // Helper to run JSON-RPC MCP stdio session
    async function runMcpSession(sessionCallback) {
      return new Promise((resolve, reject) => {
        const mcpServerPath = path.join(tempDir, 'node_modules', 'local-mcp-memory', 'mcp-server.js');
        const child = spawn('node', [mcpServerPath], {
          cwd: tempDir,
          env: {
            ...process.env,
            NODE_ENV: 'test',
            MCP_DATA_DIR: testDbDir,
            SQLITE_DB_PATH: path.join(testDbDir, 'test-mcp.db'),
            MCP_PROJECT: 'phase-b-test',
            MCP_AGENT: 'phase-b-agent',
            PORT: '3998'
          },
          stdio: ['pipe', 'pipe', 'inherit']
        });

        let buffer = '';
        const pendingResolvers = new Map();

        child.stdout.on('data', chunk => {
          buffer += chunk.toString();
          const lines = buffer.split('\n');
          buffer = lines.pop(); // keep remainder
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
              const msg = JSON.parse(trimmed);
              if (msg.id !== undefined && pendingResolvers.has(msg.id)) {
                const cb = pendingResolvers.get(msg.id);
                pendingResolvers.delete(msg.id);
                cb(msg);
              }
            } catch (err) {
              // Ignore non-json stdout lines
            }
          }
        });

        let nextId = 1;
        function sendRequest(method, params = {}) {
          return new Promise(res => {
            const id = nextId++;
            pendingResolvers.set(id, res);
            const req = JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n';
            child.stdin.write(req);
          });
        }

        function sendNotification(method, params = {}) {
          const req = JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n';
          child.stdin.write(req);
        }

        sessionCallback({ sendRequest, sendNotification, child })
          .then(async result => {
            child.kill();
            resolve(result);
          })
          .catch(err => {
            child.kill();
            reject(err);
          });
      });
    }

    console.log('[Phase B] Testing MCP stdio handshake, tool discovery, store & search...');
    const testRecordContent = 'PHASE_B_VERIFIED_PERSISTENCE_RECORD_261';

    await runMcpSession(async ({ sendRequest, sendNotification }) => {
      // 1. Initialize
      const initResp = await sendRequest('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'phase-b-verifier', version: '1.0.0' }
      });
      console.log(`[Phase B] MCP Initialize Response: Server=${initResp.result?.serverInfo?.name || 'mcp-server'} Version=${initResp.result?.serverInfo?.version || 'unknown'}`);
      if (!initResp.result) {
        throw new Error(`Init response invalid: ${JSON.stringify(initResp)}`);
      }

      sendNotification('notifications/initialized');

      // 2. tools/list
      const toolsResp = await sendRequest('tools/list');
      const tools = toolsResp.result?.tools || [];
      console.log(`[Phase B] Discovered ${tools.length} MCP tools`);
      if (tools.length === 0) {
        throw new Error('Zero tools discovered!');
      }

      // 3. store_context
      const storeResp = await sendRequest('tools/call', {
        name: 'store_context',
        arguments: {
          content: testRecordContent,
          type: 'architecture',
          tags: ['phase-b', 'test']
        }
      });
      console.log('[Phase B] store_context response received');
      if (storeResp.error) {
        throw new Error(`store_context error: ${JSON.stringify(storeResp.error)}`);
      }

      // 4. search_context
      const searchResp = await sendRequest('tools/call', {
        name: 'search_context',
        arguments: {
          query: 'PHASE_B_VERIFIED'
        }
      });
      console.log('[Phase B] search_context response received');
      const searchContent = JSON.stringify(searchResp.result?.content || []);
      if (!searchContent.includes(testRecordContent)) {
        throw new Error(`Search context did not return stored record: ${searchContent}`);
      }
      console.log('[Phase B] Search returned stored record successfully!');
    });

    // 5. Test Persistence across session restart!
    console.log('[Phase B] Testing persistence across process restart...');
    await runMcpSession(async ({ sendRequest, sendNotification }) => {
      await sendRequest('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'phase-b-verifier-restart', version: '1.0.0' }
      });
      sendNotification('notifications/initialized');

      const searchResp2 = await sendRequest('tools/call', {
        name: 'search_context',
        arguments: {
          query: 'PHASE_B_VERIFIED'
        }
      });
      const searchContent2 = JSON.stringify(searchResp2.result?.content || []);
      if (!searchContent2.includes(testRecordContent)) {
        throw new Error(`Persistence failed! Record missing after restart: ${searchContent2}`);
      }
      console.log('[Phase B] Persistence test PASSED! Record survived process restart in SQLite database.');
    });

    console.log('[Phase B] ALL 15 REQUIRED CHECKS PASSED 100%!');
  } finally {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (e) {
      // Ignored if file locked
    }
  }
}

runPhaseBVerification().catch(err => {
  console.error('[Phase B] Verification failed:', err);
  process.exit(1);
});
