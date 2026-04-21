import { EventEmitter } from 'events';
import { getPortRegistry, MCPLogger } from './mcp-port-registry.js';
import { getConfigValue, getDiscoveryPorts } from '../core/config/project-config-loader.js';

export const CONNECTION_STATES = {
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  READY: 'ready',
  RECONNECTING: 'reconnecting',
  ERROR: 'error'
};

export const CONNECTION_ERRORS = {
  ECONNREFUSED: 'ECONNREFUSED',
  ETIMEDOUT: 'ETIMEDOUT',
  ENOTFOUND: 'ENOTFOUND',
  EHOSTUNREACH: 'EHOSTUNREACH',
  NETWORK_ERROR: 'NETWORK_ERROR',
  SERVER_ERROR: 'SERVER_ERROR',
  HEALTH_CHECK_FAILED: 'HEALTH_CHECK_FAILED',
  TIMEOUT: 'TIMEOUT'
};

const CONNECTION_DEBUG = process.env.MCP_DEBUG === 'true';

function loadRetryConfig() {
  return {
    maxRetries: getConfigValue('connection.retry.maxRetries', 5),
    baseDelay: getConfigValue('connection.retry.baseDelay', 200),
    maxDelay: getConfigValue('connection.retry.maxDelay', 3200),
    backoffMultiplier: 2,
    jitterFactor: 0.1
  };
}

function loadHealthCheckConfig() {
  return {
    timeout: getConfigValue('connection.healthCheck.timeout', 5000),
    retries: getConfigValue('connection.healthCheck.retries', 3),
    interval: getConfigValue('connection.healthCheck.interval', 1000)
  };
}

const RETRY_CONFIG = loadRetryConfig();
const HEALTH_CHECK_CONFIG = loadHealthCheckConfig();

class MCPConnectionManager extends EventEmitter {
  constructor(options = {}) {
    super();

    this._portRegistry = getPortRegistry();
    this._state = CONNECTION_STATES.DISCONNECTED;
    this._baseUrl = null;
    this._port = null;
    this._retryCount = 0;
    this._retryTimer = null;
    this._healthCheckTimer = null;
    this._isDestroyed = false;

    this._config = {
      maxRetries: options.maxRetries ?? RETRY_CONFIG.maxRetries,
      baseDelay: options.baseDelay ?? RETRY_CONFIG.baseDelay,
      maxDelay: options.maxDelay ?? RETRY_CONFIG.maxDelay,
      jitterFactor: options.jitterFactor ?? RETRY_CONFIG.jitterFactor,
      healthCheckTimeout: options.healthCheckTimeout ?? HEALTH_CHECK_CONFIG.timeout,
      healthCheckRetries: options.healthCheckRetries ?? HEALTH_CHECK_CONFIG.retries
    };

    this._retryQueue = [];
    this._pendingRequests = new Map();
    this._lastError = null;
    this._connectionAttempts = 0;
    this._lastSuccessfulConnection = null;

    this._setupPortRegistryListeners();
  }

  get state() {
    return this._state;
  }

  get baseUrl() {
    return this._baseUrl;
  }

  get port() {
    return this._port ?? null;
  }

  get isConnected() {
    return this._state === CONNECTION_STATES.CONNECTED || this._state === CONNECTION_STATES.READY;
  }

  get isReady() {
    return this._state === CONNECTION_STATES.READY;
  }

  get retryCount() {
    return this._retryCount;
  }

  get lastError() {
    return this._lastError;
  }

  _setupPortRegistryListeners() {
    this._portRegistry.on('port:registered', (portData) => {
      if (
        this._state === CONNECTION_STATES.RECONNECTING ||
        this._state === CONNECTION_STATES.ERROR
      ) {
        MCPLogger.reconnected(portData.port);
        this._handlePortChange(portData.port);
      }
    });

    this._portRegistry.on('port:stale', () => {
      if (this.isConnected) {
        MCPLogger.setupConfigure('Stale port detected, triggering reconnection');
        this._triggerReconnect();
      }
    });
  }

