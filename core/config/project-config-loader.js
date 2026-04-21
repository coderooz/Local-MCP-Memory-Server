import fs from 'node:fs';
import path from 'node:path';
import { findProjectRoot, slugifyProjectName } from '../../utils/projectIdentity.js';

function logToStderr(level, message) {
  process.stderr.write(`[MCP Config] [${level}] ${message}\n`);
}

function resolveProjectRoot() {
  if (process.env.MCP_PROJECT_ROOT) {
    return path.resolve(process.env.MCP_PROJECT_ROOT);
  }

  try {
    return findProjectRoot(process.cwd());
  } catch {}

  return path.resolve(process.cwd());
}

function getProjectName(projectRoot) {
  if (process.env.MCP_PROJECT) {
    return slugifyProjectName(process.env.MCP_PROJECT);
  }

  try {
    const packagePath = path.join(projectRoot, 'package.json');
    if (fs.existsSync(packagePath)) {
      const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
      if (pkg?.name) {
        return slugifyProjectName(pkg.name);
      }
    }
  } catch {}

  return slugifyProjectName(path.basename(projectRoot));
}

function clampPort(port) {
  const parsed = Number(port);
  if (!Number.isInteger(parsed)) {
    return 47000;
  }
  return Math.min(65000, Math.max(1024, parsed));
}

function buildDefaultConfig(projectName) {
  const basePort = clampPort(process.env.MCP_BASE_PORT || process.env.PORT || 47000);
  const rangeEnd = Math.min(65535, basePort + 20);

  return {
    project: {
      name: projectName,
      scope: 'project',
      environment: process.env.NODE_ENV || 'development'
    },
    connection: {
      strategy: 'runtime-first',
      preferredPortRange: [basePort, rangeEnd],
      fallbackPorts: [basePort, basePort + 1, basePort + 5, basePort + 10].filter(
        (p) => p <= 65535
      ),
      retry: {
        maxRetries: 5,
        backoff: 'exponential',
        baseDelay: 200,
        maxDelay: 3200
      },
      timeout: 30000,
      maxConcurrentRequests: 10,
      healthCheck: {
        enabled: true,
        timeout: 5000,
        retries: 3,
        interval: 30000
      }
    },
    agent: {
      defaultAgent: 'mcp-orchestrator',
      autoRegister: true,
      heartbeatInterval: 30000,
      permissions: {
        allowToolExecution: true
      },
      behavior: {
        autoOptimize: true,
        allowSelfModification: false,
        maxRetainedContexts: 100,
        autoMemoryCleanup: true
      }
    },
    behavior: {
      ignore: [
        'node_modules/',
        '.git/',
        'logs/',
        'dist/',
        'build/',
        '.next/',
        'coverage/',
        '*.log'
      ],
      askBefore: ['destructive_actions'],
      autoApprove: ['read_operations']
    },
    features: {
      multiAgent: true,
      chat: true,
      messaging: true,
      feedback: true,
      emulator: true,
      memory: {
        enabled: true,
        optimization: true,
        versioning: true
      },
      tasks: {
        concurrency: 'atomic',
        retry: true,
        maxRetries: 3
      }
    },
    security: {
      inputSanitization: true,
      agentIsolation: true,
      idempotency: true
    },
    logging: {
      level: 'minimal',
      errorsOnly: true,
      enabled: true
    },
    rules: {
      ignore: ['node_modules/', '.git/', 'dist/', 'build/', '.next/', 'coverage/', '*.log'],
      protected: ['core/', 'infrastructure/'],
      scanExtensions: ['.js', '.ts', '.jsx', '.tsx', '.json', '.md', '.yml', '.yaml']
    },
    execution: {
      parallelAgents: true,
      maxAgents: 10,
      agentTimeout: 60000
    },
    setup: {
      autoConfigure: true,
      autoHeal: true,
      maxSetupAttempts: 3,
      requiredEnvVars: ['MCP_SCOPE', 'MCP_PROJECT'],
      optionalEnvVars: ['MCP_AGENT', 'NODE_ENV', 'LOG_LEVEL']
    },
    plugins: {
      emulator: {
        enabled: true,
        autoDetect: true
      }
    },
    policies: {}
  };
}

