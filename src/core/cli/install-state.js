/**
 * Install state and AI-agent registration helpers.
 *
 * The install block lives in the per-user config file (`config.json`) so a
 * later `uninstall` knows exactly which client configs this package modified.
 * Registration is always explicit: `init` never writes to a client config the
 * user did not select.
 */

import {
  applyAgentConfig,
  detectAdapters,
  getAdapter,
  getAdapters,
  inspectAgentConfig,
  removeAgentConfig,
} from '../setup/agent-configs.js';
import { loadUserConfig, saveUserConfig } from '../config/user-config.js';
import { getPackageInfo } from './package-info.js';

/**
 * @returns {{installedAt: string|null, version: string|null, agents: string[]}}
 */
export function getInstallState() {
  const { config } = loadUserConfig();
  return {
    installedAt: config.install?.installedAt || null,
    version: config.install?.version || null,
    agents: Array.isArray(config.install?.agents) ? [...config.install.agents] : [],
  };
}

/**
 * Persist install metadata after a successful `init`.
 *
 * @param {{version?: string, agents: string[]}} state
 */
export function recordInstall(state) {
  const loaded = loadUserConfig();
  const next = {
    ...loaded.config,
    install: {
      installedAt: loaded.config.install?.installedAt || new Date().toISOString(),
      version: state.version || getPackageInfo().version,
      agents: [...new Set(state.agents || [])],
    },
  };
  saveUserConfig(next);
  return getInstallState();
}

/**
 * Forget all install metadata (used by `uninstall`).
 */
export function clearInstallState() {
  const loaded = loadUserConfig();
  saveUserConfig({
    ...loaded.config,
    install: { installedAt: null, version: null, agents: [] },
  });
}

/**
 * Status of every known agent adapter.
 *
 * @returns {Array<{id: string, label: string, filePath: string, configExists: boolean,
 *   clientDetected: boolean, registered: boolean}>}
 */
export function listAgentStatus() {
  return detectAdapters().map((entry) => {
    let registered = false;
    try {
      registered = Boolean(inspectAgentConfig(entry.id).registered);
    } catch {
      registered = false;
    }
    return { ...entry, registered };
  });
}

/**
 * Turn CLI flags into a concrete list of adapter ids.
 *
 * Rules:
 *  - explicit `agents` always wins
 *  - `all` selects every known adapter
 *  - otherwise select clients that are already configured on this machine
 *    (config file exists), never inventing configs for clients that are absent
 *
 * @param {{agents?: string[], all?: boolean, detectedOnly?: boolean}} options
 * @returns {{selected: string[], skipped: string[], unknown: string[]}}
 */
export function resolveAgentSelection(options = {}) {
  const known = getAdapters().map((adapter) => adapter.id);
  const requested = Array.isArray(options.agents)
    ? options.agents
        .flatMap((value) => String(value).split(','))
        .map((v) => v.trim())
        .filter(Boolean)
    : [];

  const unknown = requested.filter((id) => !known.includes(id));
  if (unknown.length > 0) {
    return { selected: [], skipped: [], unknown };
  }

  if (requested.length > 0) {
    return {
      selected: [...new Set(requested)],
      skipped: known.filter((id) => !requested.includes(id)),
      unknown: [],
    };
  }

  if (options.all) {
    return { selected: known, skipped: [], unknown: [] };
  }

  const detected = detectAdapters()
    .filter((entry) => entry.configExists)
    .map((entry) => entry.id);

  return {
    selected: detected,
    skipped: known.filter((id) => !detected.includes(id)),
    unknown: [],
  };
}

/**
 * Register the server in each selected client config.
 *
 * Failures are reported per adapter and never abort the whole run.
 *
 * @param {string[]} ids
 * @param {{local?: boolean}} [options]
 * @returns {Array<{id: string, ok: boolean, action?: string, filePath?: string, error?: string}>}
 */
export function applyAgents(ids, options = {}) {
  return ids.map((id) => {
    const adapter = getAdapter(id);
    if (!adapter) {
      return { id, ok: false, error: 'unknown agent adapter' };
    }
    try {
      const result = applyAgentConfig(id, {
        local: Boolean(options.local),
        dryRun: Boolean(options.dryRun),
      });
      return {
        id,
        ok: true,
        action: result.action,
        filePath: result.filePath,
        backup: result.backup,
      };
    } catch (error) {
      return { id, ok: false, filePath: adapter.filePath, error: error.message };
    }
  });
}

/**
 * Remove the server from each selected client config.
 *
 * @param {string[]} ids
 * @returns {Array<{id: string, ok: boolean, action?: string, filePath?: string, error?: string}>}
 */
export function removeAgents(ids) {
  return ids.map((id) => {
    const adapter = getAdapter(id);
    if (!adapter) {
      return { id, ok: false, error: 'unknown agent adapter' };
    }
    try {
      const result = removeAgentConfig(id);
      return { id, ok: true, action: result.action, filePath: result.filePath };
    } catch (error) {
      return { id, ok: false, filePath: adapter.filePath, error: error.message };
    }
  });
}
