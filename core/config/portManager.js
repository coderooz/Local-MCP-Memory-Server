import net from 'net';
import { getConfigValue } from '../config/project-config-loader.js';

const DEFAULT_PORT_RANGE_START = 47000;
const DEFAULT_PORT_RANGE_END = 47020;

export class PortManager {
  constructor(options = {}) {
    this.rangeStart = options.rangeStart || DEFAULT_PORT_RANGE_START;
    this.rangeEnd = options.rangeEnd || DEFAULT_PORT_RANGE_END;
    this.preferredPorts = options.preferredPorts || [this.rangeStart, this.rangeStart + 1];
  }

  async findAvailablePort(preferredPort = null) {
    if (preferredPort) {
      const available = await this.isPortAvailable(preferredPort);
      if (available) {
        return preferredPort;
      }
    }

    for (const port of this.preferredPorts) {
      const available = await this.isPortAvailable(port);
      if (available) {
        return port;
      }
    }

    for (let port = this.rangeStart; port <= this.rangeEnd; port++) {
      const available = await this.isPortAvailable(port);
      if (available) {
        return port;
      }
    }

    return null;
  }

  async isPortAvailable(port) {
    return new Promise((resolve) => {
      const server = net.createServer();
      
      server.once('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          resolve(false);
        } else {
          resolve(false);
        }
      });
      
      server.once('listening', () => {
        server.close(() => {
          resolve(true);
        });
      });
      
      try {
        server.listen(port);
      } catch {
        resolve(false);
      }
    });
  }

  async isPortInUse(port) {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      const timeout = 1000;
      
      const timer = setTimeout(() => {
        socket.destroy();
        resolve(false);
      }, timeout);
      
      socket.connect(port, '127.0.0.1', () => {
        clearTimeout(timer);
        socket.destroy();
        resolve(true);
      });
      
      socket.on('error', () => {
        clearTimeout(timer);
        socket.destroy();
        resolve(false);
      });
    });
  }

  getPortRange() {
    return {
      start: this.rangeStart,
      end: this.rangeEnd,
      preferred: this.preferredPorts
    };
  }
}

let globalPortManager = null;

export function getPortManager(options = {}) {
  if (!globalPortManager) {
    const configPortRange = getConfigValue('connection.preferredPortRange');
    const configPreferred = getConfigValue('connection.fallbackPorts');
    
    globalPortManager = new PortManager({
      rangeStart: configPortRange?.[0] || DEFAULT_PORT_RANGE_START,
      rangeEnd: configPortRange?.[1] || DEFAULT_PORT_RANGE_END,
      preferredPorts: configPreferred || [configPortRange?.[0] || DEFAULT_PORT_RANGE_START]
    });
  }
  
  if (options.rangeStart) globalPortManager.rangeStart = options.rangeStart;
  if (options.rangeEnd) globalPortManager.rangeEnd = options.rangeEnd;
  if (options.preferredPorts) globalPortManager.preferredPorts = options.preferredPorts;
  
  return globalPortManager;
}

export function resetPortManager() {
  globalPortManager = null;
}

export default PortManager;
