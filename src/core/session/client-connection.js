import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { getSessionManager, SESSION_EVENTS, SESSION_STATUS } from './session-manager.js';

export const CONNECTION_STATE = {
  CONNECTING: 'connecting',
  INITIALIZED: 'initialized',
  READY: 'ready',
  DISCONNECTED: 'disconnected',
  ERROR: 'error'
};

export const CONNECTION_EVENTS = {
  CONNECTED: 'connection:connected',
  INITIALIZED: 'connection:initialized',
  READY: 'connection:ready',
  DISCONNECTED: 'connection:disconnected',
  DROPPED: 'connection:dropped',
  ERROR: 'connection:error',
  HEARTBEAT_MISSED: 'connection:heartbeat_missed'
};

export class ClientConnection extends EventEmitter {
  constructor(options = {}) {
    super();

    this.connectionId = options.connectionId || uuidv4();
    this.clientId = options.clientId || uuidv4();

    this.sessionId = options.sessionId || null;
    this.agent = options.agent || 'unknown';
    this.project = options.project || 'default-project';
    this.scope = options.scope || 'project';

    this.state = CONNECTION_STATE.CONNECTING;
    this.connectedAt = new Date();
    this.lastActivityAt = new Date();
    this.lastHeartbeatAt = null;
    this.disconnectedAt = null;

    this.protocolVersion = options.protocolVersion || '2024-11-05';
    this.clientInfo = options.clientInfo || null;
    this.serverInfo = options.serverInfo || null;

    this.pendingRequests = new Map();
    this.activeToolCalls = new Map();

    this.errorCount = 0;
    this.lastError = null;
    this.dropReason = null;

    this.metadata = options.metadata || {};
  }

  get isConnected() {
    return this.state !== CONNECTION_STATE.DISCONNECTED && this.state !== CONNECTION_STATE.ERROR;
  }

  get isReady() {
    return this.state === CONNECTION_STATE.READY;
  }

  get idleTimeMs() {
    return Date.now() - this.lastActivityAt.getTime();
  }

  updateActivity() {
    this.lastActivityAt = new Date();
  }

  recordHeartbeat() {
    this.lastHeartbeatAt = new Date();
    this.lastActivityAt = new Date();
  }

  setInitialized(protocolVersion, clientInfo, serverInfo) {
    this.state = CONNECTION_STATE.INITIALIZED;
    this.protocolVersion = protocolVersion || this.protocolVersion;
    this.clientInfo = clientInfo;
    this.serverInfo = serverInfo;
    this.updateActivity();
  }

  setReady() {
    this.state = CONNECTION_STATE.READY;
    this.updateActivity();
    this.emit(CONNECTION_EVENTS.READY, this);
  }

  disconnect(reason = 'client_disconnect') {
    if (this.isConnected) {
      this.state = CONNECTION_STATE.DISCONNECTED;
      this.disconnectedAt = new Date();
      this._cleanupPendingRequests('disconnected');
      this.emit(CONNECTION_EVENTS.DISCONNECTED, { connection: this, reason });
    }
  }

  drop(reason = 'connection_dropped') {
    this.state = CONNECTION_STATE.DISCONNECTED;
    this.disconnectedAt = new Date();
    this.dropReason = reason;
    this._cleanupPendingRequests('dropped');
    this.emit(CONNECTION_EVENTS.DROPPED, { connection: this, reason });
  }

  setError(error) {
    this.errorCount++;
    this.lastError = {
      message: error.message,
      stack: error.stack,
      timestamp: new Date()
    };
    this.emit(CONNECTION_EVENTS.ERROR, { connection: this, error: this.lastError });
  }

  addPendingRequest(requestId, method) {
    this.pendingRequests.set(requestId, {
      method,
      startedAt: new Date()
    });
  }

  removePendingRequest(requestId) {
    return this.pendingRequests.delete(requestId);
  }

