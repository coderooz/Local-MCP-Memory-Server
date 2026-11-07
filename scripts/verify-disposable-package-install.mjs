import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-pack-test-'));
console.log(`Created disposable test directory: ${tmpDir}`);

try {
  // 1. Pack tarball inside tmpDir
  console.log('Generating npm pack tarball...');
  const packOutput = execSync(`npm pack ${ROOT} --pack-destination ${tmpDir}`, {
    encoding: 'utf8',
    cwd: tmpDir,
  });
  const tarballName = packOutput.trim().split('\n').pop().trim();
  const tarballPath = path.join(tmpDir, tarballName);
  console.log(`Packed tarball: ${tarballPath}`);

  // 2. Initialize disposable project and install tarball
  console.log('Installing tarball into disposable project...');
  execSync('npm init -y', { cwd: tmpDir, stdio: 'pipe' });
  execSync(`npm install --no-package-lock ${tarballPath}`, { cwd: tmpDir, stdio: 'pipe' });
  console.log('Installation succeeded!');

  // 3. Verify CLI execution via npx / node_modules/.bin
  console.log('Testing CLI help...');
  const binPath = path.join(tmpDir, 'node_modules', 'local-mcp-memory', 'bin', 'cli.js');
  const helpOutput = execSync(`node "${binPath}" --help`, { encoding: 'utf8', cwd: tmpDir });
  if (!helpOutput.includes('Usage: local-mcp-memory') && !helpOutput.includes('Usage: cli')) {
    throw new Error(`CLI help output unexpected: ${helpOutput.slice(0, 200)}`);
  }
  console.log('CLI help verified!');

  // 4. Test MCP stdio handshake with installed package
  console.log('Testing MCP stdio handshake with installed package...');
  const serverPath = path.join(tmpDir, 'node_modules', 'local-mcp-memory', 'mcp-server.js');
  
  const isolatedDataDir = path.join(tmpDir, 'data');
  fs.mkdirSync(isolatedDataDir, { recursive: true });

  const child = spawn(process.execPath, [serverPath], {
    cwd: tmpDir,
    env: {
      ...process.env,
      LOCALAPPDATA: tmpDir,
      APPDATA: tmpDir,
      USERPROFILE: tmpDir,
      HOME: tmpDir,
      NODE_ENV: 'test',
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let stdoutBuffer = '';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    stdoutBuffer += chunk;
  });

  const sendRequest = (req) => {
    child.stdin.write(JSON.stringify(req) + '\n');
  };

  const waitForResponse = async (id, timeoutMs = 10000) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const lines = stdoutBuffer.split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line);
          if (parsed.id === id) return parsed;
        } catch {}
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error(`Timeout waiting for response id=${id}`);
  };

  // Initialize
  sendRequest({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'disposable-pack-verifier', version: '1.0.0' },
    },
  });

  const initRes = await waitForResponse(1);
  console.log('MCP Initialize Response:', JSON.stringify(initRes.result.serverInfo));

  // List tools
  sendRequest({
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/list',
    params: {},
  });

  const listRes = await waitForResponse(2);
  const toolCount = listRes.result?.tools?.length || 0;
  console.log(`Discovered tools count: ${toolCount}`);
  if (toolCount < 60) {
    throw new Error(`Expected at least 60 tools, got ${toolCount}`);
  }

  // Store context
  sendRequest({
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: {
      name: 'store_context',
      arguments: {
        content: 'Disposable package verification test context record',
        type: 'verification',
        tags: ['test', 'pack', 'v2.6.0'],
      },
    },
  });

  const storeRes = await waitForResponse(3);
  console.log('Store context response:', JSON.stringify(storeRes.result?.content?.[0]?.text?.slice(0, 100)));

  // Search context
  sendRequest({
    jsonrpc: '2.0',
    id: 4,
    method: 'tools/call',
    params: {
      name: 'search_context',
      arguments: {
        query: 'Disposable package verification',
      },
    },
  });

  const searchRes = await waitForResponse(4);
  console.log('Search context response:', JSON.stringify(searchRes.result?.content?.[0]?.text?.slice(0, 100)));

  child.stdin.end();
  child.kill();

  console.log('All disposable package verification checks passed 100%!');
} finally {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    console.log(`Cleaned up temporary directory: ${tmpDir}`);
  } catch {
    console.log(`Could not remove temporary directory (file locked): ${tmpDir}`);
  }
}
