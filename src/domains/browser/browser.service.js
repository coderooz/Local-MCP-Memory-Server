import path from 'node:path';
import { chromium } from 'playwright';
import { v4 as uuidv4 } from 'uuid';

const DEFAULT_VIEWPORT = { width: 1280, height: 720 };
const DEFAULT_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
const DEFAULT_TIMEOUT = 30000;
const IDLE_TIMEOUT_MS = 300000;
const MAX_SESSION_ID_LENGTH = 128;

const VALID_WAIT_UNTIL = new Set(['load', 'domcontentloaded', 'networkidle']);
const VALID_CONTENT_FORMATS = new Set(['text', 'html']);
const VALID_SELECTOR_STATES = new Set(['visible', 'hidden', 'attached', 'detached']);

const sessions = new Map();
const sessionLifecycles = new Map();
const sessionInitializations = new Map();
let sharedBrowser = null;
let sharedBrowserLaunch = null;

function getProjectRoot() {
  return path.resolve(process.env.MCP_PROJECT_ROOT || process.cwd());
}

function createStructuredResponse(success, data = null, error = null, meta = {}) {
  return {
    success,
    ...(data !== null && { data }),
    ...(error && { error }),
    meta: { timestamp: Date.now(), ...meta }
  };
}

function isValidUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function isValidSelector(selector) {
  if (!selector || typeof selector !== 'string' || selector.trim() === '') return false;
  const dangerous = ['javascript:', 'data:', 'vbscript:'];
  return !dangerous.some((d) => selector.toLowerCase().startsWith(d));
}

function isValidScript(script) {
  if (!script || typeof script !== 'string') return false;
  const normalized = script.toLowerCase().replace(/\s+/g, '');
  const dangerous = ['__proto__', 'constructor.prototype', 'constructor', 'eval('];
  return !dangerous.some((d) => normalized.includes(d));
}

function validateSessionId(sessionId, { required = true } = {}) {
  if (sessionId === undefined || sessionId === null || sessionId === '') {
    return required ? 'sessionId is required' : null;
  }
  if (typeof sessionId !== 'string') {
    return 'sessionId must be a string';
  }
  if (sessionId.length > MAX_SESSION_ID_LENGTH) {
    return `sessionId must be ${MAX_SESSION_ID_LENGTH} characters or fewer`;
  }
  return null;
}

function isValidWaitUntil(waitUntil) {
  return VALID_WAIT_UNTIL.has(waitUntil);
}

function isValidContentFormat(format) {
  return VALID_CONTENT_FORMATS.has(format);
}

function isValidSelectorState(state) {
  return VALID_SELECTOR_STATES.has(state);
}

function isSafeScreenshotPath(filePath) {
  if (!filePath || typeof filePath !== 'string' || filePath.trim() === '') {
    return false;
  }
  const projectRoot = getProjectRoot();
  const resolvedPath = path.resolve(projectRoot, filePath);
  const relativePath = path.relative(projectRoot, resolvedPath);
  return relativePath !== '' && !relativePath.startsWith('..') && !path.isAbsolute(relativePath);
}

function isValidCookie(cookie) {
  if (!cookie || typeof cookie !== 'object' || Array.isArray(cookie)) return false;
  if (typeof cookie.name !== 'string' || cookie.name.trim() === '') return false;
  if (typeof cookie.value !== 'string') return false;
  if (cookie.url !== undefined) return isValidUrl(cookie.url);
  return (
    typeof cookie.domain === 'string' &&
    cookie.domain.trim() !== '' &&
    (cookie.path === undefined || typeof cookie.path === 'string')
  );
}

function touchSession(sessionId) {
  if (sessionLifecycles.has(sessionId)) {
    clearTimeout(sessionLifecycles.get(sessionId));
  }
  sessionLifecycles.set(
    sessionId,
    setTimeout(() => {
      closeSession(sessionId);
    }, IDLE_TIMEOUT_MS)
  );
}

function getSession(sessionId) {
  const sessionIdError = validateSessionId(sessionId);
  if (sessionIdError) {
    return { error: sessionIdError };
  }
  if (!sessions.has(sessionId)) {
    return { error: 'No active session' };
  }
  touchSession(sessionId);
  return { session: sessions.get(sessionId) };
}

