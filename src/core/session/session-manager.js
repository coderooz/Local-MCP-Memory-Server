import { v4 as uuidv4 } from 'uuid';
import { EventEmitter } from 'events';
import os from 'os';

export const SESSION_STATUS = {
  ACTIVE: 'active',
  IDLE: 'idle',
  DISCONNECTED: 'disconnected',
  EXPIRED: 'expired'
};

export const SESSION_EVENTS = {
  CREATED: 'session:created',
  HEARTBEAT: 'session:heartbeat',
  DISCONNECTED: 'session:disconnected',
  EXPIRED: 'session:expired',
  ERROR: 'session:error'
};

export class SessionConfig {
  constructor(options = {}) {
    this.heartbeatIntervalMs = options.heartbeatIntervalMs || 30000;
    this.maxIdleTimeMs = options.maxIdleTimeMs || 300000;
    this.sessionTimeoutMs = options.sessionTimeoutMs || 3600000;
    this.cleanupIntervalMs = options.cleanupIntervalMs || 60000;
  }
}

export class MCPSession extends EventEmitter {
  constructor(config = {}) {
    super();

    this.sessionId = config.sessionId || uuidv4();
    this.clientId = config.clientId || uuidv4();

    this.agent = config.agent || 'unknown';
    this.project = config.project || 'default-project';
    this.scope = config.scope || 'project';

    this.status = SESSION_STATUS.ACTIVE;
    this.startedAt = new Date();
    this.lastHeartbeat = new Date();
    this.endedAt = null;

    this.contextIds = new Set(config.contextIds || []);
    this.actionIds = new Set(config.actionIds || []);
    this.taskIds = new Set(config.taskIds || []);

    this.metadata = config.metadata || {};
    this.tags = new Set(config.tags || []);

    this.port = config.port || null;
    this.pid = config.pid || process.pid;
    this.hostname = config.hostname || os.hostname();

    this._heartbeatTimer = null;
    this._idleTimer = null;
    this._expiryTimer = null;
  }

  get isActive() {
    return this.status === SESSION_STATUS.ACTIVE || this.status === SESSION_STATUS.IDLE;
  }

  get isConnected() {
    return this.status !== SESSION_STATUS.DISCONNECTED && this.status !== SESSION_STATUS.EXPIRED;
  }

  get idleTimeMs() {
    return Date.now() - this.lastHeartbeat.getTime();
  }

  get ageMs() {
    return Date.now() - this.startedAt.getTime();
  }

  updateHeartbeat() {
    this.lastHeartbeat = new Date();
    this.status = SESSION_STATUS.ACTIVE;
    this._resetIdleTimer();
    this.emit(SESSION_EVENTS.HEARTBEAT, this);
  }

  setIdle() {
    if (this.status === SESSION_STATUS.ACTIVE) {
      this.status = SESSION_STATUS.IDLE;
      this.emit('session:idle', this);
    }
  }

  disconnect(reason = 'client_disconnect') {
    if (this.isActive) {
      this.status = SESSION_STATUS.DISCONNECTED;
      this.endedAt = new Date();
      this._clearTimers();
      this.emit(SESSION_EVENTS.DISCONNECTED, { session: this, reason });
    }
  }

  expire(reason = 'session_expired') {
    if (this.isActive) {
      this.status = SESSION_STATUS.EXPIRED;
      this.endedAt = new Date();
      this._clearTimers();
      this.emit(SESSION_EVENTS.EXPIRED, { session: this, reason });
    }
  }

  addContext(contextId) {
    this.contextIds.add(contextId);
  }

  removeContext(contextId) {
    this.contextIds.delete(contextId);
  }

  addAction(actionId) {
    this.actionIds.add(actionId);
  }

  addTask(taskId) {
    this.taskIds.add(taskId);
  }

  addTag(tag) {
    this.tags.add(tag);
  }

  setMetadata(key, value) {
    this.metadata[key] = value;
  }

  getMetadata(key) {
    return this.metadata[key];
  }

  _resetIdleTimer() {
    this._clearIdleTimer();
  }

  _clearIdleTimer() {
    if (this._idleTimer) {
      clearTimeout(this._idleTimer);
      this._idleTimer = null;
    }
  }

  _clearTimers() {
    this._clearIdleTimer();
    if (this._heartbeatTimer) {
      clearInterval(this._heartbeatTimer);
      this._heartbeatTimer = null;
    }
    if (this._expiryTimer) {
      clearTimeout(this._expiryTimer);
      this._expiryTimer = null;
    }
  }

  toJSON() {
    return {
      sessionId: this.sessionId,
      clientId: this.clientId,
      agent: this.agent,
      project: this.project,
      scope: this.scope,
      status: this.status,
      startedAt: this.startedAt,
      lastHeartbeat: this.lastHeartbeat,
      endedAt: this.endedAt,
      contextIds: Array.from(this.contextIds),
      actionIds: Array.from(this.actionIds),
      taskIds: Array.from(this.taskIds),
      metadata: { ...this.metadata },
      tags: Array.from(this.tags),
      port: this.port,
      pid: this.pid,
      hostname: this.hostname,
      idleTimeMs: this.idleTimeMs,
      ageMs: this.ageMs
    };
  }

