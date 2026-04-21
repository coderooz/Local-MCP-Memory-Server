import { EventEmitter } from 'events';

export const DEBUG_LEVEL = {
  OFF: 0,
  ERROR: 1,
  WARN: 2,
  INFO: 3,
  DEBUG: 4,
  TRACE: 5
};

export class SessionDebugger extends EventEmitter {
  constructor(options = {}) {
    super();
    this.level = options.level || DEBUG_LEVEL.INFO;
    this.sessionFilters = new Map();
    this.projectFilters = new Map();
  }

  setLevel(level) {
    if (typeof level === 'string') {
      this.level = DEBUG_LEVEL[level.toUpperCase()] || DEBUG_LEVEL.INFO;
    } else {
      this.level = level;
    }
  }

  addSessionFilter(sessionId, level) {
    this.sessionFilters.set(sessionId, level);
  }

  removeSessionFilter(sessionId) {
    this.sessionFilters.delete(sessionId);
  }

  addProjectFilter(project, level) {
    this.projectFilters.set(project, level);
  }

  removeProjectFilter(project) {
    this.projectFilters.delete(project);
  }

  getEffectiveLevel(sessionId, project) {
    if (this.sessionFilters.has(sessionId)) {
      return this.sessionFilters.get(sessionId);
    }
    if (this.projectFilters.has(project)) {
      return this.projectFilters.get(project);
    }
    return this.level;
  }

  shouldLog(sessionId, project, msgLevel) {
    return msgLevel <= this.getEffectiveLevel(sessionId, project);
  }

  error(message, context = {}) {
    this._log('ERROR', message, context);
  }

  warn(message, context = {}) {
    this._log('WARN', message, context);
  }

  info(message, context = {}) {
    this._log('INFO', message, context);
  }

  debug(message, context = {}) {
    this._log('DEBUG', message, context);
  }

  trace(message, context = {}) {
    this._log('TRACE', message, context);
  }

  logSessionError(sessionId, error, context = {}) {
    this.error(`[Session: ${sessionId}] ${error.message}`, {
      ...context,
      sessionId,
      errorStack: error.stack
    });
  }

  logSessionWarning(sessionId, message, context = {}) {
    this.warn(`[Session: ${sessionId}] ${message}`, { ...context, sessionId });
  }

  logConnectionDrop(sessionId, connectionId, reason) {
    this.error('Connection dropped', {
      sessionId,
      connectionId,
      reason,
      event: 'connection_drop'
    });
  }

  logHeartbeatMiss(sessionId, lastHeartbeat) {
    this.warn('Heartbeat missed', {
      sessionId,
      lastHeartbeat,
      idleTime: Date.now() - new Date(lastHeartbeat).getTime()
    });
  }

  logCrossSessionAccess(sessionId, documentId, action) {
    this.error('Cross-session access detected', {
      sessionId,
      documentId,
      action,
      event: 'cross_session_access'
    });
  }

  _log(level, message, context = {}) {
    const sessionId = context.sessionId || 'system';
    const project = context.project || 'default';

    if (!this.shouldLog(sessionId, project, DEBUG_LEVEL[level])) {
      return;
    }

    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      ...context
    };

    this.emit('log', logEntry);

    if (level === 'ERROR') {
      this.emit('session_error', logEntry);
    }
  }
}

export class ConnectionDropDetector extends EventEmitter {
  constructor(options = {}) {
    super();
    this.maxMissedHeartbeats = options.maxMissedHeartbeats || 3;
    this.heartbeatIntervalMs = options.heartbeatIntervalMs || 30000;
    this._sessions = new Map();
  }

  registerSession(sessionId) {
    this._sessions.set(sessionId, {
      lastHeartbeat: Date.now(),
      missedHeartbeats: 0,
      status: 'active'
    });
  }

  recordHeartbeat(sessionId) {
    const session = this._sessions.get(sessionId);
    if (session) {
      session.lastHeartbeat = Date.now();
      session.missedHeartbeats = 0;
      session.status = 'active';
    }
  }

  checkSession(sessionId) {
    const session = this._sessions.get(sessionId);
    if (!session) {
      return { dropped: false, reason: 'not_registered' };
    }

    const idleTime = Date.now() - session.lastHeartbeat;
    const expectedInterval = this.heartbeatIntervalMs * this.maxMissedHeartbeats;

    if (idleTime > expectedInterval) {
      session.status = 'dropped';
      this.emit('dropped', {
        sessionId,
        idleTime,
        missedHeartbeats: session.missedHeartbeats
      });
      return { dropped: true, reason: 'heartbeat_timeout', idleTime };
    }

    const missedCount = Math.floor(idleTime / this.heartbeatIntervalMs);
    if (missedCount > session.missedHeartbeats) {
      session.missedHeartbeats = missedCount;
      this.emit('heartbeat_missed', {
        sessionId,
        missedCount,
        idleTime
      });
    }

    return { dropped: false, idleTime, missedHeartbeats: session.missedHeartbeats };
  }

  unregisterSession(sessionId) {
    this._sessions.delete(sessionId);
  }

  checkAll() {
    const results = [];
    for (const sessionId of this._sessions.keys()) {
      results.push(this.checkSession(sessionId));
    }
    return results;
  }
}

export class SessionIsolationValidator {
  constructor(options = {}) {
    this.strictMode = options.strictMode || false;
    this.allowedCrossSessionActions = new Set(
      options.allowedCrossSessionActions || ['read', 'search']
    );
  }

