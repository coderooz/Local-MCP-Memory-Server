#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { fileURLToPath, pathToFileURL } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function hasMarker(directory) {
  const markers = [
    ".git",
    ".roo",
    "package.json",
    "pyproject.toml",
    "requirements.txt",
    "Pipfile",
    ".venv"
  ];

  return markers.some((marker) => fs.existsSync(path.join(directory, marker)));
}

function findProjectRoot(startDirectory) {
  let current = path.resolve(startDirectory);

  while (true) {
    if (hasMarker(current)) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return path.resolve(startDirectory);
    }

    current = parent;
  }
}

function slugifyProjectName(name) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "default-project";
}

const projectRoot = findProjectRoot(process.cwd());
const derivedProject = slugifyProjectName(path.basename(projectRoot));

if (!process.env.MCP_PROJECT) {
  process.env.MCP_PROJECT = derivedProject;
}

if (!process.env.MCP_SCOPE) {
  process.env.MCP_SCOPE = "project";
}

const child = spawn(
  process.execPath,
  [path.join(__dirname, "mcp-server.js")],
  {
    env: process.env,
    stdio: ["inherit", "pipe", "pipe"]
  }
);

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});

child.on("error", (error) => {
  console.error("Failed to start MCP shim child process:", error);
  process.exit(1);
});
