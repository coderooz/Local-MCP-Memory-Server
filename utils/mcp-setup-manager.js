import path from 'path';
import { fileURLToPath } from 'url';
import { getPortRegistry, MCPLogger } from './mcp-port-registry.js';
import { getConnectionManager } from './mcp-connection-manager.js';
import { getRuntimeState, validatePortWithHealth } from '../core/config/runtime-state.js';
import { getConnectionResolver, RECOVERY_STRATEGY } from '../core/config/connectionResolver.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

export const SETUP_STATES = {
  PENDING: 'pending',
  CHECKING: 'checking',
  CONFIGURING: 'configuring',
  VALIDATING: 'validating',
  READY: 'ready',
  FAILED: 'failed'
};

export const SETUP_ERRORS = {
  NO_PORT_DISCOVERED: 'NO_PORT_DISCOVERED',
  SERVER_NOT_REACHABLE: 'SERVER_NOT_REACHABLE',
  HEALTH_CHECK_FAILED: 'HEALTH_CHECK_FAILED',
  CONFIG_INVALID: 'CONFIG_INVALID',
  INITIALIZATION_FAILED: 'INITIALIZATION_FAILED',
  VALIDATION_FAILED: 'VALIDATION_FAILED'
};

class MCPSetupManager {
  constructor(options = {}) {
    this._portRegistry = getPortRegistry();
    this._connectionManager = null;
    this._resolver = null;
    this._state = SETUP_STATES.PENDING;
    this._lastCheckResult = null;
    this._lastValidationResult = null;
    this._autoHealEnabled = options.autoHeal ?? true;
    this._maxSetupAttempts = options.maxSetupAttempts ?? 3;
    this._setupAttempts = 0;
    this._initialized = false;

    this._configFiles = {
      configFile: 'mcp.config.json',
      projectFile: '.mcp-project'
    };

    this._requiredEnvVars = ['MCP_SCOPE'];
    this._optionalEnvVars = ['MCP_AGENT', 'MCP_PROJECT', 'MCP_SERVER_URL'];
    this._projectName = process.env.MCP_PROJECT || 'local-mcp-memory';
    this._projectRoot = process.env.MCP_PROJECT_ROOT || process.cwd();
  }

  get state() {
    return this._state;
  }

  get isReady() {
    return this._state === SETUP_STATES.READY;
  }

  get lastCheckResult() {
    return this._lastCheckResult;
  }

  get lastValidationResult() {
    return this._lastValidationResult;
  }

  async initialize() {
    if (this._initialized) {
      return;
    }

    this._initialized = true;
    this._connectionManager = getConnectionManager();
    this._resolver = getConnectionResolver({
      projectName: this._projectName,
      projectRoot: this._projectRoot,
      recoveryStrategy: RECOVERY_STRATEGY.SCAN,
      maxRetries: 5
    });
  }

  async setupCheck() {
    await this.initialize();
    this._state = SETUP_STATES.CHECKING;

    const result = {
      passed: true,
      checks: {},
      errors: [],
      warnings: []
    };

    result.checks.portDiscovered = await this._checkPortDiscovery();
    if (!result.checks.portDiscovered) {
      result.passed = false;
      result.errors.push({
        code: SETUP_ERRORS.NO_PORT_DISCOVERED,
        message: 'No MCP server discovered on known ports'
      });
    }

    if (result.checks.portDiscovered) {
      result.checks.serverReachable = await this._checkServerReachable();
      if (!result.checks.serverReachable) {
        result.passed = false;
        result.errors.push({
          code: SETUP_ERRORS.SERVER_NOT_REACHABLE,
          message: 'MCP server not reachable'
        });
      }
    }

    result.checks.configValid = await this._checkConfigFiles();
    if (!result.checks.configValid) {
      result.warnings.push({
        code: SETUP_ERRORS.CONFIG_INVALID,
        message: 'Some config files may be invalid'
      });
    }

    result.checks.envVarsSet = this._checkEnvVars();
    if (!result.checks.envVarsSet) {
      result.warnings.push({
        code: SETUP_ERRORS.CONFIG_INVALID,
        message: 'Some environment variables may not be set'
      });
    }

    if (result.passed) {
      result.checks.healthEndpoint = await this._checkHealthEndpoint();
      if (!result.checks.healthEndpoint) {
        result.passed = false;
        result.errors.push({
          code: SETUP_ERRORS.HEALTH_CHECK_FAILED,
          message: 'Health endpoint not responding or not MCP server'
        });
      }
    }

    this._lastCheckResult = result;
    MCPLogger.setupCheck(result);

    this._state = result.passed ? SETUP_STATES.READY : SETUP_STATES.PENDING;

    return result;
  }

