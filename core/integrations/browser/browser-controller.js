import { getBrowserConfig, isFeatureEnabled } from '../../config/project-config-loader.js';
import { getRedisAdapter } from '../redis/redis-adapter.js';

class BrowserController {
  constructor() {
    this._config = null;
    this._sessions = new Map();
    this._redis = null;
    this._initialized = false;
  }

  async initialize() {
    this._config = getBrowserConfig();
    
    if (!this._config.enabled && !isFeatureEnabled('browser')) {
      console.log('[Browser] Disabled in config');
      return;
    }

    if (isFeatureEnabled('redis')) {
      try {
        this._redis = await getRedisAdapter();
      } catch (error) {
        console.warn('[Browser] Redis unavailable for session storage');
      }
    }

    this._initialized = true;
    console.log('[Browser] Controller initialized');
  }

  _isDomainAllowed(url) {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname;
      
      const allowed = this._config.security?.allowedDomains || ['localhost', '127.0.0.1'];
      const blocked = this._config.security?.blockedDomains || [];
      
      for (const domain of blocked) {
        if (hostname.includes(domain) || url.startsWith(domain)) {
          return false;
        }
      }
      
      for (const domain of allowed) {
        if (hostname.includes(domain) || domain === '*') {
          return true;
        }
      }
      
      return false;
    } catch {
      return false;
    }
  }

  async open(sessionId, url) {
    if (!this._initialized) {
      await this.initialize();
    }

    if (!this._isDomainAllowed(url)) {
      throw new Error(`Domain not allowed: ${url}`);
    }

    const maxSessions = this._config.security?.maxConcurrentSessions || 5;
    if (this._sessions.size >= maxSessions) {
      throw new Error(`Max concurrent sessions (${maxSessions}) reached`);
    }

    const session = {
      id: sessionId,
      url,
      createdAt: new Date(),
      browser: null,
      page: null
    };

    try {
      const puppeteer = await import('puppeteer');
      
      const browser = await puppeteer.default.launch({
        headless: this._config.headless !== false,
        args: this._config.args || ['--no-sandbox', '--disable-setuid-sandbox']
      });

      const page = await browser.newPage();
      
      const navigationTimeout = this._config.navigation?.timeout || 30000;
      const waitUntil = this._config.navigation?.waitUntil || 'networkidle';
      
      await page.goto(url, { timeout: navigationTimeout, waitUntil });

      session.browser = browser;
      session.page = page;
      this._sessions.set(sessionId, session);

      if (this._redis) {
        await this._redis.set(`browser:session:${sessionId}`, {
          url,
          createdAt: session.createdAt,
          active: true
        }, 300);
      }

      return {
        sessionId,
        url: page.url(),
        title: await page.title()
      };

    } catch (error) {
      throw new Error(`Failed to open browser: ${error.message}`);
    }
  }

  async navigate(sessionId, url) {
    const session = this._sessions.get(sessionId);
    
    if (!session || !session.page) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    if (!this._isDomainAllowed(url)) {
      throw new Error(`Domain not allowed: ${url}`);
    }

    const navigationTimeout = this._config.navigation?.timeout || 30000;
    const waitUntil = this._config.navigation?.waitUntil || 'networkidle';
    
    await session.page.goto(url, { timeout: navigationTimeout, waitUntil });

    return {
      sessionId,
      url: session.page.url(),
      title: await session.page.title()
    };
  }

  async getPageContent(sessionId, format = 'text') {
    const session = this._sessions.get(sessionId);
    
    if (!session || !session.page) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    if (format === 'html') {
      return await session.page.content();
    }

    return await session.page.evaluate(() => document.body.innerText);
  }

  async clickElement(sessionId, selector) {
    const session = this._sessions.get(sessionId);
    
    if (!session || !session.page) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    await session.page.click(selector);
    return { success: true, sessionId };
  }

  async fillInput(sessionId, selector, value) {
    const session = this._sessions.get(sessionId);
    
    if (!session || !session.page) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    await session.page.type(selector, value);
    return { success: true, sessionId };
  }

  async evaluateScript(sessionId, script) {
    const session = this._sessions.get(sessionId);
    
    if (!session || !session.page) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const timeout = this._config.timeout || 30000;
    
    const result = await session.page.evaluate(async (code) => {
      return eval(code);
    }, script);

    return { result, sessionId };
  }

  async takeScreenshot(sessionId, options = {}) {
    const session = this._sessions.get(sessionId);
    
    if (!session || !session.page) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    if (!this._config.screenshotEnabled) {
      throw new Error('Screenshots are disabled');
    }

    const screenshot = await session.page.screenshot({
      type: options.format || 'png',
      fullPage: options.fullPage || false
    });

    return {
      sessionId,
      screenshot: screenshot.toString('base64'),
      format: options.format || 'png'
    };
  }

  async closeSession(sessionId) {
    const session = this._sessions.get(sessionId);
    
    if (!session) {
      return { success: false, reason: 'Session not found' };
    }

    try {
      if (session.page) {
        await session.page.close();
      }
      if (session.browser) {
        await session.browser.close();
      }
    } catch (error) {
      console.error('[Browser] Close session error:', error.message);
    }

    this._sessions.delete(sessionId);

    if (this._redis) {
      await this._redis.del(`browser:session:${sessionId}`);
    }

    return { success: true, sessionId };
  }

  async closeAll() {
    const sessionIds = Array.from(this._sessions.keys());
    
    for (const sessionId of sessionIds) {
      await this.closeSession(sessionId);
    }

    return { closed: sessionIds.length };
  }

  getSession(sessionId) {
    const session = this._sessions.get(sessionId);
    if (!session) return null;
    
    return {
      id: session.id,
      url: session.url,
      createdAt: session.createdAt,
      active: true
    };
  }

  getActiveSessions() {
    return Array.from(this._sessions.values()).map(s => ({
      id: s.id,
      url: s.url,
      createdAt: s.createdAt
    }));
  }

  isHealthy() {
    return this._initialized;
  }

  async shutdown() {
    await this.closeAll();
    this._initialized = false;
    console.log('[Browser] Shutdown complete');
  }
}

let browserInstance = null;

export async function getBrowserController() {
  if (!browserInstance) {
    browserInstance = new BrowserController();
    await browserInstance.initialize();
  }
  return browserInstance;
}

export async function resetBrowserController() {
  if (browserInstance) {
    await browserInstance.shutdown();
    browserInstance = null;
  }
}

export { BrowserController };
export default { getBrowserController, resetBrowserController, BrowserController };