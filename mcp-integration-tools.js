import { getRedisAdapter } from './core/integrations/redis/redis-adapter.js';
import { getKnowledgeStore } from './core/integrations/knowledge/knowledge-store.js';
import { getBrowserController } from './core/integrations/browser/browser-controller.js';
import { isFeatureEnabled } from './core/config/project-config-loader.js';

export function getIntegrationTools() {
  const tools = [];

  if (isFeatureEnabled('redis')) {
    tools.push(...getRedisTools());
  }

  if (isFeatureEnabled('knowledgeBase')) {
    tools.push(...getKnowledgeTools());
  }

  if (isFeatureEnabled('browser')) {
    tools.push(...getBrowserTools());
  }

  return tools;
}

function getRedisTools() {
  return [
    {
      name: 'redis_get',
      description: 'Get a value from Redis cache',
      inputSchema: {
        type: 'object',
        properties: {
          key: { type: 'string', description: 'Cache key' }
        },
        required: ['key']
      }
    },
    {
      name: 'redis_set',
      description: 'Set a value in Redis cache',
      inputSchema: {
        type: 'object',
        properties: {
          key: { type: 'string', description: 'Cache key' },
          value: { type: 'string', description: 'Value to store' },
          ttl: { type: 'number', description: 'Time to live in seconds (optional)' }
        },
        required: ['key', 'value']
      }
    },
    {
      name: 'redis_del',
      description: 'Delete a key from Redis cache',
      inputSchema: {
        type: 'object',
        properties: {
          key: { type: 'string', description: 'Cache key' }
        },
        required: ['key']
      }
    },
    {
      name: 'redis_exists',
      description: 'Check if a key exists in Redis',
      inputSchema: {
        type: 'object',
        properties: {
          key: { type: 'string', description: 'Cache key' }
        },
        required: ['key']
      }
    },
    {
      name: 'redis_keys',
      description: 'Find keys matching a pattern in Redis',
      inputSchema: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Pattern to match (use * for wildcard)' }
        },
        required: ['pattern']
      }
    }
  ];
}

function getKnowledgeTools() {
  return [
    {
      name: 'store_knowledge',
      description: 'Store structured knowledge in the knowledge base',
      inputSchema: {
        type: 'object',
        properties: {
          data: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              content: { type: 'string' },
              tags: { type: 'array', items: { type: 'string' } }
            }
          },
          metadata: {
            type: 'object',
            properties: {
              type: { type: 'string', description: 'Type of knowledge (document, snippet, etc.)' },
              id: { type: 'string', description: 'Optional custom ID' }
            }
          }
        },
        required: ['data']
      }
    },
    {
      name: 'search_knowledge',
      description: 'Search the knowledge base',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
          type: { type: 'string', description: 'Filter by type (optional)' },
          tags: { type: 'array', items: { type: 'string' }, description: 'Filter by tags (optional)' },
          limit: { type: 'number', description: 'Max results (default 10)' }
        }
      }
    },
    {
      name: 'get_knowledge',
      description: 'Get a specific knowledge entry by ID',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Knowledge entry ID' }
        },
        required: ['id']
      }
    },
    {
      name: 'update_knowledge',
      description: 'Update a knowledge entry',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Knowledge entry ID' },
          data: { type: 'object', description: 'Fields to update' }
        },
        required: ['id', 'data']
      }
    },
    {
      name: 'delete_knowledge',
      description: 'Delete a knowledge entry',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Knowledge entry ID' }
        },
        required: ['id']
      }
    }
  ];
}

function getBrowserTools() {
  return [
    {
      name: 'browser_open',
      description: 'Open a browser session and navigate to URL',
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: 'Session ID for the browser' },
          url: { type: 'string', description: 'URL to navigate to' }
        },
        required: ['sessionId', 'url']
      }
    },
    {
      name: 'browser_navigate',
      description: 'Navigate to a URL in an existing session',
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: 'Session ID' },
          url: { type: 'string', description: 'URL to navigate to' }
        },
        required: ['sessionId', 'url']
      }
    },
    {
      name: 'browser_get_content',
      description: 'Get page content',
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: 'Session ID' },
          format: { type: 'string', enum: ['text', 'html'], description: 'Content format' }
        },
        required: ['sessionId']
      }
    },
    {
      name: 'browser_click',
      description: 'Click an element by CSS selector',
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: 'Session ID' },
          selector: { type: 'string', description: 'CSS selector' }
        },
        required: ['sessionId', 'selector']
      }
    },
    {
      name: 'browser_fill',
      description: 'Fill an input field',
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: 'Session ID' },
          selector: { type: 'string', description: 'Input CSS selector' },
          value: { type: 'string', description: 'Value to fill' }
        },
        required: ['sessionId', 'selector', 'value']
      }
    },
    {
      name: 'browser_evaluate',
      description: 'Execute JavaScript in the browser context',
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: 'Session ID' },
          script: { type: 'string', description: 'JavaScript code to execute' }
        },
        required: ['sessionId', 'script']
      }
    },
    {
      name: 'browser_screenshot',
      description: 'Take a screenshot of the current page',
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: 'Session ID' },
          fullPage: { type: 'boolean', description: 'Capture full page' }
        },
        required: ['sessionId']
      }
    },
    {
      name: 'browser_close',
      description: 'Close a browser session',
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: 'Session ID to close' }
        },
        required: ['sessionId']
      }
    },
    {
      name: 'browser_list_sessions',
      description: 'List active browser sessions',
      inputSchema: {
        type: 'object',
        properties: {}
      }
    }
  ];
}