async function getSharedBrowser() {
  if (sharedBrowser) {
    return sharedBrowser;
  }

  if (!sharedBrowserLaunch) {
    sharedBrowserLaunch = chromium
      .launch({ headless: true })
      .then((browser) => {
        sharedBrowser = browser;
        return browser;
      })
      .catch((error) => {
        sharedBrowser = null;
        throw error;
      })
      .finally(() => {
        sharedBrowserLaunch = null;
      });
  }

  return sharedBrowserLaunch;
}

async function closeSharedBrowserIfIdle() {
  if (sessions.size > 0 || sessionInitializations.size > 0 || !sharedBrowser) {
    return;
  }

  const browser = sharedBrowser;
  sharedBrowser = null;
  await browser.close().catch(() => {});
}

async function getOrCreateSession(sessionId) {
  if (sessions.has(sessionId)) {
    touchSession(sessionId);
    return sessions.get(sessionId);
  }

  if (!sessionInitializations.has(sessionId)) {
    const initialization = (async () => {
      const browser = await getSharedBrowser();
      const context = await browser.newContext({
        viewport: DEFAULT_VIEWPORT,
        userAgent: DEFAULT_USER_AGENT
      });
      const page = await context.newPage();
      sessions.set(sessionId, { context, page, createdAt: Date.now() });
      touchSession(sessionId);
      return sessions.get(sessionId);
    })();

    sessionInitializations.set(sessionId, initialization);
  }

  try {
    return await sessionInitializations.get(sessionId);
  } finally {
    sessionInitializations.delete(sessionId);
  }
}

async function closeSession(sessionId) {
  const pendingSession = sessionInitializations.get(sessionId);
  if (pendingSession) {
    try {
      await pendingSession;
    } catch {}
  }
  const session = sessions.get(sessionId);
  if (session) {
    try {
      if (session.page) await session.page.close().catch(() => {});
      if (session.context) await session.context.close().catch(() => {});
    } catch {}
    sessions.delete(sessionId);
  }
  if (sessionLifecycles.has(sessionId)) {
    clearTimeout(sessionLifecycles.get(sessionId));
    sessionLifecycles.delete(sessionId);
  }
  await closeSharedBrowserIfIdle();
}

export class BrowserService {
  constructor() {
    this.sessions = sessions;
    this.sessionLifecycles = sessionLifecycles;
  }

  async openBrowser(options = {}) {
    const { sessionId = uuidv4() } = options;

    try {
      const sessionIdError = validateSessionId(sessionId);
      if (sessionIdError) {
        return createStructuredResponse(false, null, sessionIdError);
      }
      await getOrCreateSession(sessionId);
      return createStructuredResponse(true, { sessionId, message: 'Browser initialized' });
    } catch (error) {
      return createStructuredResponse(false, null, error.message);
    }
  }

  async closeBrowser(options = {}) {
    const { sessionId } = options;

    try {
      if (sessionId) {
        const sessionIdError = validateSessionId(sessionId);
        if (sessionIdError) {
          return createStructuredResponse(false, null, sessionIdError);
        }
        if (!sessions.has(sessionId) && !sessionInitializations.has(sessionId)) {
          return createStructuredResponse(false, null, 'No active session');
        }
        await closeSession(sessionId);
        return createStructuredResponse(true, { sessionId, message: 'Session closed' });
      }
      for (const id of sessions.keys()) {
        await closeSession(id);
      }
      await closeSharedBrowserIfIdle();
      return createStructuredResponse(true, { message: 'All sessions closed' });
    } catch (error) {
      return createStructuredResponse(false, null, error.message);
    }
  }

  async navigateToUrl(options = {}) {
    const { sessionId, url, waitUntil = 'load' } = options;

    try {
      if (!url) {
        return createStructuredResponse(false, null, 'URL is required');
      }
      if (!isValidUrl(url)) {
        return createStructuredResponse(false, null, `Invalid URL: ${url}`);
      }
      if (!isValidWaitUntil(waitUntil)) {
        return createStructuredResponse(false, null, `Invalid waitUntil value: ${waitUntil}`);
      }

      const { session, error } = getSession(sessionId);
      if (error) {
        return createStructuredResponse(false, null, error);
      }
      const response = await session.page
        .goto(url, {
          waitUntil,
          timeout: DEFAULT_TIMEOUT
        })
        .catch((err) => {
          return createStructuredResponse(false, null, `Navigation failed: ${err.message}`);
        });

      if (!response || response.ok() === false) {
        return createStructuredResponse(
          false,
          null,
          `HTTP error: ${response?.status() || 'unknown'}`,
          {
            url: session.page.url(),
            status: response?.status() || null
          }
        );
      }

      return createStructuredResponse(true, {
        url: session.page.url(),
        title: await session.page.title(),
        status: response.status()
      });
    } catch (error) {
      return createStructuredResponse(false, null, error.message);
    }
  }

