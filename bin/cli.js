#!/usr/bin/env node

/**
 * Local MCP Memory Server - CLI
 *
 * Command-line interface for managing the MCP memory server.
 * Provides commands for starting/stopping the server, managing memory,
 * tasks, issues, and agents.
 */

import { Command } from 'commander';
import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import { readFileSync, existsSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';
import http from 'http';

const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(__filename, '..');

const execAsync = promisify(exec);

const program = new Command();

program
  .name('mcp-memory')
  .description('Local MCP Memory Server - CLI for managing agent memory, tasks, and coordination')
  .version('2.6.0');

// Helper: Make HTTP request to API server
async function apiRequest(method, path, body = null, port = null) {
  const serverPort = port || process.env.PORT || 3000;
  const url = `http://localhost:${serverPort}${path}`;

  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname,
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve({ raw: data });
        }
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(JSON.stringify(body));
    }

    req.end();
  });
}

// Helper: Check if server is running
async function checkServer(port) {
  try {
    await apiRequest('GET', '/health', null, port);
    return true;
  } catch {
    return false;
  }
}

// Helper: Get package.json path
function getPackagePath() {
  return join(__dirname, '..', 'package.json');
}

// Helper: Get .env path
function getEnvPath() {
  return join(__dirname, '..', '.env');
}

// Start command
program
  .command('start')
  .description('Start the MCP memory server')
  .option('-p, --port <port>', 'Port to listen on', '0')
  .option('-m, --mode <mode>', 'Server mode: stdio or http', 'stdio')
  .option('-d, --daemon', 'Run as background daemon', false)
  .action(async (options) => {
    const mode = options.mode;
    const port = options.port;

    console.log(`Starting Local MCP Memory Server...`);
    console.log(`Mode: ${mode}`);
    console.log(`Port: ${port === '0' ? 'dynamic' : port}`);

    if (mode === 'stdio') {
      console.log('\nStarting MCP stdio server...');
      console.log('Connect your MCP client to this process via stdio.\n');

      const child = spawn('node', ['mcp-server.js'], {
        stdio: 'inherit',
        env: { ...process.env, PORT: port },
      });

      child.on('error', (err) => {
        console.error('Failed to start server:', err.message);
        process.exit(1);
      });

      child.on('exit', (code) => {
        console.log(`Server exited with code ${code}`);
        process.exit(code);
      });
    } else {
      // HTTP mode
      console.log('\nStarting HTTP API server...');

      const child = spawn('node', ['server.js'], {
        stdio: options.daemon ? 'ignore' : 'inherit',
        detached: options.daemon,
        env: { ...process.env, PORT: port },
      });

      if (options.daemon) {
        child.unref();
        console.log(`Server started as daemon (PID: ${child.pid})`);
        console.log(`PID saved to: ${join(__dirname, '..', '.server.pid')}`);
        writeFileSync(join(__dirname, '..', '.server.pid'), child.pid.toString());
      } else {
        child.on('error', (err) => {
          console.error('Failed to start server:', err.message);
          process.exit(1);
        });

        child.on('exit', (code) => {
          console.log(`Server exited with code ${code}`);
          process.exit(code);
        });
      }
    }
  });

// Stop command
program
  .command('stop')
  .description('Stop the MCP memory server')
  .action(async () => {
    const pidFile = join(__dirname, '..', '.server.pid');

    if (!existsSync(pidFile)) {
      console.log('No server PID file found. Server may not be running.');
      return;
    }

    const pid = parseInt(readFileSync(pidFile, 'utf-8'), 10);

    try {
      process.kill(pid, 'SIGTERM');
      console.log(`Sent SIGTERM to process ${pid}`);
      setTimeout(() => {
        try {
          process.kill(pid, 0);
          console.log('Process still running, sending SIGKILL...');
          process.kill(pid, 'SIGKILL');
        } catch {
          console.log('Server stopped successfully');
        }
      }, 2000);
    } catch (err) {
      console.error(`Failed to stop server: ${err.message}`);
    }
  });

// Status command
program
  .command('status')
  .description('Show server status')
  .option('-p, --port <port>', 'Server port', '3000')
  .action(async (options) => {
    const port = parseInt(options.port, 10);
    const isRunning = await checkServer(port);

    if (isRunning) {
      console.log('Server Status: RUNNING');
      try {
        const health = await apiRequest('GET', '/health', null, port);
        console.log('Health:', JSON.stringify(health, null, 2));
      } catch {
        console.log('Health check failed');
      }
    } else {
      console.log('Server Status: STOPPED');
    }
  });

