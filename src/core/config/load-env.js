/**
 * Startup environment loading.
 *
 * Order (later wins only where explicitly allowed):
 *  1. `<configDir>/.env`   per-user secrets and overrides
 *  2. `<configDir>/config.json`  non-secret settings (never overrides real env)
 *  3. Real process environment   always wins
 *
 * The package directory is deliberately NOT read: a globally installed package
 * must not carry machine-local secrets, and the npx cache is ephemeral.
 */

import fs from 'node:fs';
import dotenv from 'dotenv';
import { getEnvFilePath } from '../paths/index.js';
import { applyUserConfigToEnv, loadUserConfig } from './user-config.js';

/**
 * Load environment configuration for a server process.
 *
 * @returns {{ envFile: string|null, configFile: string, issues: string[] }}
 */
export function loadEnvironment() {
  const envFile = getEnvFilePath();
  const issues = [];

  if (fs.existsSync(envFile)) {
    const result = dotenv.config({ path: envFile, quiet: true });
    if (result.error) {
      issues.push(`failed to load ${envFile}: ${result.error.message}`);
    }
  }

  const loaded = loadUserConfig();
  if (loaded.issues.length > 0) {
    for (const issue of loaded.issues) {
      issues.push(`${loaded.filePath}: ${issue}`);
    }
  }
  applyUserConfigToEnv(loaded.config);

  return {
    envFile: fs.existsSync(envFile) ? envFile : null,
    configFile: loaded.filePath,
    issues,
  };
}