function mergeDeep(target, source) {
  if (!source || typeof source !== 'object') {
    return target;
  }

  const out = { ...target };
  for (const [key, value] of Object.entries(source)) {
    if (Array.isArray(value)) {
      out[key] = [...value];
      continue;
    }
    if (value && typeof value === 'object') {
      out[key] = mergeDeep(out[key] || {}, value);
      continue;
    }
    out[key] = value;
  }
  return out;
}

const PROJECT_ROOT = resolveProjectRoot();
const PROJECT_NAME = getProjectName(PROJECT_ROOT);
const CONFIG_FILE = `${PROJECT_NAME}.project-mcp.json`;
const FORBIDDEN_KEYS = [
  'mongodb:',
  'password',
  'secret_',
  'token',
  'credential',
  'api_key',
  'port',
  'pid',
  'runtime'
];

const DEFAULT_CONFIG = buildDefaultConfig(PROJECT_NAME);

let cachedConfig = null;
let configLoaded = false;

function validateConfig(config) {
  const issues = [];

  function checkForbiddenKeys(obj, pointer = '') {
    for (const [key, value] of Object.entries(obj || {})) {
      const fullPath = pointer ? `${pointer}.${key}` : key;
      if (FORBIDDEN_KEYS.includes(key.toLowerCase())) {
        issues.push(`Forbidden key "${fullPath}" found in config`);
      }
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        checkForbiddenKeys(value, fullPath);
      }
    }
  }

  checkForbiddenKeys(config);

  const retryStrategy = config.connection?.retry || config.mcp?.retryStrategy;
  if (retryStrategy) {
    const { maxRetries, baseDelay, maxDelay } = retryStrategy;
    if (maxRetries < 0 || maxRetries > 10) issues.push('maxRetries must be between 0 and 10');
    if (baseDelay < 50 || baseDelay > 5000) issues.push('baseDelay must be between 50 and 5000');
    if (maxDelay < baseDelay || maxDelay > 30000) {
      issues.push('maxDelay must be between baseDelay and 30000');
    }
  }

  const portRange = config.connection?.preferredPortRange;
  if (portRange) {
    if (!Array.isArray(portRange) || portRange.length !== 2) {
      issues.push('preferredPortRange must be [start,end]');
    } else if (portRange[0] < 1024 || portRange[1] > 65535 || portRange[0] > portRange[1]) {
      issues.push('preferredPortRange must be within 1024-65535 and start<=end');
    }
  }

  return {
    valid: issues.length === 0,
    issues
  };
}

function loadConfig(configPath) {
  try {
    const content = fs.readFileSync(configPath, 'utf8');
    const config = JSON.parse(content);
    const validation = validateConfig(config);
    if (!validation.valid) {
      logToStderr('WARN', `Validation issues: ${validation.issues.join(', ')}`);
    }
    return config;
  } catch (error) {
    if (error.code !== 'ENOENT') {
      logToStderr('WARN', `Failed to load ${configPath}: ${error.message}`);
    }
    return null;
  }
}

function generateDefaultConfig(configPath) {
  try {
    fs.writeFileSync(configPath, `${JSON.stringify(DEFAULT_CONFIG, null, 2)}\n`, 'utf8');
    logToStderr('INFO', `Generated default config at ${configPath}`);
    return DEFAULT_CONFIG;
  } catch (error) {
    logToStderr('ERROR', `Failed to generate config: ${error.message}`);
    return null;
  }
}

function migrateConfig(config) {
  const migrated = { ...config };

  if (config.mcp) {
    if (!migrated.connection) {
      migrated.connection = {};
    }

    if (config.mcp.connection) {
      migrated.connection = mergeDeep(migrated.connection, config.mcp.connection);
    }

    if (config.mcp.port?.fallbackPorts) {
      migrated.connection.fallbackPorts = [...config.mcp.port.fallbackPorts];
    }

    if (!migrated.features) {
      migrated.features = {};
    }

    if (config.memory) {
      migrated.features.memory = config.memory;
    }
    if (config.tasks) {
      migrated.features.tasks = config.tasks;
    }

    delete migrated.mcp;
  }

  if (config.communication) {
    if (!migrated.features) {
      migrated.features = {};
    }
    migrated.features.chat = config.communication.chat;
    migrated.features.messaging = config.communication.messaging;
    migrated.features.multiAgent = config.communication.multiAgent;
  }

  if (config.agent?.behavior) {
    if (!migrated.agent) {
      migrated.agent = { ...DEFAULT_CONFIG.agent };
    }
    migrated.agent.behavior = config.agent.behavior;
  }

  return migrated;
}

