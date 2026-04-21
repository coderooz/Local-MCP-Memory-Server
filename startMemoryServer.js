import { startServer } from './server.js';
import { getProjectConfig, getConfigValue } from './core/config/project-config-loader.js';

let startupPromise = null;

export function startMemoryServer() {
  if (!startupPromise) {
    const config = getProjectConfig();
    const mcpConfig = config.mcp || {};

    startupPromise = startServer({
      silent: true,
      autoDiscoverPort: mcpConfig.autoDiscoverPort ?? true,
      healthCheck: mcpConfig.healthCheck ?? true,
      retryStrategy: mcpConfig.retryStrategy,
      connectionTimeout: mcpConfig.connection?.timeout
    }).catch((error) => {
      startupPromise = null;
      throw error;
    });
  }

  return startupPromise;
}