  getPendingRequests() {
    return Array.from(this.pendingRequests.entries()).map(([id, data]) => ({
      requestId: id,
      ...data,
      durationMs: Date.now() - data.startedAt.getTime()
    }));
  }

  addToolCall(callId, toolName) {
    this.activeToolCalls.set(callId, {
      toolName,
      startedAt: new Date()
    });
    this.updateActivity();
  }

  removeToolCall(callId) {
    return this.activeToolCalls.delete(callId);
  }

  getActiveToolCalls() {
    return Array.from(this.activeToolCalls.entries()).map(([id, data]) => ({
      callId: id,
      ...data,
      durationMs: Date.now() - data.startedAt.getTime()
    }));
  }

  setMetadata(key, value) {
    this.metadata[key] = value;
  }

  _cleanupPendingRequests(reason) {
    for (const [requestId] of this.pendingRequests) {
      this.pendingRequests.delete(requestId);
    }
    this.activeToolCalls.clear();
  }

  toJSON() {
    return {
      connectionId: this.connectionId,
      clientId: this.clientId,
      sessionId: this.sessionId,
      agent: this.agent,
      project: this.project,
      scope: this.scope,
      state: this.state,
      connectedAt: this.connectedAt,
      lastActivityAt: this.lastActivityAt,
      lastHeartbeatAt: this.lastHeartbeatAt,
      disconnectedAt: this.disconnectedAt,
      protocolVersion: this.protocolVersion,
      clientInfo: this.clientInfo,
      serverInfo: this.serverInfo,
      pendingRequests: this.pendingRequests.size,
      activeToolCalls: this.activeToolCalls.size,
      errorCount: this.errorCount,
      lastError: this.lastError,
      dropReason: this.dropReason,
      idleTimeMs: this.idleTimeMs,
      metadata: { ...this.metadata }
    };
  }
}

export class ConnectionManager extends EventEmitter {
  constructor(sessionManager = null) {
    super();
    this._sessionManager = sessionManager || getSessionManager();
    this._connections = new Map();
    this._connectionByClient = new Map();
    this._connectionBySession = new Map();

    this._setupSessionListeners();
  }

  _setupSessionListeners() {
    this._sessionManager.on(SESSION_EVENTS.DISCONNECTED, (data) => {
      const { session, reason } = data;
      const connection = this._connectionBySession.get(session.sessionId);
      if (connection) {
        this._handleSessionDisconnect(connection, reason);
      }
    });

    this._sessionManager.on(SESSION_EVENTS.EXPIRED, (data) => {
      const { session, reason } = data;
      const connection = this._connectionBySession.get(session.sessionId);
      if (connection) {
        this._handleSessionExpiry(connection, reason);
      }
    });
  }

  registerConnection(options = {}) {
    const connection = new ClientConnection(options);

    if (options.sessionId) {
      const session = this._sessionManager.getSession(options.sessionId);
      if (session) {
        this._connectionBySession.set(connection.sessionId, connection);
      }
    }

    this._connections.set(connection.connectionId, connection);
    this._connectionByClient.set(connection.clientId, connection);

    connection.on(CONNECTION_EVENTS.DISCONNECTED, (data) => {
      this._cleanupConnection(connection.connectionId);
    });

    connection.on(CONNECTION_EVENTS.DROPPED, (data) => {
      this._cleanupConnection(connection.connectionId);
    });

    this.emit(CONNECTION_EVENTS.CONNECTED, connection);

    return connection;
  }

  getConnection(connectionId) {
    return this._connections.get(connectionId) || null;
  }

  getConnectionByClient(clientId) {
    return this._connectionByClient.get(clientId) || null;
  }

  getConnectionBySession(sessionId) {
    return this._connectionBySession.get(sessionId) || null;
  }

  getAllConnections() {
    return Array.from(this._connections.values());
  }

  getActiveConnections() {
    return this.getAllConnections().filter((c) => c.isConnected);
  }

  getReadyConnections() {
    return this.getAllConnections().filter((c) => c.isReady);
  }

