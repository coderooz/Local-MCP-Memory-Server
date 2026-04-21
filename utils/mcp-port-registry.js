import { EventEmitter } from 'events';
import {
  getRuntimeState,
  updateRuntimeState,
  discoverPort,
  checkPortAvailable,
  setMcpRunning,
  setMcpStopped,
  onRuntimeUpdate,
  validateRuntime,
  validatePortWithHealth,
  invalidateRuntime,
  clearRuntimeCache,
  readRuntimeFile,
  deleteRuntimeFile,
  getRuntimeFilePath,
  setCurrentProject,
  setProjectRoot
} from '../core/config/runtime-state.js';
import { getDiscoveryPorts } from '../core/config/project-config-loader.js';

export function ensurePort(port) {
  if (typeof port !== 'number' || port <= 0 || port > 65535) {
    throw new Error(`Invalid MCP port: ${port}`);
  }
  return port;
}

const MCPLogger = {
  _log(category, message, data = {}) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      category: `[MCP] ${category}`,
      message,
      ...data,
    };
    if (process.env.MCP_DEBUG === 'true') {
      process.stderr.write(`${JSON.stringify(logEntry)}\n`);
    }
    return logEntry;
  },
  portDiscovery(port, pid) {
    this._log('PortDiscovery', `Port discovered: ${port}`, { port, pid });
  },
  portRegistered(port, pid) {
    this._log('PortRegistry', `Port registered: ${port}`, { port, pid });
  },
  portNotFound() {
    this._log('PortDiscovery', 'No port in memory, scanning...');
  },
  stalePortDetected(port, storedPid, reason = 'unknown') {
    this._log('PortRegistry', `Stale port detected: ${port}`, {
      storedPid,
      currentPid: process.pid,
      reason
    });
  },
  portCleared() {
    this._log('PortRegistry', 'Port cleared from memory');
  },
  retry(retryCount, maxRetries, delay, error) {
    this._log('Connection', `Connection failed, retrying (${retryCount}/${maxRetries})...`, {
      retryCount,
      maxRetries,
      delay,
      error: error?.message || String(error),
    });
  },
  reconnected(port) {
    this._log('Connection', `Reconnected successfully to port ${port}`);
  },
  setupCheck(result) {
    this._log('Setup', `SetupCheck: ${JSON.stringify(result)}`, result);
  },
  setupConfigure(reason) {
    this._log('Setup', `SetupConfigure executed: ${reason}`);
  },
  setupValidate(result) {
    this._log('Setup', `SetupValidate: ${result ? 'PASSED' : 'FAILED'}`);
  },
  healthCheck(status, responseTime) {
    this._log('Health', `Health check ${status}`, { responseTime });
  },
  connectionError(error, context = {}) {
    this._log('Error', `Connection error: ${error.message}`, {
      ...context,
      stack: error.stack,
    });
  },
};

class MCPPortRegistry extends EventEmitter {
  constructor() {
    super();
    this._initialized = false;
    this._updateSubscription = null;
    this._projectName = process.env.MCP_PROJECT || 'local-mcp-memory';
  }

  get portFilePath() {
    return getRuntimeFilePath(this._projectName);
  }

  get currentPort() {
    const runtime = getRuntimeState();
    return runtime.port;
  }

  get currentPid() {
    const runtime = getRuntimeState();
    return runtime.pid;
  }

  _emit(event, data) {
    this.emit(event, data);
  }

  _setupRuntimeListener() {
    this._updateSubscription = onRuntimeUpdate((runtime) => {
      this._emit('port:registered', { port: runtime.port, pid: runtime.pid, project: runtime.project });
    });
  }

  async initialize() {
    if (this._initialized) {
      return;
    }

    this._initialized = true;
    this._setupRuntimeListener();
    setCurrentProject(this._projectName);
    setProjectRoot(process.env.MCP_PROJECT_ROOT || process.cwd());
  }

  getPortFilePath() {
    return getRuntimeFilePath(this._projectName);
  }

  async registerPort(port, pid = process.pid) {
    await this.initialize();

    try {
      const runtime = await setMcpRunning(port, pid, this._projectName);
      
      MCPLogger.portRegistered(port, pid);
      this._emit('port:registered', { port, pid });

      return runtime.port;
    } catch (error) {
      MCPLogger.connectionError(error, { operation: 'registerPort' });
      throw error;
    }
  }

  async readPort() {
    try {
      const fileRuntime = readRuntimeFile(this._projectName);
      const runtime = fileRuntime || getRuntimeState();

      if (!runtime || !runtime.port || !runtime.pid) {
        MCPLogger.portNotFound();
        this._emit('port:not_found');
        return null;
      }

      const validation = await validateRuntime(runtime, {
        expectedProject: this._projectName,
        expectedSignature: runtime.signature,
        requireSignature: true
      });

      if (!validation.valid) {
        MCPLogger.stalePortDetected(runtime.port, runtime.pid, validation.reason);
        await deleteRuntimeFile(this._projectName, { force: true });
        await this.clearPort();
        invalidateRuntime();
        this._emit('port:stale', runtime);
        return null;
      }

      updateRuntimeState(runtime);
      MCPLogger.portDiscovery(runtime.port, runtime.pid);
      this._emit('port:discovered', runtime);

      return runtime.port;
    } catch (error) {
      MCPLogger.connectionError(error, { operation: 'readPort' });
      this._emit('port:error', error);
      return null;
    }
  }