  async getPageContent(options = {}) {
    const { sessionId, format = 'text' } = options;

    try {
      if (!isValidContentFormat(format)) {
        return createStructuredResponse(false, null, `Invalid format: ${format}`);
      }
      const { session, error } = getSession(sessionId);
      if (error) {
        return createStructuredResponse(false, null, error);
      }
      let content;
      if (format === 'html') {
        content = await session.page.content();
      } else {
        content = await session.page.evaluate(() => document.body?.innerText || '');
      }
      return createStructuredResponse(true, { content, format });
    } catch (error) {
      return createStructuredResponse(false, null, error.message);
    }
  }

  async clickElement(options = {}) {
    const { sessionId, selector, timeout = 5000 } = options;

    try {
      if (!isValidSelector(selector)) {
        return createStructuredResponse(false, null, `Invalid selector: ${selector}`);
      }
      if (!Number.isFinite(timeout) || timeout < 0 || timeout > DEFAULT_TIMEOUT) {
        return createStructuredResponse(
          false,
          null,
          `timeout must be between 0 and ${DEFAULT_TIMEOUT}`
        );
      }
      const { session, error } = getSession(sessionId);
      if (error) {
        return createStructuredResponse(false, null, error);
      }
      await session.page.click(selector, { timeout });
      return createStructuredResponse(true, { selector });
    } catch (error) {
      return createStructuredResponse(false, null, error.message);
    }
  }

  async fillInput(options = {}) {
    const { sessionId, selector, value, clear = true } = options;

    try {
      if (!isValidSelector(selector)) {
        return createStructuredResponse(false, null, `Invalid selector: ${selector}`);
      }
      if (value === undefined || value === null) {
        return createStructuredResponse(false, null, 'Value is required');
      }
      const { session, error } = getSession(sessionId);
      if (error) {
        return createStructuredResponse(false, null, error);
      }
      if (clear) {
        await session.page.fill(selector, String(value));
      } else {
        const existingValue = await session.page.inputValue(selector);
        await session.page.fill(selector, `${existingValue}${String(value)}`);
      }
      return createStructuredResponse(true, { selector, value: String(value) });
    } catch (error) {
      return createStructuredResponse(false, null, error.message);
    }
  }

  async getElementText(options = {}) {
    const { sessionId, selector } = options;

    try {
      if (!isValidSelector(selector)) {
        return createStructuredResponse(false, null, `Invalid selector: ${selector}`);
      }
      const { session, error } = getSession(sessionId);
      if (error) {
        return createStructuredResponse(false, null, error);
      }
      const text = await session.page.textContent(selector).catch(() => null);
      if (text === null) {
        return createStructuredResponse(false, null, `Element not found: ${selector}`);
      }
      return createStructuredResponse(true, { text: text.trim() });
    } catch (error) {
      return createStructuredResponse(false, null, error.message);
    }
  }

  async evaluateJavaScript(options = {}) {
    const { sessionId, script } = options;

    try {
      if (!script || typeof script !== 'string') {
        return createStructuredResponse(false, null, 'Script is required');
      }
      if (!isValidScript(script)) {
        return createStructuredResponse(
          false,
          null,
          'Script contains potentially dangerous patterns'
        );
      }
      const { session, error } = getSession(sessionId);
      if (error) {
        return createStructuredResponse(false, null, error);
      }
      const result = await session.page.evaluate(script).catch((err) => {
        return createStructuredResponse(false, null, `Script execution failed: ${err.message}`);
      });
      if (result && result.success === false) return result;
      return createStructuredResponse(true, { result });
    } catch (error) {
      return createStructuredResponse(false, null, error.message);
    }
  }