// Search command
program
  .command('search <query>')
  .description('Search memory')
  .option('-p, --project <project>', 'Project filter')
  .option('-a, --agent <agent>', 'Agent filter')
  .option('-l, --limit <limit>', 'Max results', '10')
  .option('-P, --port <port>', 'Server port', '3000')
  .action(async (query, options) => {
    const port = parseInt(options.port, 10);

    if (!(await checkServer(port))) {
      console.error('Server is not running. Start it with: mcp-memory start');
      process.exit(1);
    }

    try {
      const params = new URLSearchParams({ query, limit: options.limit });
      if (options.project) params.append('project', options.project);
      if (options.agent) params.append('agent', options.agent);

      const result = await apiRequest('GET', `/context/search?${params}`, null, port);
      console.log(JSON.stringify(result, null, 2));
    } catch (err) {
      console.error('Search failed:', err.message);
    }
  });

// Create task command
program
  .command('create-task <title>')
  .description('Create a new task')
  .option('-d, --description <desc>', 'Task description')
  .option('-P, --priority <priority>', 'Priority (1-5)', '3')
  .option('-a, --assigned <agent>', 'Assign to agent')
  .option('-p, --project <project>', 'Project name')
  .option('-P, --port <port>', 'Server port', '3000')
  .action(async (title, options) => {
    const port = parseInt(options.port, 10);

    if (!(await checkServer(port))) {
      console.error('Server is not running. Start it with: mcp-memory start');
      process.exit(1);
    }

    try {
      const body = {
        title,
        description: options.description || '',
        priority: parseInt(options.priority, 10),
        assigned_to: options.assigned || null,
        project: options.project || 'default',
      };

      const result = await apiRequest('POST', '/task/create', body, port);
      console.log('Task created:', JSON.stringify(result, null, 2));
    } catch (err) {
      console.error('Failed to create task:', err.message);
    }
  });

// List tasks command
program
  .command('list-tasks')
  .description('List tasks')
  .option('-s, --status <status>', 'Filter by status')
  .option('-a, --assigned <agent>', 'Filter by assigned agent')
  .option('-p, --project <project>', 'Project filter')
  .option('-l, --limit <limit>', 'Max results', '20')
  .option('-P, --port <port>', 'Server port', '3000')
  .action(async (options) => {
    const port = parseInt(options.port, 10);

    if (!(await checkServer(port))) {
      console.error('Server is not running. Start it with: mcp-memory start');
      process.exit(1);
    }

    try {
      const params = new URLSearchParams({ limit: options.limit });
      if (options.status) params.append('status', options.status);
      if (options.assigned) params.append('assigned_to', options.assigned);
      if (options.project) params.append('project', options.project);

      const result = await apiRequest('GET', `/task/list?${params}`, null, port);
      console.log(JSON.stringify(result, null, 2));
    } catch (err) {
      console.error('Failed to list tasks:', err.message);
    }
  });

// Create issue command
program
  .command('create-issue <title>')
  .description('Create a new issue')
  .option('-t, --type <type>', 'Issue type (bug/note/blocker/insight)', 'note')
  .option('-d, --description <desc>', 'Issue description')
  .option('-p, --project <project>', 'Project name')
  .option('-P, --port <port>', 'Server port', '3000')
  .action(async (title, options) => {
    const port = parseInt(options.port, 10);

    if (!(await checkServer(port))) {
      console.error('Server is not running. Start it with: mcp-memory start');
      process.exit(1);
    }

    try {
      const body = {
        title,
        type: options.type,
        description: options.description || '',
        project: options.project || 'default',
      };

      const result = await apiRequest('POST', '/issue/create', body, port);
      console.log('Issue created:', JSON.stringify(result, null, 2));
    } catch (err) {
      console.error('Failed to create issue:', err.message);
    }
  });

// List issues command
program
  .command('list-issues')
  .description('List issues')
  .option('-s, --status <status>', 'Filter by status')
  .option('-t, --type <type>', 'Filter by type')
  .option('-p, --project <project>', 'Project filter')
  .option('-l, --limit <limit>', 'Max results', '20')
  .option('-P, --port <port>', 'Server port', '3000')
  .action(async (options) => {
    const port = parseInt(options.port, 10);

    if (!(await checkServer(port))) {
      console.error('Server is not running. Start it with: mcp-memory start');
      process.exit(1);
    }

    try {
      const params = new URLSearchParams({ limit: options.limit });
      if (options.status) params.append('status', options.status);
      if (options.type) params.append('type', options.type);
      if (options.project) params.append('project', options.project);

      const result = await apiRequest('GET', `/issue/list?${params}`, null, port);
      console.log(JSON.stringify(result, null, 2));
    } catch (err) {
      console.error('Failed to list issues:', err.message);
    }
  });

