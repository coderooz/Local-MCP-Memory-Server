import { getPortRegistry, MCPLogger } from './mcp-port-registry.js';
import { validatePortWithHealth } from '../core/config/runtime-state.js';
import { getConnectionResolver, RECOVERY_STRATEGY } from '../core/config/connectionResolver.js';

export const AGENT_STATES = {
  INITIALIZING: 'initializing',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  READY: 'ready',
  DISCONNECTED: 'disconnected',
  RECONNECTING: 'reconnecting',
  ERROR: 'error'
};

const DEFAULT_CONFIG = {
  maxRetries: 5,
  baseDelay: 200,
  maxDelay: 3200,
  connectionTimeout: 10000,
  healthCheckInterval: 30000
};

class MCPAgentClient {
  constructor(options = {}) {
    this._portRegistry = getPortRegistry();
    this._config = { ...DEFAULT_CONFIG, ...options };
    this._state = AGENT_STATES.INITIALIZING;
    this._serverUrl = null;
    this._retryCount = 0;
    this._retryTimer = null;
    this._healthCheckTimer = null;
    this._isDestroyed = false;
    this._pendingCalls = [];

    this._listeners = new Map();
  }

  get state() {
    return this._state;
  }

  get serverUrl() {
    return this._serverUrl;
  }

  get isConnected() {
    return this._state === AGENT_STATES.CONNECTED || this._state === AGENT_STATES.READY;
  }

  get isReady() {
    return this._state === AGENT_STATES.READY;
  }