  getConnectionsByProject(project) {
    return this.getAllConnections().filter((c) => c.project === project);
  }

  getConnectionsByAgent(agent) {
    return this.getAllConnections().filter((c) => c.agent === agent);
  }

  updateConnectionState(connectionId, state) {
    const connection = this._connections.get(connectionId);
    if (connection) {
      connection.state = state;
      connection.updateActivity();
      return true;
    }
    return false;
  }

  disconnectConnection(connectionId, reason = 'manual_disconnect') {
    const connection = this._connections.get(connectionId);
    if (connection) {
      connection.disconnect(reason);
      return true;
    }
    return false;
  }

  dropConnection(connectionId, reason = 'force_drop') {
    const connection = this._connections.get(connectionId);
    if (connection) {
      connection.drop(reason);
      return true;
    }
    return false;
  }

  _handleSessionDisconnect(connection, reason) {
    connection.drop(`session_${reason}`);
    this.emit(CONNECTION_EVENTS.DROPPED, { connection, reason: `session_${reason}` });
  }

  _handleSessionExpiry(connection, reason) {
    connection.drop('session_expired');
    this.emit(CONNECTION_EVENTS.DROPPED, { connection, reason: 'session_expired' });
  }

  _cleanupConnection(connectionId) {
    const connection = this._connections.get(connectionId);
    if (connection) {
      if (connection.sessionId) {
        this._connectionBySession.delete(connection.sessionId);
      }
      this._connectionByClient.delete(connection.clientId);
      this._connections.delete(connectionId);
    }
  }

  getConnectionStats() {
    const connections = this.getAllConnections();
    return {
      total: connections.length,
      connected: connections.filter((c) => c.state === CONNECTION_STATE.CONNECTING).length,
      initialized: connections.filter((c) => c.state === CONNECTION_STATE.INITIALIZED).length,
      ready: connections.filter((c) => c.state === CONNECTION_STATE.READY).length,
      disconnected: connections.filter((c) => c.state === CONNECTION_STATE.DISCONNECTED).length,
      error: connections.filter((c) => c.state === CONNECTION_STATE.ERROR).length,
      byProject: this._groupBy(connections, 'project'),
      byAgent: this._groupBy(connections, 'agent'),
      totalErrors: connections.reduce((sum, c) => sum + c.errorCount, 0),
      totalPendingRequests: connections.reduce((sum, c) => sum + c.pendingRequests.size, 0),
      totalActiveToolCalls: connections.reduce((sum, c) => sum + c.activeToolCalls.size, 0)
    };
  }

  _groupBy(items, key) {
    const groups = {};
    for (const item of items) {
      const value = item[key] || 'unknown';
      groups[value] = (groups[value] || 0) + 1;
    }
    return groups;
  }

  detectDroppedConnections(maxIdleTimeMs = 120000) {
    const dropped = [];
    const now = Date.now();

    for (const connection of this.getActiveConnections()) {
      if (connection.idleTimeMs > maxIdleTimeMs) {
        dropped.push(connection);
        this.emit(CONNECTION_EVENTS.HEARTBEAT_MISSED, connection);
      }
    }

    return dropped;
  }

  stop() {
    for (const connection of this._connections.values()) {
      connection.disconnect('manager_shutdown');
    }
    this._connections.clear();
    this._connectionByClient.clear();
    this._connectionBySession.clear();
  }
}

let globalConnectionManager = null;

export function getConnectionManager() {
  if (!globalConnectionManager) {
    globalConnectionManager = new ConnectionManager();
  }
  return globalConnectionManager;
}

export function createConnectionManager(sessionManager) {
  if (globalConnectionManager) {
    globalConnectionManager.stop();
  }
  globalConnectionManager = new ConnectionManager(sessionManager);
  return globalConnectionManager;
}

export function resetConnectionManager() {
  if (globalConnectionManager) {
    globalConnectionManager.stop();
    globalConnectionManager = null;
  }
}