  async takeScreenshot(options = {}) {
    const { sessionId, path: filePath, fullPage = false } = options;

    try {
      const { session, error } = getSession(sessionId);
      if (error) {
        return createStructuredResponse(false, null, error);
      }
      if (filePath && !isSafeScreenshotPath(filePath)) {
        return createStructuredResponse(
          false,
          null,
          'Screenshot path must stay within the project root'
        );
      }
      const options = { fullPage };
      if (filePath) options.path = filePath;
      const buffer = await session.page.screenshot(options);
      return createStructuredResponse(true, {
        screenshot: buffer.toString('base64'),
        fullPage,
        savedTo: filePath || null
      });
    } catch (error) {
      return createStructuredResponse(false, null, error.message);
    }
  }

  async waitForSelector(options = {}) {
    const { sessionId, selector, state = 'visible', timeout = 10000 } = options;

    try {
      if (!isValidSelector(selector)) {
        return createStructuredResponse(false, null, `Invalid selector: ${selector}`);
      }
      if (!isValidSelectorState(state)) {
        return createStructuredResponse(false, null, `Invalid selector state: ${state}`);
      }
      if (!Number.isFinite(timeout) || timeout < 0 || timeout > DEFAULT_TIMEOUT) {
        return createStructuredResponse(
          false,
          null,
          `timeout must be between 0 and ${DEFAULT_TIMEOUT}`
        );
      }
      const { session, error } = getSession(sessionId);
      if (error) {
        return createStructuredResponse(false, null, error);
      }
      await session.page.waitForSelector(selector, { state, timeout });
      return createStructuredResponse(true, { selector, state });
    } catch (error) {
      return createStructuredResponse(false, null, error.message);
    }
  }

  async getPageTitle(options = {}) {
    const { sessionId } = options;

    try {
      const { session, error } = getSession(sessionId);
      if (error) {
        return createStructuredResponse(false, null, error);
      }
      const title = await session.page.title();
      return createStructuredResponse(true, { title });
    } catch (error) {
      return createStructuredResponse(false, null, error.message);
    }
  }

  async getCurrentUrl(options = {}) {
    const { sessionId } = options;

    try {
      const { session, error } = getSession(sessionId);
      if (error) {
        return createStructuredResponse(false, null, error);
      }
      return createStructuredResponse(true, { url: session.page.url() });
    } catch (error) {
      return createStructuredResponse(false, null, error.message);
    }
  }

  async reloadPage(options = {}) {
    const { sessionId, waitUntil = 'load' } = options;

    try {
      if (!isValidWaitUntil(waitUntil)) {
        return createStructuredResponse(false, null, `Invalid waitUntil value: ${waitUntil}`);
      }
      const { session, error } = getSession(sessionId);
      if (error) {
        return createStructuredResponse(false, null, error);
      }
      await session.page.reload({ waitUntil });
      return createStructuredResponse(true, {
        url: session.page.url(),
        title: await session.page.title()
      });
    } catch (error) {
      return createStructuredResponse(false, null, error.message);
    }
  }

  async goBack(options = {}) {
    const { sessionId } = options;

    try {
      const { session, error } = getSession(sessionId);
      if (error) {
        return createStructuredResponse(false, null, error);
      }
      await session.page.goBack();
      return createStructuredResponse(true, {
        url: session.page.url(),
        title: await session.page.title()
      });
    } catch (error) {
      return createStructuredResponse(false, null, error.message);
    }
  }

  async goForward(options = {}) {
    const { sessionId } = options;

    try {
      const { session, error } = getSession(sessionId);
      if (error) {
        return createStructuredResponse(false, null, error);
      }
      await session.page.goForward();
      return createStructuredResponse(true, {
        url: session.page.url(),
        title: await session.page.title()
      });
    } catch (error) {
      return createStructuredResponse(false, null, error.message);
    }
  }

  async waitForTimeout(options = {}) {
    const { ms } = options;

    try {
      if (typeof ms !== 'number' || ms < 0 || ms > 60000) {
        return createStructuredResponse(false, null, 'ms must be a number between 0 and 60000');
      }
      await new Promise((r) => setTimeout(r, ms));
      return createStructuredResponse(true, { waited: ms });
    } catch (error) {
      return createStructuredResponse(false, null, error.message);
    }
  }

  async getElements(options = {}) {
    const { sessionId, selector } = options;

    try {
      if (!isValidSelector(selector)) {
        return createStructuredResponse(false, null, `Invalid selector: ${selector}`);
      }
      const { session, error } = getSession(sessionId);
      if (error) {
        return createStructuredResponse(false, null, error);
      }
      const results = await session.page.$$eval(selector, (nodes) =>
        nodes.slice(0, 100).map((node, index) => ({
          index,
          tag: node.tagName || '',
          id: node.id || '',
          classes: node.className || '',
          text: node.textContent?.trim() || ''
        }))
      );
      return createStructuredResponse(true, { elements: results, count: results.length });
    } catch (error) {
      return createStructuredResponse(false, null, error.message);
    }
  }

