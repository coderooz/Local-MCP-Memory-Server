import {
  readRuntimeFile,
  deleteRuntimeFile,
  getRuntimeFilePath,
  setCurrentProject,
  setProjectRoot,
  invalidateRuntime,
  validateRuntime,
  recoverRuntimeFromActiveServers,
  resolveProjectContext
} from '../config/runtime-state.js';
import { getPortManager, PortManager } from '../config/portManager.js';
import { getConfigValue } from '../config/project-config-loader.js';

export const CONNECTION_STATE = {
  UNKNOWN: 'unknown',
  DISCOVERED: 'discovered',
  VALIDATED: 'validated',
  FAILED: 'failed',
  RECOVERING: 'recovering'
};

export const RECOVERY_STRATEGY = {
  NONE: 'none',
  SCAN: 'scan',
  START_NEW: 'start_new'
};

class RuntimeProvider {
  constructor() {
    this._projectName = null;
    this._projectRoot = null;
  }

  setProject(projectName, projectRoot) {
    this._projectName = projectName;
    this._projectRoot = projectRoot || process.cwd();
    resolveProjectContext(projectName, this._projectRoot);
  }

  getProjectName() {
    return this._projectName;
  }

  getProjectRoot() {
    return this._projectRoot;
  }

  async readRuntime() {
    try {
      const runtime = readRuntimeFile(this._projectName);
      return runtime;
    } catch {
      return null;
    }
  }

  async deleteRuntime() {
    try {
      await deleteRuntimeFile(this._projectName, { force: true });
      invalidateRuntime();
      return true;
    } catch {
      return false;
    }
  }

  async writeRuntime(port, pid) {
    const { setMcpRunning } = await import('../config/runtime-state.js');
    return setMcpRunning(port, pid, this._projectName);
  }
}

export class ConnectionResolver {
  constructor(options = {}) {
    this._projectName = options.projectName || 'local-mcp-memory';
    this._projectRoot = options.projectRoot || process.cwd();
    this._portManager = options.portManager || getPortManager();
    this._runtimeProvider = new RuntimeProvider();
    this._runtimeProvider.setProject(this._projectName, this._projectRoot);
    this._state = CONNECTION_STATE.UNKNOWN;
    this._recoveryStrategy = options.recoveryStrategy || RECOVERY_STRATEGY.SCAN;
    this._maxRetries =
      options.maxRetries || getConfigValue('connection.retry.maxRetries', 5);
    this._baseDelay = options.baseDelay || getConfigValue('connection.retry.baseDelay', 200);
    this._maxDelay = options.maxDelay || getConfigValue('connection.retry.maxDelay', 3200);
  }

  get projectName() {
    return this._projectName;
  }

  get projectRoot() {
    return this._projectRoot;
  }

  get state() {
    return this._state;
  }

  setProject(projectName, projectRoot) {
    this._projectName = projectName;
    this._projectRoot = projectRoot || this._projectRoot;
    this._runtimeProvider.setProject(projectName, projectRoot);
    setCurrentProject(projectName);
    setProjectRoot(this._projectRoot);
  }

  _calculateDelay(attempt) {
    const delay = this._baseDelay * Math.pow(2, Math.max(0, attempt - 1));
    return Math.min(delay, this._maxDelay);
  }

  async _sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async resolveConnection() {
    this._runtimeProvider.setProject(this._projectName, this._projectRoot);

    for (let attempt = 1; attempt <= this._maxRetries; attempt++) {
      const fromFile = await this._tryRuntimeFile();
      if (fromFile.success) {
        return fromFile;
      }

      if (this._recoveryStrategy !== RECOVERY_STRATEGY.NONE) {
        const recovered = await this._performRecovery();
        if (recovered.success) {
          return recovered;
        }
      }

      if (attempt < this._maxRetries) {
        await this._sleep(this._calculateDelay(attempt));
      }
    }

    this._state = CONNECTION_STATE.FAILED;
    return {
      success: false,
      state: this._state,
      message: `No valid MCP runtime found for project "${this._projectName}" after ${this._maxRetries} attempts`
    };
  }

  async _tryRuntimeFile() {
    const runtime = await this._runtimeProvider.readRuntime();
    if (!runtime) {
      return { success: false, state: this._state };
    }

    const validation = await validateRuntime(runtime, {
      expectedProject: this._projectName,
      expectedSignature: runtime.signature,
      requireSignature: true
    });

    if (!validation.valid) {
      await this._runtimeProvider.deleteRuntime();
      return {
        success: false,
        state: this._state,
        reason: validation.reason
      };
    }

    this._state = CONNECTION_STATE.VALIDATED;
    return {
      success: true,
      port: runtime.port,
      pid: runtime.pid,
      signature: runtime.signature,
      strategy: 'runtime-file',
      state: this._state
    };
  }

  async _performRecovery() {
    this._state = CONNECTION_STATE.RECOVERING;
    const recovered = await recoverRuntimeFromActiveServers({
      projectName: this._projectName
    });

    if (!recovered) {
      return {
        success: false,
        state: this._state,
        reason: 'recovery_not_found'
      };
    }

    const validation = await validateRuntime(recovered, {
      expectedProject: this._projectName,
      expectedSignature: recovered.signature,
      requireSignature: true
    });

    if (!validation.valid) {
      await this._runtimeProvider.deleteRuntime();
      return {
        success: false,
        state: this._state,
        reason: validation.reason
      };
    }

    this._state = CONNECTION_STATE.DISCOVERED;
    return {
      success: true,
      port: recovered.port,
      pid: recovered.pid,
      signature: recovered.signature,
      strategy: 'active-scan',
      state: this._state,
      recovered: true
    }
  }

  async startNewServer(port) {
    const available = await this._portManager.isPortAvailable(port);
    
    if (!available) {
      const newPort = await this._portManager.findAvailablePort();
      if (!newPort) {
        return { success: false, error: 'No available ports' };
      }
      port = newPort;
    }
    
    await this._runtimeProvider.writeRuntime(port, process.pid);
    
    return {
      success: true,
      port: port,
      pid: process.pid,
      strategy: 'start_new'
    };
  }

  async invalidateAndRecover() {
    await this._runtimeProvider.deleteRuntime();
    return await this.resolveConnection();
  }

  getStatus() {
    return {
      projectName: this._projectName,
      projectRoot: this._projectRoot,
      state: this._state,
      recoveryStrategy: this._recoveryStrategy,
      portRange: this._portManager.getPortRange()
    };
  }
}

let globalConnectionResolver = null;

export function getConnectionResolver(options = {}) {
  if (!globalConnectionResolver) {
    globalConnectionResolver = new ConnectionResolver(options);
  } else if (options.projectName) {
    globalConnectionResolver.setProject(options.projectName, options.projectRoot);
  }
  return globalConnectionResolver;
}

export function resetConnectionResolver() {
  globalConnectionResolver = null;
}

export { RuntimeProvider };
export default ConnectionResolver;