export async function handleIntegrationTool(name, args) {
  switch (name) {
    case 'redis_get':
      return handleRedisGet(args);
    case 'redis_set':
      return handleRedisSet(args);
    case 'redis_del':
      return handleRedisDel(args);
    case 'redis_exists':
      return handleRedisExists(args);
    case 'redis_keys':
      return handleRedisKeys(args);

    case 'store_knowledge':
      return handleStoreKnowledge(args);
    case 'search_knowledge':
      return handleSearchKnowledge(args);
    case 'get_knowledge':
      return handleGetKnowledge(args);
    case 'update_knowledge':
      return handleUpdateKnowledge(args);
    case 'delete_knowledge':
      return handleDeleteKnowledge(args);

    case 'browser_open':
      return handleBrowserOpen(args);
    case 'browser_navigate':
      return handleBrowserNavigate(args);
    case 'browser_get_content':
      return handleBrowserGetContent(args);
    case 'browser_click':
      return handleBrowserClick(args);
    case 'browser_fill':
      return handleBrowserFill(args);
    case 'browser_evaluate':
      return handleBrowserEvaluate(args);
    case 'browser_screenshot':
      return handleBrowserScreenshot(args);
    case 'browser_close':
      return handleBrowserClose(args);
    case 'browser_list_sessions':
      return handleBrowserListSessions(args);

    default:
      throw new Error(`Unknown integration tool: ${name}`);
  }
}

async function handleRedisGet(args) {
  const redis = await getRedisAdapter();
  const value = await redis.get(args.key);
  return { key: args.key, value, exists: value !== null };
}

async function handleRedisSet(args) {
  const redis = await getRedisAdapter();
  await redis.set(args.key, args.value, args.ttl);
  return { success: true, key: args.key };
}

async function handleRedisDel(args) {
  const redis = await getRedisAdapter();
  await redis.del(args.key);
  return { success: true, key: args.key };
}

async function handleRedisExists(args) {
  const redis = await getRedisAdapter();
  const exists = await redis.exists(args.key);
  return { key: args.key, exists: exists > 0 };
}

async function handleRedisKeys(args) {
  const redis = await getRedisAdapter();
  const keys = await redis.keys(args.pattern);
  return { pattern: args.pattern, keys };
}

async function handleStoreKnowledge(args) {
  const store = await getKnowledgeStore();
  const result = await store.store(args.data, args.metadata || {});
  return result;
}

async function handleSearchKnowledge(args) {
  const store = await getKnowledgeStore();
  const results = await store.query(args);
  return { results, count: results.length };
}

async function handleGetKnowledge(args) {
  const store = await getKnowledgeStore();
  const result = await store.get(args.id);
  return result || { error: 'Not found' };
}

async function handleUpdateKnowledge(args) {
  const store = await getKnowledgeStore();
  const result = await store.update(args.id, args.data, args.metadata || {});
  return result;
}

async function handleDeleteKnowledge(args) {
  const store = await getKnowledgeStore();
  const result = await store.delete(args.id);
  return result;
}

async function handleBrowserOpen(args) {
  const browser = await getBrowserController();
  const result = await browser.open(args.sessionId, args.url);
  return result;
}

async function handleBrowserNavigate(args) {
  const browser = await getBrowserController();
  const result = await browser.navigate(args.sessionId, args.url);
  return result;
}

async function handleBrowserGetContent(args) {
  const browser = await getBrowserController();
  const content = await browser.getPageContent(args.sessionId, args.format || 'text');
  return { sessionId: args.sessionId, content };
}

async function handleBrowserClick(args) {
  const browser = await getBrowserController();
  const result = await browser.clickElement(args.sessionId, args.selector);
  return result;
}

async function handleBrowserFill(args) {
  const browser = await getBrowserController();
  const result = await browser.fillInput(args.sessionId, args.selector, args.value);
  return result;
}

async function handleBrowserEvaluate(args) {
  const browser = await getBrowserController();
  const result = await browser.evaluateScript(args.sessionId, args.script);
  return result;
}

async function handleBrowserScreenshot(args) {
  const browser = await getBrowserController();
  const result = await browser.takeScreenshot(args.sessionId, { fullPage: args.fullPage });
  return result;
}

async function handleBrowserClose(args) {
  const browser = await getBrowserController();
  const result = await browser.closeSession(args.sessionId);
  return result;
}

async function handleBrowserListSessions(args) {
  const browser = await getBrowserController();
  const sessions = browser.getActiveSessions();
  return { sessions, count: sessions.length };
}

export default { getIntegrationTools, handleIntegrationTool };