  async setViewport(options = {}) {
    const { sessionId, width, height } = options;

    try {
      if (!Number.isFinite(width) || !Number.isFinite(height)) {
        return createStructuredResponse(false, null, 'width and height must be numbers');
      }
      if (width < 1 || height < 1) {
        return createStructuredResponse(false, null, 'Viewport dimensions must be positive');
      }
      const { session, error } = getSession(sessionId);
      if (error) {
        return createStructuredResponse(false, null, error);
      }
      await session.page.setViewportSize({ width, height });
      return createStructuredResponse(true, { width, height });
    } catch (error) {
      return createStructuredResponse(false, null, error.message);
    }
  }

  async clearCookies(options = {}) {
    const { sessionId } = options;

    try {
      const { session, error } = getSession(sessionId);
      if (error) {
        return createStructuredResponse(false, null, error);
      }
      await session.context.clearCookies();
      return createStructuredResponse(true);
    } catch (error) {
      return createStructuredResponse(false, null, error.message);
    }
  }

  async getCookies(options = {}) {
    const { sessionId } = options;

    try {
      const { session, error } = getSession(sessionId);
      if (error) {
        return createStructuredResponse(false, null, error);
      }
      const cookies = await session.context.cookies();
      return createStructuredResponse(true, { cookies, count: cookies.length });
    } catch (error) {
      return createStructuredResponse(false, null, error.message);
    }
  }

  async setCookies(options = {}) {
    const { sessionId, cookies } = options;

    try {
      if (!Array.isArray(cookies)) {
        return createStructuredResponse(false, null, 'cookies must be an array');
      }
      if (!cookies.every(isValidCookie)) {
        return createStructuredResponse(
          false,
          null,
          'Each cookie must include name, value, and either url or domain'
        );
      }
      const { session, error } = getSession(sessionId);
      if (error) {
        return createStructuredResponse(false, null, error);
      }
      await session.context.addCookies(cookies);
      return createStructuredResponse(true, { count: cookies.length });
    } catch (error) {
      return createStructuredResponse(false, null, error.message);
    }
  }

  getActiveSessions() {
    return createStructuredResponse(true, {
      sessions: Array.from(sessions.keys()),
      count: sessions.size
    });
  }
}

const browserService = new BrowserService();

export async function openBrowser(options = {}) {
  return browserService.openBrowser(options);
}

export async function closeBrowser(options = {}) {
  return browserService.closeBrowser(options);
}

export async function navigateToUrl(options = {}) {
  return browserService.navigateToUrl(options);
}

export async function getPageContent(options = {}) {
  return browserService.getPageContent(options);
}

export async function clickElement(options = {}) {
  return browserService.clickElement(options);
}

export async function fillInput(options = {}) {
  return browserService.fillInput(options);
}

export async function getElementText(options = {}) {
  return browserService.getElementText(options);
}

export async function evaluateJavaScript(options = {}) {
  return browserService.evaluateJavaScript(options);
}

export async function takeScreenshot(options = {}) {
  return browserService.takeScreenshot(options);
}

export async function waitForSelector(options = {}) {
  return browserService.waitForSelector(options);
}

export async function getPageTitle(options = {}) {
  return browserService.getPageTitle(options);
}

export async function getCurrentUrl(options = {}) {
  return browserService.getCurrentUrl(options);
}

export async function reloadPage(options = {}) {
  return browserService.reloadPage(options);
}

export async function goBack(options = {}) {
  return browserService.goBack(options);
}

export async function goForward(options = {}) {
  return browserService.goForward(options);
}

export async function waitForTimeout(options = {}) {
  return browserService.waitForTimeout(options);
}

export async function getElements(options = {}) {
  return browserService.getElements(options);
}

export async function setViewport(options = {}) {
  return browserService.setViewport(options);
}

export async function clearCookies(options = {}) {
  return browserService.clearCookies(options);
}

export async function getCookies(options = {}) {
  return browserService.getCookies(options);
}

export async function setCookies(options = {}) {
  return browserService.setCookies(options);
}

export function getActiveSessions() {
  return browserService.getActiveSessions();
}