  toDatabaseFormat() {
    return {
      sessionId: this.sessionId,
      clientId: this.clientId,
      agent: this.agent,
      project: this.project,
      scope: this.scope,
      status: this.status,
      startedAt: this.startedAt,
      lastHeartbeat: this.lastHeartbeat,
      endedAt: this.endedAt,
      contextIds: Array.from(this.contextIds),
      actionIds: Array.from(this.actionIds),
      taskIds: Array.from(this.taskIds),
      metadata: { ...this.metadata },
      tags: Array.from(this.tags),
      port: this.port,
      pid: this.pid,
      hostname: this.hostname
    };
  }
}

export class SessionManager extends EventEmitter {
  constructor(config = {}) {
    super();
    this.config = new SessionConfig(config);
    this._sessions = new Map();
    this._clientSessions = new Map();
    this._cleanupTimer = null;

    this._startCleanupTimer();
  }

  createSession(options = {}) {
    const session = new MCPSession({
      ...options,
      sessionId: options.sessionId || uuidv4()
    });

    this._sessions.set(session.sessionId, session);
    this._clientSessions.set(session.clientId, session.sessionId);

    session.on(SESSION_EVENTS.DISCONNECTED, (data) => this._handleDisconnect(data));
    session.on(SESSION_EVENTS.EXPIRED, (data) => this._handleExpiry(data));

    this.emit(SESSION_EVENTS.CREATED, session);

    return session;
  }

  getSession(sessionId) {
    return this._sessions.get(sessionId) || null;
  }

  getSessionByClient(clientId) {
    const sessionId = this._clientSessions.get(clientId);
    return sessionId ? this._sessions.get(sessionId) : null;
  }

  getAllSessions() {
    return Array.from(this._sessions.values());
  }

  getActiveSessions() {
    return this.getAllSessions().filter((s) => s.isActive);
  }

  getSessionsByProject(project) {
    return this.getAllSessions().filter((s) => s.project === project);
  }

  getSessionsByAgent(agent) {
    return this.getAllSessions().filter((s) => s.agent === agent);
  }

  heartbeat(sessionId) {
    const session = this._sessions.get(sessionId);
    if (session && session.isActive) {
      session.updateHeartbeat();
      return true;
    }
    return false;
  }

  disconnectSession(sessionId, reason = 'manual_disconnect') {
    const session = this._sessions.get(sessionId);
    if (session) {
      session.disconnect(reason);
      return true;
    }
    return false;
  }

  removeSession(sessionId) {
    const session = this._sessions.get(sessionId);
    if (session) {
      session._clearTimers();
      this._sessions.delete(sessionId);
      this._clientSessions.delete(session.clientId);
      return true;
    }
    return false;
  }

  cleanupExpiredSessions() {
    const now = Date.now();
    const expired = [];

    for (const session of this._sessions.values()) {
      if (!session.isActive) {
        expired.push(session);
        continue;
      }

      if (session.idleTimeMs > this.config.maxIdleTimeMs) {
        session.expire('max_idle_time_exceeded');
        expired.push(session);
      } else if (session.ageMs > this.config.sessionTimeoutMs) {
        session.expire('session_timeout');
        expired.push(session);
      }
    }

    return expired;
  }

  getSessionStats() {
    const sessions = this.getAllSessions();
    return {
      total: sessions.length,
      active: sessions.filter((s) => s.status === SESSION_STATUS.ACTIVE).length,
      idle: sessions.filter((s) => s.status === SESSION_STATUS.IDLE).length,
      disconnected: sessions.filter((s) => s.status === SESSION_STATUS.DISCONNECTED).length,
      expired: sessions.filter((s) => s.status === SESSION_STATUS.EXPIRED).length,
      byProject: this._groupBy(sessions, 'project'),
      byAgent: this._groupBy(sessions, 'agent')
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

  _handleDisconnect(data) {
    this.emit(SESSION_EVENTS.DISCONNECTED, data);
  }

  _handleExpiry(data) {
    this.emit(SESSION_EVENTS.EXPIRED, data);
  }

  _startCleanupTimer() {
    this._cleanupTimer = setInterval(() => {
      const expired = this.cleanupExpiredSessions();
      if (expired.length > 0) {
        this.emit('cleanup:complete', { expired: expired.length });
      }
    }, this.config.cleanupIntervalMs);
  }

  stop() {
    if (this._cleanupTimer) {
      clearInterval(this._cleanupTimer);
      this._cleanupTimer = null;
    }

    for (const session of this._sessions.values()) {
      session._clearTimers();
    }

    this._sessions.clear();
    this._clientSessions.clear();
  }
}

let globalSessionManager = null;

export function getSessionManager() {
  if (!globalSessionManager) {
    globalSessionManager = new SessionManager();
  }
  return globalSessionManager;
}

export function createSessionManager(config) {
  if (globalSessionManager) {
    globalSessionManager.stop();
  }
  globalSessionManager = new SessionManager(config);
  return globalSessionManager;
}

export function resetSessionManager() {
  if (globalSessionManager) {
    globalSessionManager.stop();
    globalSessionManager = null;
  }
}

export function generateSessionId() {
  return uuidv4();
}

export function generateClientId() {
  return uuidv4();
}
