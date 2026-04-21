#!/usr/bin/env node

import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

import {
  findProjectRoot,
  resolveProjectIdentity
} from './utils/projectIdentity.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const initialProjectRoot = findProjectRoot(process.cwd());

dotenv.config({
  path: path.join(initialProjectRoot, '.env'),
  quiet: true
});

const { projectRoot, project: derivedProject } = resolveProjectIdentity(
  process.cwd(),
  process.env
);

if (!process.env.MCP_PROJECT) {
  process.env.MCP_PROJECT = derivedProject;
}

if (!process.env.MCP_PROJECT_ROOT) {
  process.env.MCP_PROJECT_ROOT = projectRoot;
}

if (!process.env.MCP_SCOPE) {
  process.env.MCP_SCOPE = 'project';
}

const child = spawn(
  process.execPath,
  [path.join(__dirname, 'mcp-server.js')],
  {
    env: process.env,
    stdio: ['pipe', 'pipe', 'pipe']
  }
);

process.stdin.pipe(child.stdin);
child.stdout.pipe(process.stdout);
child.stderr.pipe(process.stderr);

process.stdin.on('error', () => {});
child.stdin.on('error', () => {});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    if (!child.killed) {
      child.kill(signal);
    }
  });
}

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});

child.on('error', (error) => {
  process.stderr.write(`Failed to start MCP shim child process: ${error?.message || error}\n`);
  process.exit(1);
});