  async connect(options = {}) {
    if (CONNECTION_DEBUG) process.stderr.write(`[MCP] connect() called, pid: ${process.pid}\n`);

    if (this._isDestroyed) {
      throw new Error('Connection manager has been destroyed');
    }

    const retryConfig = {
      maxRetries: options.maxRetries ?? this._config.maxRetries,
      baseDelay: options.baseDelay ?? this._config.baseDelay
    };

    if (CONNECTION_DEBUG) {
      process.stderr.write(`[MCP] Waiting for port, maxRetries: ${retryConfig.maxRetries}\n`);
    }
    const port = await this._portRegistry.waitForPort(
      retryConfig.maxRetries,
      retryConfig.baseDelay
    );
    if (CONNECTION_DEBUG) process.stderr.write(`[MCP] waitForPort returned: ${port}\n`);

    if (!port) {
      const discovered = await this._portRegistry.discoverPort(options.fallbackPorts);
      if (!discovered) {
        throw new Error('MCP port not available - no port discovered after retries');
      }
      this._port = discovered;
    } else {
      this._port = port;
    }

    if (!this._port || typeof this._port !== 'number') {
      throw new Error(`Invalid MCP port: ${this._port}`);
    }

    this._baseUrl = `http://localhost:${this._port}`;

    this._setState(CONNECTION_STATES.CONNECTING);
    this._connectionAttempts++;

    try {
      const healthCheck = await this._performHealthCheck();

      if (!healthCheck.success) {
        throw new Error(`Health check failed: ${healthCheck.error}`);
      }

      this._setState(CONNECTION_STATES.CONNECTED);
      this._retryCount = 0;
      this._lastSuccessfulConnection = new Date();
      this._lastError = null;

      await this._startHealthCheckMonitor();

      this.emit('connected', {
        port: this._port,
        baseUrl: this._baseUrl,
        attempts: this._connectionAttempts
      });

      this._processRetryQueue(true);

      return {
        success: true,
        port: this._port,
        baseUrl: this._baseUrl,
        healthData: healthCheck.data
      };
    } catch (error) {
      this._handleConnectionError(error);
      throw error;
    }
  }

  async _performHealthCheck(options = {}) {
    const timeout = options.timeout ?? this._config.healthCheckTimeout;
    const retries = options.retries ?? this._config.healthCheckRetries;

    for (let attempt = 1; attempt <= retries; attempt++) {
      const startTime = Date.now();

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const response = await fetch(`${this._baseUrl}/health`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'X-MCP-Health-Check': 'true'
          },
          signal: controller.signal
        });

        clearTimeout(timeoutId);
        const responseTime = Date.now() - startTime;

        if (response.ok) {
          const data = await response.json();
          
          if (data.service !== 'MCP') {
            throw new Error('Invalid MCP server: service identity not confirmed');
          }
          
          const expectedProject = getConfigValue('project.name');
          if (expectedProject && data.project && data.project !== expectedProject) {
            console.warn(`[MCP] Project mismatch: expected "${expectedProject}", got "${data.project}"`);
          }
          
          MCPLogger.healthCheck('OK', responseTime);

          return {
            success: true,
            status: data.status,
            uptime: data.uptime,
            version: data.version,
            project: data.project,
            responseTime,
            data
          };
        }

