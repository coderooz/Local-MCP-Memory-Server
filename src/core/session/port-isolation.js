import { EventEmitter } from 'events';
import http from 'http';

export const PORT_STRATEGY = {
  SHARED: 'shared',
  PER_PROJECT: 'per_project',
  DYNAMIC: 'dynamic'
};

export class PortManager extends EventEmitter {
  constructor(options = {}) {
    super();
    this.strategy = options.strategy || PORT_STRATEGY.SHARED;
    this.basePort = options.basePort || 4000;
    this.maxPorts = options.maxPorts || 100;
    this.portRange = options.portRange || 100;

    this._ports = new Map();
    this._projectPorts = new Map();
    this._availablePorts = new Set();
    this._reservedPorts = new Set();

    this._initializePortPool();
  }

  _initializePortPool() {
    for (let i = 0; i < this.portRange; i++) {
      this._availablePorts.add(this.basePort + i);
    }
  }

  allocatePort(project, options = {}) {
    if (this.strategy === PORT_STRATEGY.SHARED) {
      return {
        port: this.basePort,
        shared: true,
        project
      };
    }

    if (this._projectPorts.has(project)) {
      const existing = this._projectPorts.get(project);
      return {
        port: existing,
        shared: false,
        project,
        reused: true
      };
    }

    const port = this._findAvailablePort();
    if (!port) {
      this.emit('error', {
        type: 'no_ports_available',
        project,
        message: 'No available ports in pool'
      });
      return null;
    }

    this._projectPorts.set(project, port);
    this._ports.set(port, {
      project,
      allocatedAt: new Date(),
      ...options
    });

    this.emit('port_allocated', {
      port,
      project
    });

    return {
      port,
      shared: false,
      project,
      reused: false
    };
  }

  releasePort(project) {
    if (this.strategy === PORT_STRATEGY.SHARED) {
      return { released: false, reason: 'shared_port' };
    }

    const port = this._projectPorts.get(project);
    if (!port) {
      return { released: false, reason: 'not_found' };
    }

    this._projectPorts.delete(project);
    this._ports.delete(port);
    this._availablePorts.add(port);

    this.emit('port_released', {
      port,
      project
    });

    return { released: true, port };
  }

  getPort(project) {
    if (this.strategy === PORT_STRATEGY.SHARED) {
      return this.basePort;
    }
    return this._projectPorts.get(project) || this.basePort;
  }

  getProject(port) {
    for (const [proj, p] of this._projectPorts) {
      if (p === port) {
        return proj;
      }
    }
    return null;
  }

  isPortInUse(port) {
    return this._ports.has(port);
  }

  reservePort(port) {
    if (this._availablePorts.has(port)) {
      this._availablePorts.delete(port);
      this._reservedPorts.add(port);
      return true;
    }
    return false;
  }

  unreservePort(port) {
    if (this._reservedPorts.has(port)) {
      this._reservedPorts.delete(port);
      this._availablePorts.add(port);
      return true;
    }
    return false;
  }

  _findAvailablePort() {
    for (const port of this._availablePorts) {
      if (!this._reservedPorts.has(port)) {
        this._availablePorts.delete(port);
        return port;
      }
    }
    return null;
  }

  getStats() {
    return {
      strategy: this.strategy,
      basePort: this.basePort,
      totalPorts: this.portRange,
      allocated: this._ports.size,
      available: this._availablePorts.size,
      reserved: this._reservedPorts.size,
      byProject: Object.fromEntries(this._projectPorts)
    };
  }

  checkPortAvailability(port) {
    return new Promise((resolve) => {
      const server = http.createServer();

      server.once('error', () => {
        resolve({ available: false, port });
      });

      server.once('listening', () => {
        server.close(() => {
          resolve({ available: true, port });
        });
      });

      server.listen(port);
    });
  }

  async findAvailablePort(startPort = this.basePort) {
    for (let port = startPort; port < startPort + this.portRange; port++) {
      const { available } = await this.checkPortAvailability(port);
      if (available) {
        return port;
      }
    }
    return null;
  }

  setStrategy(strategy) {
    if (!Object.values(PORT_STRATEGY).includes(strategy)) {
      throw new Error(`Invalid port strategy: ${strategy}`);
    }

    const oldStrategy = this.strategy;
    this.strategy = strategy;

    if (oldStrategy !== PORT_STRATEGY.SHARED && strategy === PORT_STRATEGY.SHARED) {
      this._releaseAllProjectPorts();
    }

    this.emit('strategy_changed', {
      oldStrategy,
      newStrategy: strategy
    });
  }

  _releaseAllProjectPorts() {
    for (const [project, port] of this._projectPorts) {
      this._ports.delete(port);
      this._availablePorts.add(port);
    }
    this._projectPorts.clear();
  }

  reset() {
    this._releaseAllProjectPorts();
    this._reservedPorts.clear();
    this._initializePortPool();
  }
}

let globalPortManager = null;

export function getPortManager() {
  if (!globalPortManager) {
    const strategy = process.env.MCP_PORT_STRATEGY || PORT_STRATEGY.SHARED;
    const basePort = parseInt(process.env.MCP_BASE_PORT || '4000', 10);

    globalPortManager = new PortManager({
      strategy,
      basePort
    });
  }
  return globalPortManager;
}

export function createPortManager(options = {}) {
  if (globalPortManager) {
    globalPortManager.reset();
  }
  globalPortManager = new PortManager(options);
  return globalPortManager;
}

export function resetPortManager() {
  if (globalPortManager) {
    globalPortManager.reset();
    globalPortManager = null;
  }
}
