import { getDiscoveryPorts, getConfigValue, getConnectionStrategy } from '../config/project-config-loader.js';
import { validatePortWithHealth, isPortAlive } from '../config/runtime-state.js';

class DiscoveryModule {
  constructor() {
    this._cachedPort = null;
    this._cacheTime = 0;
    this._CACHE_TTL = 5000;
  }

  async discover(forceRefresh = false) {
    const strategy = getConnectionStrategy();
    
    switch (strategy) {
      case 'fast-discovery':
        return this._fastDiscovery(forceRefresh);
      case 'cached-first':
        return this._cachedFirstDiscovery(forceRefresh);
      case 'scan-only':
        return this._scanOnlyDiscovery();
      default:
        return this._fastDiscovery(forceRefresh);
    }
  }

  async _fastDiscovery(forceRefresh = false) {
    const now = Date.now();
    
    if (!forceRefresh && this._cachedPort && (now - this._cacheTime) < this._CACHE_TTL) {
      const validation = await validatePortWithHealth(this._cachedPort);
      if (validation.valid) {
        console.log(`[Discovery] Using cached port: ${this._cachedPort}`);
        return { port: this._cachedPort, fromCache: true, strategy: 'fast-discovery' };
      }
    }

    const ports = getDiscoveryPorts();
    console.log(`[Discovery] Scanning ${ports.length} ports...`);

    for (const port of ports) {
      const validation = await validatePortWithHealth(port);
      
      if (validation.valid) {
        this._cachedPort = port;
        this._cacheTime = now;
        
        console.log(`[Discovery] Found MCP on port ${port}`);
        
        return {
          port,
          fromCache: false,
          strategy: 'fast-discovery',
          data: validation.data
        };
      }
    }

    console.log('[Discovery] No MCP server found');
    return null;
  }

  async _cachedFirstDiscovery(forceRefresh = false) {
    const now = Date.now();
    
    if (!forceRefresh && this._cachedPort && (now - this._cacheTime) < this._CACHE_TTL) {
      const portAlive = await isPortAlive(this._cachedPort);
      if (portAlive) {
        return { port: this._cachedPort, fromCache: true, strategy: 'cached-first' };
      }
    }

    return this._scanOnlyDiscovery();
  }

  async _scanOnlyDiscovery() {
    const ports = getDiscoveryPorts();
    
    for (const port of ports) {
      const validation = await validatePortWithHealth(port);
      
      if (validation.valid) {
        this._cachedPort = port;
        this._cacheTime = Date.now();
        
        return {
          port,
          fromCache: false,
          strategy: 'scan-only'
        };
      }
    }

    return null;
  }

  async validateMcpPort(port) {
    return validatePortWithHealth(port);
  }

  clearCache() {
    this._cachedPort = null;
    this._cacheTime = 0;
    console.log('[Discovery] Cache cleared');
  }

  getCachedPort() {
    return this._cachedPort;
  }

  isCacheValid() {
    if (!this._cachedPort) return false;
    return (Date.now() - this._cacheTime) < this._CACHE_TTL;
  }
}

let discoveryInstance = null;

export function getDiscoveryModule() {
  if (!discoveryInstance) {
    discoveryInstance = new DiscoveryModule();
  }
  return discoveryInstance;
}

export function resetDiscoveryModule() {
  if (discoveryInstance) {
    discoveryInstance.clearCache();
    discoveryInstance = null;
  }
}

export { DiscoveryModule };
export default { getDiscoveryModule, resetDiscoveryModule, DiscoveryModule };