        throw new Error(`Health check returned status ${response.status}`);
      } catch (error) {
        if (attempt === retries) {
          MCPLogger.healthCheck('FAILED', Date.now() - startTime);
          return {
            success: false,
            error: error.message,
            attempt
          };
        }

        await this._delay(HEALTH_CHECK_CONFIG.interval);
      }
    }

    return { success: false, error: 'Max retries exceeded' };
  }

  _handleConnectionError(error) {
    this._lastError = {
      message: error.message,
      code: this._getErrorCode(error),
      timestamp: new Date(),
      attempts: this._connectionAttempts
    };

    MCPLogger.connectionError(error, {
      port: this._port,
      retryCount: this._retryCount,
      state: this._state
    });

    if (this._shouldRetry(error)) {
      this._scheduleRetry();
    } else {
      this._setState(CONNECTION_STATES.ERROR);
      this._processRetryQueue(false, error);

      this.emit('connection:failed', {
        error: this._lastError,
        reason: 'max_retries_exceeded'
      });
    }
  }

  _shouldRetry(error) {
    const errorCode = this._getErrorCode(error);
    const retriableErrors = [
      CONNECTION_ERRORS.ECONNREFUSED,
      CONNECTION_ERRORS.ETIMEDOUT,
      CONNECTION_ERRORS.ENOTFOUND,
      CONNECTION_ERRORS.EHOSTUNREACH,
      CONNECTION_ERRORS.NETWORK_ERROR,
      CONNECTION_ERRORS.TIMEOUT
    ];

    return retriableErrors.includes(errorCode) && this._retryCount < this._config.maxRetries;
  }

  _getErrorCode(error) {
    if (error.code) {
      return error.code;
    }

    const message = error.message?.toLowerCase() || '';

    if (message.includes('ECONNREFUSED')) return CONNECTION_ERRORS.ECONNREFUSED;
    if (message.includes('ETIMEDOUT')) return CONNECTION_ERRORS.ETIMEDOUT;
    if (message.includes('ENOTFOUND')) return CONNECTION_ERRORS.ENOTFOUND;
    if (message.includes('EHOSTUNREACH')) return CONNECTION_ERRORS.EHOSTUNREACH;
    if (message.includes('fetch')) return CONNECTION_ERRORS.NETWORK_ERROR;
    if (message.includes('timeout')) return CONNECTION_ERRORS.TIMEOUT;

    return CONNECTION_ERRORS.NETWORK_ERROR;
  }

  _calculateDelay() {
    const exponentialDelay =
      this._config.baseDelay * Math.pow(RETRY_CONFIG.backoffMultiplier, this._retryCount);
    const cappedDelay = Math.min(exponentialDelay, this._config.maxDelay);
    const jitter = cappedDelay * this._config.jitterFactor * (Math.random() * 2 - 1);

    return Math.floor(cappedDelay + jitter);
  }

  _scheduleRetry() {
    if (this._retryTimer) {
      clearTimeout(this._retryTimer);
    }

    this._retryCount++;
    this._setState(CONNECTION_STATES.RECONNECTING);

    const delay = this._calculateDelay();
    MCPLogger.retry(this._retryCount, this._config.maxRetries, delay, this._lastError);

    this._retryTimer = setTimeout(async () => {
      try {
        await this.connect();
      } catch {
        // Error handled in connect()
      }
    }, delay);

    this.emit('reconnecting', {
      attempt: this._retryCount,
      maxRetries: this._config.maxRetries,
      delay,
      nextRetryIn: delay
    });
  }

  _triggerReconnect() {
    this._retryCount = 0;
    this.connect().catch(() => {});
  }

  async _handlePortChange(newPort) {
    if (newPort === this._port) {
      return;
    }

    MCPLogger._log('PortChange', `Port changed from ${this._port} to ${newPort}`);

    this._port = newPort;
    this._baseUrl = `http://localhost:${newPort}`;

    this._retryCount = 0;

    try {
      await this.connect();
    } catch (error) {
      // Error handled in connect()
    }
  }

  _setState(newState) {
    const oldState = this._state;
    this._state = newState;

    this.emit('state:changed', {
      oldState,
      newState,
      timestamp: new Date()
    });
  }

  async _startHealthCheckMonitor() {
    if (this._healthCheckTimer) {
      clearInterval(this._healthCheckTimer);
    }

    const checkInterval = parseInt(process.env.MCP_HEALTH_CHECK_INTERVAL || '30000', 10);

    this._healthCheckTimer = setInterval(async () => {
      if (!this.isConnected) {
        return;
      }

      const healthCheck = await this._performHealthCheck();

      if (!healthCheck.success) {
        MCPLogger.setupConfigure('Health check failed, triggering reconnection');
        this._triggerReconnect();
      }
    }, checkInterval);

    this._healthCheckTimer.unref();
  }

  _stopHealthCheckMonitor() {
    if (this._healthCheckTimer) {
      clearInterval(this._healthCheckTimer);
      this._healthCheckTimer = null;
    }
  }

  async request(endpoint, options = {}) {
    if (!this.isConnected) {
      return this._queueRequest(endpoint, options);
    }

    try {
      const response = await this._makeRequest(endpoint, options);
      return response;
    } catch (error) {
      if (this._shouldRetry(error)) {
        return this._queueRequest(endpoint, options);
      }
      throw error;
    }
  }

  async _makeRequest(endpoint, options = {}) {
    const timeout = options.timeout ?? 30000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const url = `${this._baseUrl}${endpoint}`;
      const response = await fetch(url, {
        method: options.method || 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...options.headers
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          `Request failed: ${response.status} - ${data.error || response.statusText}`
        );
      }

      return data;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error.name === 'AbortError') {
        throw new Error('Request timeout');
      }

      throw error;
    }
  }

  _queueRequest(endpoint, options) {
    return new Promise((resolve, reject) => {
      this._retryQueue.push({
        endpoint,
        options,
        resolve,
        reject,
        queuedAt: new Date()
      });

      this._triggerReconnect();
    });
  }

  _processRetryQueue(success, error = null) {
    const queue = [...this._retryQueue];
    this._retryQueue = [];

    for (const item of queue) {
      if (success) {
        this._makeRequest(item.endpoint, item.options).then(item.resolve).catch(item.reject);
      } else {
        item.reject(error || new Error('Connection not available'));
      }
    }
  }

  async disconnect(reason = 'manual_disconnect') {
    this._stopHealthCheckMonitor();

    if (this._retryTimer) {
      clearTimeout(this._retryTimer);
      this._retryTimer = null;
    }

    this._setState(CONNECTION_STATES.DISCONNECTED);
    this._processRetryQueue(false, new Error(`Disconnected: ${reason}`));

    this.emit('disconnected', { reason });
  }

  destroy() {
    this._isDestroyed = true;
    this.disconnect('destroyed');
    this._retryQueue = [];
    this._pendingRequests.clear();
    this.removeAllListeners();
  }

  _delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  getStats() {
    return {
      state: this._state,
      port: this._port,
      baseUrl: this._baseUrl,
      isConnected: this.isConnected,
      isReady: this.isReady,
      retryCount: this._retryCount,
      maxRetries: this._config.maxRetries,
      lastError: this._lastError,
      connectionAttempts: this._connectionAttempts,
      lastSuccessfulConnection: this._lastSuccessfulConnection,
      pendingRequests: this._retryQueue.length
    };
  }
}

let globalConnectionManager = null;

export function getConnectionManager(options = {}) {
  if (!globalConnectionManager) {
    globalConnectionManager = new MCPConnectionManager(options);
  }
  return globalConnectionManager;
}

export function resetConnectionManager() {
  if (globalConnectionManager) {
    globalConnectionManager.destroy();
    globalConnectionManager = null;
  }
}

export default MCPConnectionManager;
