import { isPluginEnabled, getPluginList, getConfigValue } from '../config/project-config-loader.js';

const PLUGIN_LIFECYCLE = {
  INIT: 'init',
  REGISTER: 'register',
  SHUTDOWN: 'shutdown'
};

class PluginManager {
  constructor() {
    this._plugins = new Map();
    this._hooks = new Map();
    this._initialized = false;
    this._loadedPlugins = [];
  }

  async initialize() {
    if (this._initialized) return;

    console.log('[PluginManager] Initializing...');

    const pluginList = getPluginList();
    
    for (const pluginName of pluginList) {
      await this._loadPlugin(pluginName);
    }

    await this._runHook(PLUGIN_LIFECYCLE.INIT);
    
    this._initialized = true;
    console.log('[PluginManager] Initialized with plugins:', this._loadedPlugins);
  }

  async _loadPlugin(name) {
    if (this._plugins.has(name)) {
      return this._plugins.get(name);
    }

    let pluginModule = null;

    try {
      switch (name) {
        case 'redis':
          pluginModule = await import('../integrations/redis/redis-adapter.js');
          break;
        case 'browser':
          pluginModule = await import('../integrations/browser/browser-controller.js');
          break;
        case 'knowledgeBase':
          pluginModule = await import('../integrations/knowledge/knowledge-store.js');
          break;
        case 'emulator':
          pluginModule = await import('../../domains/emulator/emulator-plugin.js');
          break;
        default:
          console.warn(`[PluginManager] Unknown plugin: ${name}`);
          return null;
      }

      const plugin = pluginModule.default || pluginModule;
      
      if (plugin && typeof plugin.initialize === 'function') {
        await plugin.initialize();
      }

      this._plugins.set(name, plugin);
      this._loadedPlugins.push(name);
      console.log(`[PluginManager] Loaded plugin: ${name}`);

      return plugin;

    } catch (error) {
      console.error(`[PluginManager] Failed to load plugin "${name}":`, error.message);
      return null;
    }
  }

  async _runHook(hookName, ...args) {
    const callbacks = this._hooks.get(hookName) || [];
    
    for (const callback of callbacks) {
      try {
        await callback(...args);
      } catch (error) {
        console.error(`[PluginManager] Hook "${hookName}" error:`, error.message);
      }
    }
  }

  on(hookName, callback) {
    if (!this._hooks.has(hookName)) {
      this._hooks.set(hookName, []);
    }
    this._hooks.get(hookName).push(callback);
  }

  off(hookName, callback) {
    const callbacks = this._hooks.get(hookName);
    if (callbacks) {
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  getPlugin(name) {
    return this._plugins.get(name) || null;
  }

  hasPlugin(name) {
    return this._plugins.has(name);
  }

  getLoadedPlugins() {
    return [...this._loadedPlugins];
  }

  isPluginLoaded(name) {
    return this._loadedPlugins.includes(name);
  }

  async shutdown() {
    await this._runHook(PLUGIN_LIFECYCLE.SHUTDOWN);

    for (const [name, plugin] of this._plugins.entries()) {
      try {
        if (plugin && typeof plugin.shutdown === 'function') {
          await plugin.shutdown();
        }
        console.log(`[PluginManager] Shutdown plugin: ${name}`);
      } catch (error) {
        console.error(`[PluginManager] Error shutting down "${name}":`, error.message);
      }
    }

    this._plugins.clear();
    this._loadedPlugins = [];
    this._initialized = false;
  }

  registerTool(toolDefinition) {
    if (!this._toolRegistry) {
      this._toolRegistry = [];
    }
    this._toolRegistry.push(toolDefinition);
  }

  getTools() {
    return this._toolRegistry || [];
  }
}

let pluginManagerInstance = null;

export function getPluginManager() {
  if (!pluginManagerInstance) {
    pluginManagerInstance = new PluginManager();
  }
  return pluginManagerInstance;
}

export async function initializePlugins() {
  const manager = getPluginManager();
  await manager.initialize();
  return manager;
}

export async function shutdownPlugins() {
  if (pluginManagerInstance) {
    await pluginManagerInstance.shutdown();
    pluginManagerInstance = null;
  }
}

export { PluginManager, PLUGIN_LIFECYCLE };
export default { getPluginManager, initializePlugins, shutdownPlugins, PluginManager, PLUGIN_LIFECYCLE };