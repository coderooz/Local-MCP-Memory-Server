import { v4 as uuidv4 } from 'uuid';
import {
  MetricModel,
  MEMORY_SCOPE,
  normalizeMemory,
  toStringArray,
  toPlainObject,
} from '../../../core/mcp/models.js';

export { MetricModel, MEMORY_SCOPE };

function clampNumber(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, parsed));
}

export class MetricsService {
  constructor(db) {
    this.db = db;
  }

  async recordMetric(options = {}) {
    const {
      agent = 'system',
      project = 'default',
      metric_type = 'custom',
      name = 'unnamed_metric',
      value = 1,
      data = {},
      scope = MEMORY_SCOPE.PROJECT,
    } = options;

    const metric = new MetricModel({
      agent,
      project,
      scope,
      metric_type,
      name,
      value: Number.isFinite(Number(value)) ? Number(value) : 0,
      data: toPlainObject(data),
    });

    await this.db.collection('metrics').insertOne(normalizeMemory(metric));
    return metric;
  }

  async fetchMetrics(options = {}) {
    const { project, metric_type, name, limit = 10, agent } = options;

    const filters = {};

    if (project) {
      filters.project = project;
    }

    if (metric_type) {
      filters.metric_type = metric_type;
    }

    if (name) {
      filters.name = name;
    }

    if (agent) {
      filters.agent = agent;
    }

    return this.db
      .collection('metrics')
      .find(filters)
      .sort({ recordedAt: -1 })
      .limit(limit)
      .toArray();
  }

  async getMetricStats(options = {}) {
    const { project, metric_type } = options;

    const filters = {};

    if (project) {
      filters.project = project;
    }

    if (metric_type) {
      filters.metric_type = metric_type;
    }

    const stats = await this.db
      .collection('metrics')
      .aggregate([
        { $match: filters },
        {
          $group: {
            _id: { name: '$name', metric_type: '$metric_type' },
            totalValue: { $sum: '$value' },
            count: { $sum: 1 },
            avgValue: { $avg: '$value' },
            maxValue: { $max: '$value' },
            minValue: { $min: '$value' },
          },
        },
        { $sort: { totalValue: -1 } },
      ])
      .toArray();

    return stats;
  }
}

export class LoggingService {
  constructor(db) {
    this.db = db;
  }

  async logError(options = {}) {
    const {
      agent = 'system',
      project = 'default',
      message = '',
      stack = null,
      context = {},
    } = options;

    const logEntry = new LogModel({
      agent,
      project,
      type: 'error',
      message,
      stack,
      context: toPlainObject(context),
    });

    await this.db.collection('logs').insertOne(normalizeMemory(logEntry));
    return logEntry;
  }

  async logInfo(options = {}) {
    const { agent = 'system', project = 'default', message = '', context = {} } = options;

    const logEntry = new LogModel({
      agent,
      project,
      type: 'info',
      message,
      context: toPlainObject(context),
    });

    await this.db.collection('logs').insertOne(normalizeMemory(logEntry));
    return logEntry;
  }

  async logWarning(options = {}) {
    const { agent = 'system', project = 'default', message = '', context = {} } = options;

    const logEntry = new LogModel({
      agent,
      project,
      type: 'warning',
      message,
      context: toPlainObject(context),
    });

    await this.db.collection('logs').insertOne(normalizeMemory(logEntry));
    return logEntry;
  }

  async fetchLogs(options = {}) {
    const { project, type, agent, limit = 50, startDate, endDate } = options;

    const filters = {};

    if (project) {
      filters.project = project;
    }

    if (type) {
      filters.type = type;
    }

    if (agent) {
      filters.agent = agent;
    }

    if (startDate || endDate) {
      filters.createdAt = {};
      if (startDate) {
        filters.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        filters.createdAt.$lte = new Date(endDate);
      }
    }

    return this.db.collection('logs').find(filters).sort({ createdAt: -1 }).limit(limit).toArray();
  }

  async getErrorLogs(options = {}) {
    return this.fetchLogs({ ...options, type: 'error' });
  }
}

export function createEventBus() {
  const listeners = new Map();

  return {
    on(eventName, handler) {
      const existing = listeners.get(eventName) || [];
      existing.push(handler);
      listeners.set(eventName, existing);
    },

    off(eventName, handler) {
      const existing = listeners.get(eventName) || [];
      const filtered = existing.filter((h) => h !== handler);
      if (filtered.length) {
        listeners.set(eventName, filtered);
      } else {
        listeners.delete(eventName);
      }
    },

    async emit(eventName, payload) {
      const handlers = listeners.get(eventName) || [];

      for (const handler of handlers) {
        try {
          await handler(payload);
        } catch (error) {
          console.error(`Event handler error for ${eventName}:`, error);
        }
      }
    },

    once(eventName, handler) {
      const wrappedHandler = async (payload) => {
        this.off(eventName, wrappedHandler);
        await handler(payload);
      };
      this.on(eventName, wrappedHandler);
    },

    removeAllListeners(eventName) {
      if (eventName) {
        listeners.delete(eventName);
      } else {
        listeners.clear();
      }
    },

    listenerCount(eventName) {
      return (listeners.get(eventName) || []).length;
    },
  };
}

export async function recordMetric(db, options = {}) {
  const service = new MetricsService(db);
  return service.recordMetric(options);
}

export async function fetchMetrics(db, options = {}) {
  const service = new MetricsService(db);
  return service.fetchMetrics(options);
}

export async function logError(db, options = {}) {
  const service = new LoggingService(db);
  return service.logError(options);
}

export async function logInfo(db, options = {}) {
  const service = new LoggingService(db);
  return service.logInfo(options);
}

export async function logWarning(db, options = {}) {
  const service = new LoggingService(db);
  return service.logWarning(options);
}

export async function fetchLogs(db, options = {}) {
  const service = new LoggingService(db);
  return service.fetchLogs(options);
}
