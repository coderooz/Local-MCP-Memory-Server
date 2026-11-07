/**
 * Package metadata for the CLI.
 *
 * The CLI must never hardcode its own version or assume the current working
 * directory is the package root: a globally installed package runs from the
 * npx cache or a global `node_modules` directory while the user is somewhere
 * else entirely.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Absolute path to the installed package root. */
export const PACKAGE_ROOT = path.resolve(__dirname, '..', '..', '..');

let cached = null;

/**
 * Read and cache the package manifest.
 *
 * @returns {{name: string, version: string, description: string, engines: object, bin: object}}
 */
export function getPackageInfo() {
  if (cached) return cached;

  const manifestPath = path.join(PACKAGE_ROOT, 'package.json');
  let manifest = {};
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    throw new Error(`cannot read package manifest at ${manifestPath}: ${error.message}`);
  }

  cached = {
    name: manifest.name || 'local-mcp-memory',
    version: manifest.version || '0.0.0',
    description: manifest.description || '',
    engines: manifest.engines || {},
    bin: manifest.bin || {},
    manifestPath,
  };
  return cached;
}

/**
 * Absolute path to a file shipped in the package (e.g. `mcp-server.js`).
 *
 * @param {...string} parts
 * @returns {string}
 */
export function packagePath(...parts) {
  return path.join(PACKAGE_ROOT, ...parts);
}