  on(event, handler) {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, new Set());
    }
    this._listeners.get(event).add(handler);
    return () => this.off(event, handler);
  }

  off(event, handler) {
    const handlers = this._listeners.get(event);
    if (handlers) {
      handlers.delete(handler);
    }
  }

  _emit(event, data) {
    const handlers = this._listeners.get(event);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(data);
        } catch {}
      }
    }
  }

  async connect(options = {}) {
    if (this._isDestroyed) {
      throw new Error('Agent client has been destroyed');
    }

    this._setState(AGENT_STATES.CONNECTING);

    try {
      const port = await this._discoverServer(options);

      if (!port || typeof port !== 'number') {
        throw new Error('Could not discover MCP server');
      }

      this._serverUrl = `http://localhost:${port}`;

      const healthCheck = await this._performHealthCheck(port);

      if (!healthCheck.success) {
        throw new Error(`Server not healthy: ${healthCheck.error}`);
      }

      this._setState(AGENT_STATES.CONNECTED);
      this._retryCount = 0;

      await this._startHealthMonitor();

      this._emit('connected', {
        port: port,
        serverUrl: this._serverUrl,
        healthData: healthCheck.data
      });

      return {
        success: true,
        port: port,
        serverUrl: this._serverUrl,
        healthData: healthCheck.data
      };
    } catch (error) {
      MCPLogger.connectionError(error, { operation: 'agentConnect' });
      this._handleConnectionError(error);
      throw error;
    }
  }

  async _discoverServer(options = {}) {
    const projectName = process.env.MCP_PROJECT || 'local-mcp-memory';
    const projectRoot = process.env.MCP_PROJECT_ROOT || process.cwd();

    const resolver = getConnectionResolver({
      projectName,
      projectRoot,
      maxRetries: this._config.maxRetries,
      recoveryStrategy: RECOVERY_STRATEGY.SCAN
    });

    const result = await resolver.resolveConnection();
    if (!result.success || !result.port) {
      MCPLogger.setupConfigure('No valid runtime discovered for MCP server');
      return null;
    }

    MCPLogger.portDiscovery(result.port, result.pid || null);
    return result.port;
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

  async _checkPort(port) {
    return new Promise((resolve) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1000);

      fetch(`http://localhost:${port}/health`, {
        method: 'GET',
        signal: controller.signal
      })
        .then((res) => {
          clearTimeout(timeoutId);
          resolve(res.ok);
        })
        .catch(() => {
          clearTimeout(timeoutId);
          resolve(false);
        });
    });
  }

  async _performHealthCheck(port) {
    const timeout = this._config.connectionTimeout;

    return new Promise((resolve) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      fetch(`${this._serverUrl}/health`, {
        method: 'GET',
        headers: { 'X-MCP-Health-Check': 'true' },
        signal: controller.signal
      })
        .then((res) => {
          clearTimeout(timeoutId);
          if (res.ok) {
            return res.json();
          }
          throw new Error(`Health check returned ${res.status}`);
        })
        .then((data) => {
          resolve({ success: true, data });
        })
        .catch((error) => {
          clearTimeout(timeoutId);
          resolve({ success: false, error: error.message });
        });
    });
  }

  _handleConnectionError(error) {
    if (this._shouldRetry(error)) {
      this._scheduleRetry();
    } else {
      this._setState(AGENT_STATES.ERROR);
      this._emit('connection:failed', {
        error: error.message,
        retryCount: this._retryCount,
        reason: 'max_retries_exceeded'
      });
    }
  }

  _shouldRetry(error) {
    const errorCode = error.code || '';
    const retriableCodes = ['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'EHOSTUNREACH'];

    if (retriableCodes.includes(errorCode)) {
      return this._retryCount < this._config.maxRetries;
    }

    if (error.message?.includes('fetch') || error.message?.includes('ECONNREFUSED')) {
      return this._retryCount < this._config.maxRetries;
    }

    return false;
  }

  _calculateDelay() {
    const exponentialDelay = this._config.baseDelay * Math.pow(2, this._retryCount);
    return Math.min(exponentialDelay, this._config.maxDelay);
  }

  _scheduleRetry() {
    if (this._retryTimer) {
      clearTimeout(this._retryTimer);
    }

    this._retryCount++;
    this._setState(AGENT_STATES.RECONNECTING);

    const delay = this._calculateDelay();
    MCPLogger.retry(this._retryCount, this._config.maxRetries, delay, this._lastError);

    this._retryTimer = setTimeout(async () => {
      try {
        await this.connect();
      } catch {}
    }, delay);

    this._emit('reconnecting', {
      attempt: this._retryCount,
      maxRetries: this._config.maxRetries,
      delay
    });
  }

  async _startHealthMonitor() {
    if (this._healthCheckTimer) {
      clearInterval(this._healthCheckTimer);
    }

    const interval = this._config.healthCheckInterval;

    this._healthCheckTimer = setInterval(async () => {
      if (!this.isConnected) {
        return;
      }

      const healthCheck = await this._performHealthCheck();

      if (!healthCheck.success) {
        MCPLogger.setupConfigure('Health monitor detected unhealthy server');
        this._scheduleRetry();
      }
    }, interval);

    this._healthCheckTimer.unref();
  }

  _stopHealthMonitor() {
    if (this._healthCheckTimer) {
      clearInterval(this._healthCheckTimer);
      this._healthCheckTimer = null;
    }
  }

  _setState(newState) {
    const oldState = this._state;
    this._state = newState;
    this._emit('state:changed', { oldState, newState });
  }

  async callApi(endpoint, options = {}) {
    if (!this.isConnected) {
      await this.connect();
    }

    const timeout = options.timeout || this._config.connectionTimeout;

    return new Promise((resolve, reject) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const url = `${this._serverUrl}${endpoint}`;
      const fetchOptions = {
        method: options.method || 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...options.headers
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal
      };

      fetch(url, fetchOptions)
        .then((res) => {
          clearTimeout(timeoutId);
          if (!res.ok) {
            throw new Error(`API call failed: ${res.status}`);
          }
          return res.json();
        })
        .then((data) => {
          resolve(data);
        })
        .catch((error) => {
          clearTimeout(timeoutId);
          if (this._shouldRetry(error)) {
            this._scheduleRetry();
          }
          reject(error);
        });
    });
  }

  async disconnect(reason = 'manual_disconnect') {
    this._stopHealthMonitor();

    if (this._retryTimer) {
      clearTimeout(this._retryTimer);
      this._retryTimer = null;
    }

    this._setState(AGENT_STATES.DISCONNECTED);
    this._emit('disconnected', { reason });
  }

  destroy() {
    this._isDestroyed = true;
    this.disconnect('destroyed');
    this._listeners.clear();
    this._pendingCalls = [];
  }

  getStatus() {
    return {
      state: this._state,
      serverUrl: this._serverUrl,
      isConnected: this.isConnected,
      isReady: this.isReady,
      retryCount: this._retryCount,
      maxRetries: this._config.maxRetries
    };
  }
}

let globalAgentClient = null;

export function getAgentClient(options = {}) {
  if (!globalAgentClient) {
    globalAgentClient = new MCPAgentClient(options);
  }
  return globalAgentClient;
}

export function resetAgentClient() {
  if (globalAgentClient) {
    globalAgentClient.destroy();
    globalAgentClient = null;
  }
}

export { MCPAgentClient };
export default MCPAgentClient;