  async _isPidValid(pid) {
    if (!pid || typeof pid !== 'number') {
      return false;
    }
    try {
      process.kill(pid, 0);
      return true;
    } catch (error) {
      if (error.code === 'ESRCH') {
        return false;
      }
      return true;
    }
  }

  async _isPortStale(runtime) {
    if (!runtime || !runtime.pid) {
      return true;
    }

    if (runtime.pid === process.pid) {
      return false;
    }

    try {
      process.kill(runtime.pid, 0);
      return false;
    } catch {
      return true;
    }
  }

  async clearPort() {
    try {
      await setMcpStopped({ projectName: this._projectName, force: true });
      clearRuntimeCache();
      MCPLogger.portCleared();
      this._emit('port:cleared');
    } catch (error) {
      MCPLogger.connectionError(error, { operation: 'clearPort' });
    }
  }

  async cleanupStalePort() {
    const runtime = getRuntimeState();
    
    if (runtime.port && runtime.pid) {
      const isStale = await this._isPortStale(runtime);
      if (isStale) {
        await this.clearPort();
      }
    }
  }

  async fileExists(filePath) {
    try {
      const fs = await import('fs');
      await fs.promises.access(filePath, fs.constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  getDefaultPorts() {
    return getDiscoveryPorts();
  }

  async discoverPort(fallbackPorts = null) {
    const ports = fallbackPorts || this.getDefaultPorts();

    const registeredPort = await this.readPort();
    if (registeredPort) {
      return registeredPort;
    }

    const result = await discoverPort(ports, { projectName: this._projectName });
    if (result) {
      MCPLogger.portDiscovery(result.port, result.pid);
      return result.port;
    }

    return null;
  }

  async _checkPortAvailability(port) {
    return checkPortAvailable(port);
  }

  async waitForPort(maxRetries = 5, baseDelay = 200) {
    let delay = baseDelay;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const port = await this.readPort();

      if (port) {
        MCPLogger.portDiscovery(port, this.currentPid);
        return port;
      }

      MCPLogger.retry(attempt, maxRetries, delay, new Error('Port not available'));

      await new Promise(resolve => setTimeout(resolve, delay));
      delay = Math.min(delay * 2, 10000);
    }

    const discoveredPort = await this.discoverPort();
    if (discoveredPort) {
      MCPLogger.portDiscovery(discoveredPort, this.currentPid);
      return discoveredPort;
    }

    throw new Error(`MCP port not available after ${maxRetries} attempts`);
  }

  async waitForMcpServer(maxRetries = 10, baseDelay = 200) {
    let delay = baseDelay;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const port = await this.readPort();

      if (!port) {
        MCPLogger.retry(attempt, maxRetries, delay, new Error('MCP not ready'));
        await new Promise(resolve => setTimeout(resolve, delay));
        delay = Math.min(delay * 2, 10000);
        continue;
      }

      try {
        const response = await fetch(`http://localhost:${port}/health`, {
          method: 'GET',
          signal: AbortSignal.timeout(3000)
        });

        if (response.ok) {
          const data = await response.json();
          if (data.service === 'MCP') {
            MCPLogger.reconnected(port);
            return port;
          }
        }
      } catch (error) {
        MCPLogger.retry(attempt, maxRetries, delay, error);
      }

      await new Promise(resolve => setTimeout(resolve, delay));
      delay = Math.min(delay * 2, 10000);
    }

    throw new Error(`MCP server not responding after ${maxRetries} attempts`);
  }

  async updateTimestamp() {
    const runtime = getRuntimeState();
    if (!runtime.port) {
      return;
    }

    try {
      updateRuntimeState({
        timestamp: Date.now(),
        lastUpdated: new Date().toISOString(),
      });
      this._emit('port:updated', runtime);
    } catch (error) {
      MCPLogger.connectionError(error, { operation: 'updateTimestamp' });
    }
  }

  getStatus() {
    const runtime = getRuntimeState();
    return {
      initialized: this._initialized,
      currentPort: runtime.port,
      currentPid: runtime.pid,
      portFilePath: getRuntimeFilePath(this._projectName),
      project: this._projectName
    };
  }
  
  destroy() {
    if (this._updateSubscription) {
      this._updateSubscription();
      this._updateSubscription = null;
    }
  }
}

let globalPortRegistry = null;

export function getPortRegistry() {
  if (!globalPortRegistry) {
    globalPortRegistry = new MCPPortRegistry();
  }
  return globalPortRegistry;
}

export function resetPortRegistry() {
  if (globalPortRegistry) {
    globalPortRegistry.destroy();
    globalPortRegistry = null;
  }
}

export { MCPLogger };
export default MCPPortRegistry;
