#!/usr/bin/env node

import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

const tests = [];
let passed = 0;
let failed = 0;

function test(name, fn) {
  tests.push({ name, fn });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

async function runTests() {
  console.log('='.repeat(60));
  console.log('MCP Integration Modules - Validation Tests');
  console.log('='.repeat(60));
  console.log();

  for (const { name, fn } of tests) {
    try {
      console.log(`Running: ${name}`);
      await fn();
      console.log('  ✓ PASSED');
      passed++;
    } catch (error) {
      console.log(`  ✗ FAILED: ${error.message}`);
      failed++;
    }
  }

  console.log();
  console.log('='.repeat(60));
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('='.repeat(60));
  console.log();

  if (failed > 0) {
    process.exit(1);
  }
}

test('Config Loader - Feature Flags', async () => {
  const { isFeatureEnabled, getRedisConfig, getBrowserConfig, getKnowledgeBaseConfig, isPluginEnabled, getPluginList } = await import('../core/config/project-config-loader.js');
  
  assert(isFeatureEnabled('multiAgent') === true, 'multiAgent should be enabled');
  assert(isFeatureEnabled('redis') === false, 'redis should be disabled by default');
  assert(isFeatureEnabled('browser') === false, 'browser should be disabled by default');
  assert(isFeatureEnabled('knowledgeBase') === false, 'knowledgeBase should be disabled by default');
  
  const redisConfig = getRedisConfig();
  assert(redisConfig.enabled === false, 'Redis should be disabled');
  assert(redisConfig.url === 'redis://localhost:6379', 'Redis URL should be set');
  assert(redisConfig.fallbackToMemory === true, 'Redis should fallback to memory');
  
  const browserConfig = getBrowserConfig();
  assert(browserConfig.enabled === false, 'Browser should be disabled');
  assert(browserConfig.headless === true, 'Browser should be headless');
  
  const kbConfig = getKnowledgeBaseConfig();
  assert(kbConfig.enabled === false, 'KnowledgeBase should be disabled');
  assert(kbConfig.storage === 'mongodb', 'KnowledgeBase storage should be mongodb');
});

test('Config Loader - Plugin List', async () => {
  const { isPluginEnabled, getPluginList } = await import('../core/config/project-config-loader.js');
  
  const pluginList = getPluginList();
  assert(Array.isArray(pluginList), 'Plugin list should be an array');
  
  assert(isPluginEnabled('emulator') === true, 'emulator plugin should be enabled');
  assert(isPluginEnabled('redis') === false, 'redis plugin should be disabled');
});

test('InMemoryCache - Basic Operations', async () => {
  const { InMemoryCache } = await import('../core/integrations/redis/redis-adapter.js');
  
  const cache = new InMemoryCache();
  
  await cache.set('test_key', 'test_value', 10);
  const value = await cache.get('test_key');
  assert(value === 'test_value', 'Should retrieve stored value');
  
  const exists = await cache.exists('test_key');
  assert(exists === 1, 'Key should exist');
  
  await cache.del('test_key');
  const deleted = await cache.get('test_key');
  assert(deleted === null, 'Deleted key should return null');
  
  await cache.set('key1', 'value1');
  await cache.set('key2', 'value2');
  const keys = await cache.keys('key*');
  assert(keys.length >= 2, 'Should find keys matching pattern');
  
  await cache.flush();
  const afterFlush = await cache.get('key1');
  assert(afterFlush === null, 'Flushed cache should be empty');
  
  const healthy = cache.isHealthy();
  assert(healthy === true, 'In-memory cache should be healthy');
});

test('RedisAdapter - Memory Fallback', async () => {
  const { resetRedisAdapter, getRedisAdapter } = await import('../core/integrations/redis/redis-adapter.js');
  
  await resetRedisAdapter();
  
  const adapter = await getRedisAdapter();
  
  assert(adapter.isUsingMemoryFallback() === true, 'Should use memory fallback when Redis disabled');
  assert(adapter.isHealthy() === true, 'Should be healthy with memory fallback');
  
  const testKey = `test_session_${Date.now()}`;
  await adapter.set(testKey, { user: 'test' }, 60);
  const session = await adapter.get(testKey);
  
  if (session === null) {
    console.log('  Debug: session is null');
    const keys = await adapter.keys('*');
    console.log('  Debug: all keys in cache:', keys.slice(0, 5));
  }
  
  assert(session !== null, `Should retrieve stored value, got: ${JSON.stringify(session)}`);
  assert(session && session.user === 'test', 'Should have correct user value');
  
  const exists = await adapter.exists(testKey);
  assert(exists === 1, 'Should check existence');
  
  await adapter.del(testKey);
  const deleted = await adapter.get(testKey);
  assert(deleted === null, 'Should delete key');
});

test('Discovery Module - Port Discovery', async () => {
  const { getDiscoveryModule } = await import('../core/discovery/discovery-module.js');
  
  const discovery = getDiscoveryModule();
  
  const cachedPort = discovery.getCachedPort();
  assert(cachedPort === null || typeof cachedPort === 'number', 'Cached port should be null or number');
  
  const cacheValid = discovery.isCacheValid();
  assert(typeof cacheValid === 'boolean', 'Cache validity should be boolean');
  
  discovery.clearCache();
  assert(discovery.getCachedPort() === null, 'Cache should be cleared');
});

test('Plugin Manager - Lifecycle', async () => {
  const { getPluginManager } = await import('../core/plugin/plugin-manager.js');
  
  const manager = getPluginManager();
  
  assert(typeof manager.on === 'function', 'Should have on method');
  assert(typeof manager.off === 'function', 'Should have off method');
  assert(typeof manager.getPlugin === 'function', 'Should have getPlugin method');
  assert(typeof manager.hasPlugin === 'function', 'Should have hasPlugin method');
  
  const loadedPlugins = manager.getLoadedPlugins();
  assert(Array.isArray(loadedPlugins), 'Loaded plugins should be array');
  
  const hasEmulator = manager.hasPlugin('emulator');
  assert(typeof hasEmulator === 'boolean', 'hasPlugin should return boolean');
});

test('Knowledge Store - Instance Creation', async () => {
  const { getKnowledgeStore } = await import('../core/integrations/knowledge/knowledge-store.js');
  
  const store = await getKnowledgeStore();
  
  assert(typeof store.store === 'function', 'Should have store method');
  assert(typeof store.query === 'function', 'Should have query method');
  assert(typeof store.get === 'function', 'Should have get method');
  assert(typeof store.update === 'function', 'Should have update method');
  assert(typeof store.delete === 'function', 'Should have delete method');
  assert(typeof store.count === 'function', 'Should have count method');
  assert(typeof store.isHealthy === 'function', 'Should have isHealthy method');
});

test('Browser Controller - Instance Creation', async () => {
  const { getBrowserController } = await import('../core/integrations/browser/browser-controller.js');
  
  const browser = await getBrowserController();
  
  assert(typeof browser.open === 'function', 'Should have open method');
  assert(typeof browser.navigate === 'function', 'Should have navigate method');
  assert(typeof browser.getPageContent === 'function', 'Should have getPageContent method');
  assert(typeof browser.closeSession === 'function', 'Should have closeSession method');
  assert(typeof browser.closeAll === 'function', 'Should have closeAll method');
  assert(typeof browser.getActiveSessions === 'function', 'Should have getActiveSessions method');
  assert(typeof browser.isHealthy === 'function', 'Should have isHealthy method');
});

test('Integration Tools - Tool List', async () => {
  const { getIntegrationTools } = await import('../mcp-integration-tools.js');
  
  const tools = getIntegrationTools();
  
  assert(Array.isArray(tools), 'Integration tools should be an array');
  
  const toolNames = tools.map(t => t.name);
  
  if (toolNames.length > 0) {
    assert(toolNames.includes('redis_get') || toolNames.includes('store_knowledge'), 'Should include Redis or Knowledge tools');
  }
});

runTests().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});