function getProjectConfig() {
  if (cachedConfig) {
    return cachedConfig;
  }

  if (configLoaded) {
    return DEFAULT_CONFIG;
  }

  const configPath = path.join(PROJECT_ROOT, CONFIG_FILE);
  if (!fs.existsSync(configPath)) {
    generateDefaultConfig(configPath);
  }

  const loadedConfig = loadConfig(configPath);
  if (loadedConfig) {
    const migrated = migrateConfig(loadedConfig);
    const validation = validateConfig(migrated);
    cachedConfig = validation.valid
      ? mergeDeep(DEFAULT_CONFIG, migrated)
      : { ...DEFAULT_CONFIG };
    if (!validation.valid) {
      logToStderr('WARN', `Config issues detected. Using defaults where required.`);
    }
  } else {
    cachedConfig = { ...DEFAULT_CONFIG };
  }

  configLoaded = true;
  return cachedConfig;
}

function reloadConfig() {
  cachedConfig = null;
  configLoaded = false;
  return getProjectConfig();
}

function getConfigValue(keyPath, defaultValue = undefined) {
  const config = getProjectConfig();
  const keys = keyPath.split('.');
  let value = config;

  for (const key of keys) {
    if (value && typeof value === 'object' && key in value) {
      value = value[key];
    } else {
      return defaultValue;
    }
  }

  return value;
}

function getDiscoveryPorts() {
  const config = getProjectConfig();
  const range = config.connection?.preferredPortRange;
  if (range && Array.isArray(range) && range.length === 2) {
    const ports = [];
    for (let p = range[0]; p <= range[1]; p++) {
      ports.push(p);
    }
    return ports;
  }
  return config.connection?.fallbackPorts || [];
}

function getConnectionStrategy() {
  return getConfigValue('connection.strategy', 'runtime-first');
}

function isFeatureEnabled(feature) {
  const config = getProjectConfig();
  return config.features?.[feature] === true;
}

function isPathIgnored(filePath) {
  const rules = getProjectConfig().behavior?.ignore || getProjectConfig().rules?.ignore;
  if (!rules) return false;

  const normalizedPath = filePath.replace(/\\/g, '/');
  for (const pattern of rules) {
    if (pattern.endsWith('/')) {
      if (normalizedPath.includes(pattern) || normalizedPath.startsWith(pattern)) {
        return true;
      }
      continue;
    }
    if (normalizedPath.endsWith(pattern.replace('*', ''))) {
      return true;
    }
  }

  return false;
}

function isPathProtected(filePath) {
  const rules = getProjectConfig().rules?.protected;
  if (!rules) return false;

  const normalizedPath = filePath.replace(/\\/g, '/');
  for (const pattern of rules) {
    if (normalizedPath.includes(pattern) || normalizedPath.startsWith(pattern)) {
      return true;
    }
  }
  return false;
}

function isPluginEnabled(plugin) {
  const config = getProjectConfig();
  return config.plugins?.[plugin]?.enabled === true || config.features?.[plugin] === true;
}

function getRedisConfig() {
  return getConfigValue('redis', {
    enabled: false,
    url: 'redis://localhost:6379',
    fallbackToMemory: true
  });
}

function getBrowserConfig() {
  return getConfigValue('browser', {
    enabled: false,
    headless: true,
    timeout: 30000
  });
}

function getKnowledgeBaseConfig() {
  return getConfigValue('knowledgeBase', {
    enabled: false,
    storage: 'mongodb'
  });
}

function getPluginList() {
  const config = getProjectConfig();
  const enabledPlugins = [];

  if (config.plugins) {
    for (const [name, settings] of Object.entries(config.plugins)) {
      if (settings.enabled && settings.autoLoad) {
        enabledPlugins.push(name);
      }
    }
  }

  return enabledPlugins;
}

export {
  getProjectConfig,
  reloadConfig,
  getConfigValue,
  getDiscoveryPorts,
  getConnectionStrategy,
  isFeatureEnabled,
  isPluginEnabled,
  getRedisConfig,
  getBrowserConfig,
  getKnowledgeBaseConfig,
  getPluginList,
  isPathIgnored,
  isPathProtected,
  DEFAULT_CONFIG,
  CONFIG_FILE,
  PROJECT_NAME
};