// List agents command
program
  .command('list-agents')
  .description('List registered agents')
  .option('-p, --project <project>', 'Project filter')
  .option('-P, --port <port>', 'Server port', '3000')
  .action(async (options) => {
    const port = parseInt(options.port, 10);

    if (!(await checkServer(port))) {
      console.error('Server is not running. Start it with: mcp-memory start');
      process.exit(1);
    }

    try {
      const params = new URLSearchParams();
      if (options.project) params.append('project', options.project);

      const result = await apiRequest('GET', `/agent/list?${params}`, null, port);
      console.log(JSON.stringify(result, null, 2));
    } catch (err) {
      console.error('Failed to list agents:', err.message);
    }
  });

// Health check command
program
  .command('health')
  .description('Check server health')
  .option('-P, --port <port>', 'Server port', '3000')
  .action(async (options) => {
    const port = parseInt(options.port, 10);

    if (!(await checkServer(port))) {
      console.log('Server is NOT running');
      process.exit(1);
    }

    try {
      const health = await apiRequest('GET', '/health', null, port);
      console.log('Server is healthy');
      console.log(JSON.stringify(health, null, 2));
    } catch (err) {
      console.error('Health check failed:', err.message);
      process.exit(1);
    }
  });

// Store context command
program
  .command('store <content>')
  .description('Store a memory context')
  .option('-t, --type <type>', 'Memory type', 'general')
  .option('-a, --agent <agent>', 'Agent ID')
  .option('-p, --project <project>', 'Project name')
  .option('-T, --tags <tags>', 'Comma-separated tags')
  .option('-P, --port <port>', 'Server port', '3000')
  .action(async (content, options) => {
    const port = parseInt(options.port, 10);

    if (!(await checkServer(port))) {
      console.error('Server is not running. Start it with: mcp-memory start');
      process.exit(1);
    }

    try {
      const body = {
        content,
        type: options.type,
        agent: options.agent || 'cli-user',
        project: options.project || 'default',
        tags: options.tags ? options.tags.split(',').map((t) => t.trim()) : [],
      };

      const result = await apiRequest('POST', '/context/store', body, port);
      console.log('Context stored:', JSON.stringify(result, null, 2));
    } catch (err) {
      console.error('Failed to store context:', err.message);
    }
  });

// Configuration command
program
  .command('config')
  .description('Show current configuration')
  .action(() => {
    const envPath = getEnvPath();
    const pkgPath = getPackagePath();

    console.log('=== Local MCP Memory Server Configuration ===\n');

    if (existsSync(envPath)) {
      console.log('Environment variables (.env):');
      const envContent = readFileSync(envPath, 'utf-8');
      envContent.split('\n').forEach((line) => {
        if (line.trim() && !line.startsWith('#')) {
          const [key, ...value] = line.split('=');
          console.log(`  ${key.trim()}=${value.join('=').trim()}`);
        }
      });
    } else {
      console.log('No .env file found');
    }

    console.log('\nPackage info:');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    console.log(`  Name: ${pkg.name}`);
    console.log(`  Version: ${pkg.version}`);
    console.log(`  Description: ${pkg.description}`);
    console.log(`  Main: ${pkg.main}`);
  });

// Init command - create .env file
program
  .command('init')
  .description('Initialize configuration')
  .action(() => {
    const envPath = getEnvPath();

    if (existsSync(envPath)) {
      console.log('.env file already exists');
      return;
    }

    const defaultEnv = `# Local MCP Memory Server Configuration
# Server
PORT=0
NODE_ENV=development

# Database
MCP_DB_PATH=./data/mcp-memory.db

# Project
MCP_PROJECT=default-project
MCP_AGENT=unknown
MCP_SCOPE=project

# Security (optional)
# API_KEY=your-api-key-here
# JWT_SECRET=your-jwt-secret-here

# Browser Automation (optional)
# PLAYWRIGHT_BROWSERS_PATH=/path/to/browsers
`;

    writeFileSync(envPath, defaultEnv);
    console.log('Created .env file with default configuration');
    console.log('Edit .env to customize settings');
  });

program.parse();