  async setupConfigure() {
    await this.initialize();

    if (this._setupAttempts >= this._maxSetupAttempts) {
      MCPLogger._log('Setup', `Max setup attempts (${this._maxSetupAttempts}) reached`);
      return {
        success: false,
        error: 'Max setup attempts reached'
      };
    }

    this._setupAttempts++;
    this._state = SETUP_STATES.CONFIGURING;

    const result = {
      success: true,
      actions: []
    };

    try {
      const resolved = await this._resolver.resolveConnection();
      if (resolved.success && resolved.port) {
        MCPLogger.setupConfigure(`MCP server resolved on port ${resolved.port}`);
        result.actions.push('runtime_resolved');
      } else {
        result.success = false;
        result.error = resolved.message || 'Could not resolve MCP runtime';
        MCPLogger._log('Setup', 'MCP server discovery failed');
      }
    } catch (error) {
      MCPLogger.connectionError(error, { operation: 'setupConfigure' });
      result.success = false;
      result.error = error.message;
    }

    MCPLogger.setupConfigure(`Configuration completed: ${result.actions.join(', ')}`);

    return result;
  }

  async setupValidate() {
    await this.initialize();
    this._state = SETUP_STATES.VALIDATING;

    const result = {
      passed: true,
      checks: {},
      errors: []
    };

    try {
      const port = await this._portRegistry.readPort();
      if (!port) {
        result.passed = false;
        result.errors.push('Port not registered in memory');
        return result;
      }

      result.checks.portResolution = true;

      if (!this._connectionManager) {
        this._connectionManager = getConnectionManager();
      }

      try {
        await this._connectionManager.connect();
        result.checks.connection = true;
      } catch (error) {
        result.passed = false;
        result.errors.push(`Connection failed: ${error.message}`);
        return result;
      }

      const healthCheck = await this._connectionManager._performHealthCheck();
      if (!healthCheck.success) {
        result.passed = false;
        result.errors.push('Health endpoint validation failed');
        return result;
      }

      result.checks.healthEndpoint = true;
      result.checks.mcpIdentity = healthCheck.data?.service === 'MCP';

      result.checks.agentCommunication = await this._checkAgentCommunication();

      this._lastValidationResult = result;
      MCPLogger.setupValidate(result.passed);

      this._state = result.passed ? SETUP_STATES.READY : SETUP_STATES.FAILED;

      return result;
    } catch (error) {
      MCPLogger.connectionError(error, { operation: 'setupValidate' });
      result.passed = false;
      result.errors.push(error.message);
      this._state = SETUP_STATES.FAILED;
      return result;
    }
  }

  async fullSetup() {
    await this.initialize();

    MCPLogger._log('Setup', 'Starting full MCP setup');

    const checkResult = await this.setupCheck();

    if (!checkResult.passed) {
      MCPLogger.setupConfigure('setupCheck failed, running setupConfigure');

      const configureResult = await this.setupConfigure();
      if (!configureResult.success) {
        return {
          success: false,
          stage: 'configure',
          error: configureResult.error
        };
      }
    }

    const validateResult = await this.setupValidate();
    if (!validateResult.passed) {
      return {
        success: false,
        stage: 'validate',
        errors: validateResult.errors
      };
    }

    MCPLogger._log('Setup', 'Full MCP setup completed successfully');

    return {
      success: true,
      stage: 'complete',
      checkResult,
      validateResult
    };
  }

  async autoHeal() {
    if (!this._autoHealEnabled) {
      return { healed: false, reason: 'auto-heal disabled' };
    }

    MCPLogger._log('Setup', 'Attempting auto-heal');

    await this._connectionManager?.disconnect('auto_heal');

    await this._portRegistry.cleanupStalePort();

    const checkResult = await this.setupCheck();

    if (!checkResult.passed) {
      await this.setupConfigure();
    }

    const validateResult = await this.setupValidate();

    return {
      healed: validateResult.passed,
      checkResult,
      validateResult
    };
  }