  validateDocumentAccess(document, sessionId, action = 'read') {
    const errors = [];

    if (!document) {
      errors.push({
        type: 'document_not_found',
        message: 'Document is null or undefined'
      });
      return { valid: errors.length === 0, errors };
    }

    if (document.sessionId && document.sessionId !== sessionId) {
      if (this.strictMode || !this.allowedCrossSessionActions.has(action)) {
        errors.push({
          type: 'session_mismatch',
          message: `Document belongs to session ${document.sessionId}, not ${sessionId}`,
          documentId: document.id || document._id,
          documentSessionId: document.sessionId,
          requestSessionId: sessionId
        });
      }
    }

    return { valid: errors.length === 0, errors };
  }

  validateUpdate(document, sessionId, updates = {}) {
    const errors = [];

    if (!document) {
      errors.push({
        type: 'document_not_found',
        message: 'Document is null or undefined'
      });
      return { valid: errors.length === 0, errors };
    }

    if (document.sessionId && document.sessionId !== sessionId) {
      errors.push({
        type: 'cross_session_update',
        message: `Cannot update document from session ${sessionId} - document belongs to ${document.sessionId}`,
        documentId: document.id || document._id
      });
    }

    if (document.sessionId && updates.sessionId && updates.sessionId !== document.sessionId) {
      errors.push({
        type: 'session_id_mismatch',
        message: 'Cannot change sessionId of existing document',
        documentId: document.id || document._id
      });
    }

    return { valid: errors.length === 0, errors };
  }

  validateDelete(document, sessionId) {
    return this.validateUpdate(document, sessionId, {});
  }
}

export class SessionErrorLogger {
  constructor(options = {}) {
    this.errorLog = [];
    this.maxErrors = options.maxErrors || 1000;
  }

  log(error, context = {}) {
    const entry = {
      timestamp: new Date(),
      error: {
        message: error.message,
        name: error.name,
        stack: error.stack
      },
      context: {
        ...context,
        timestamp: Date.now()
      }
    };

    this.errorLog.push(entry);

    if (this.errorLog.length > this.maxErrors) {
      this.errorLog.shift();
    }

    return entry;
  }

  getErrors(filter = {}) {
    let errors = [...this.errorLog];

    if (filter.sessionId) {
      errors = errors.filter((e) => e.context.sessionId === filter.sessionId);
    }

    if (filter.project) {
      errors = errors.filter((e) => e.context.project === filter.project);
    }

    if (filter.agent) {
      errors = errors.filter((e) => e.context.agent === filter.agent);
    }

    if (filter.since) {
      const sinceTime = new Date(filter.since).getTime();
      errors = errors.filter((e) => e.timestamp.getTime() >= sinceTime);
    }

    if (filter.until) {
      const untilTime = new Date(filter.until).getTime();
      errors = errors.filter((e) => e.timestamp.getTime() <= untilTime);
    }

    return errors;
  }

  getErrorStats() {
    const now = Date.now();
    const oneHourAgo = now - 3600000;
    const oneDayAgo = now - 86400000;

    const recent = this.errorLog.filter((e) => e.context.timestamp >= oneHourAgo);
    const today = this.errorLog.filter((e) => e.context.timestamp >= oneDayAgo);

    const byType = {};
    for (const entry of this.errorLog) {
      const type = entry.error.name || 'Unknown';
      byType[type] = (byType[type] || 0) + 1;
    }

    const bySession = {};
    for (const entry of this.errorLog) {
      const sessionId = entry.context.sessionId || 'unknown';
      bySession[sessionId] = (bySession[sessionId] || 0) + 1;
    }

    return {
      total: this.errorLog.length,
      lastHour: recent.length,
      last24Hours: today.length,
      byType,
      bySession,
      oldest: this.errorLog[0]?.timestamp,
      newest: this.errorLog[this.errorLog.length - 1]?.timestamp
    };
  }

  clear(filter = {}) {
    if (!filter.sessionId && !filter.project && !filter.agent) {
      this.errorLog = [];
      return;
    }

    this.errorLog = this.errorLog.filter((e) => {
      if (filter.sessionId && e.context.sessionId === filter.sessionId) {
        return false;
      }
      if (filter.project && e.context.project === filter.project) {
        return false;
      }
      if (filter.agent && e.context.agent === filter.agent) {
        return false;
      }
      return true;
    });
  }
}

let globalDebugger = null;
let globalDropDetector = null;
let globalIsolationValidator = null;
let globalErrorLogger = null;

export function getSessionDebugger() {
  if (!globalDebugger) {
    globalDebugger = new SessionDebugger();
  }
  return globalDebugger;
}

export function getDropDetector() {
  if (!globalDropDetector) {
    globalDropDetector = new ConnectionDropDetector();
  }
  return globalDropDetector;
}

export function getIsolationValidator() {
  if (!globalIsolationValidator) {
    globalIsolationValidator = new SessionIsolationValidator();
  }
  return globalIsolationValidator;
}

export function getSessionErrorLogger() {
  if (!globalErrorLogger) {
    globalErrorLogger = new SessionErrorLogger();
  }
  return globalErrorLogger;
}

export function resetDebugTools() {
  if (globalDebugger) {
    globalDebugger.removeAllListeners();
    globalDebugger = null;
  }
  if (globalDropDetector) {
    globalDropDetector.removeAllListeners();
    globalDropDetector = null;
  }
  globalIsolationValidator = null;
  globalErrorLogger = null;
}