  async _checkPortDiscovery() {
    try {
      const resolved = await this._resolver.resolveConnection();
      return Boolean(resolved.success && resolved.port);
    } catch {
      return false;
    }
  }

  async _checkConfigFile() {
    const configFilePath = path.join(PROJECT_ROOT, this._configFiles.configFile);
    try {
      const fs = await import('fs');
      await fs.promises.access(configFilePath, fs.constants.F_OK);
      const content = await fs.promises.readFile(configFilePath, 'utf8');
      JSON.parse(content);
      return true;
    } catch {
      return false;
    }
  }

  async _checkConfigFiles() {
    const fs = await import('fs');
    const checks = [];

    for (const fileName of Object.values(this._configFiles)) {
      const filePath = path.join(PROJECT_ROOT, fileName);
      try {
        await fs.promises.access(filePath, fs.constants.F_OK);
        checks.push({ file: fileName, exists: true });
      } catch {
        checks.push({ file: fileName, exists: false });
      }
    }

    return checks.every((c) => c.exists);
  }

  _checkEnvVars() {
    const missing = [];
    for (const varName of this._requiredEnvVars) {
      if (!process.env[varName]) {
        missing.push(varName);
      }
    }
    return missing.length === 0;
  }

  async _checkServerReachable() {
    try {
      const port = await this._portRegistry.readPort();
      if (!port) {
        return false;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);

      const response = await fetch(`http://localhost:${port}/health`, {
        method: 'GET',
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      return response.ok;
    } catch {
      return false;
    }
  }

  async _checkHealthEndpoint() {
    try {
      const port = await this._portRegistry.readPort();
      if (!port) {
        return false;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`http://localhost:${port}/health`, {
        method: 'GET',
        headers: { 'X-MCP-Health-Check': 'true' },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return false;
      }

      const data = await response.json();
      return data && data.service === 'MCP' && data.status === 'ok';
    } catch {
      return false;
    }
  }

  async _checkAgentCommunication() {
    try {
      const port = await this._portRegistry.readPort();
      if (!port) {
        return false;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`http://localhost:${port}/agent/list`, {
        method: 'GET',
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      return response.ok;
    } catch {
      return false;
    }
  }

  async _generateDefaultConfigs() {
    const fs = await import('fs');
    const defaultConfig = {
      mcpServers: {
        'local-mcp-memory': {
          type: 'local',
          command: ['node', path.join(PROJECT_ROOT, 'mcp-server.js')],
          environment: {
            MCP_SCOPE: process.env.MCP_SCOPE || 'project',
            MCP_PROJECT: process.env.MCP_PROJECT || this._projectName
          },
          enabled: true,
          timeout: 30000
        }
      }
    };

    const configPath = path.join(PROJECT_ROOT, this._configFiles.configFile);

    try {
      await fs.promises.writeFile(configPath, JSON.stringify(defaultConfig, null, 2), 'utf8');
    } catch (error) {
      MCPLogger.connectionError(error, { operation: '_generateDefaultConfigs' });
    }
  }

  async _ensureServerRunning() {
    const port = await this._portRegistry.readPort();

    if (!port) {
      throw new Error('Cannot ensure server running: port not registered');
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    try {
      await fetch(`http://localhost:${port}/health`, {
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      return;
    } catch {
      clearTimeout(timeoutId);
      MCPLogger._log('Setup', 'Server not running, but cannot auto-start in this context');
    }
  }

  getStatus() {
    return {
      state: this._state,
      isReady: this.isReady,
      autoHealEnabled: this._autoHealEnabled,
      setupAttempts: this._setupAttempts,
      maxSetupAttempts: this._maxSetupAttempts,
      lastCheckResult: this._lastCheckResult,
      lastValidationResult: this._lastValidationResult,
      configFiles: this._configFiles,
      requiredEnvVars: this._requiredEnvVars
    };
  }

  reset() {
    this._state = SETUP_STATES.PENDING;
    this._lastCheckResult = null;
    this._lastValidationResult = null;
    this._setupAttempts = 0;
    this._initialized = false;
  }
}

let globalSetupManager = null;

export function getSetupManager(options = {}) {
  if (!globalSetupManager) {
    globalSetupManager = new MCPSetupManager(options);
  }
  return globalSetupManager;
}

export function resetSetupManager() {
  if (globalSetupManager) {
    globalSetupManager.reset();
  }
}

export { MCPSetupManager };
export default MCPSetupManager;
