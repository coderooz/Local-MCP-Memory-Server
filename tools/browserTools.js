import { chromium } from "playwright";
import { v4 as uuidv4 } from "uuid";

const DEFAULT_VIEWPORT = { width: 1280, height: 720 };
const DEFAULT_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
const DEFAULT_TIMEOUT = 30000;
const IDLE_TIMEOUT_MS = 300000;

const sessions = new Map();
const sessionLifecycles = new Map();

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
        return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
        return false;
    }
}

function isValidSelector(selector) {
    if (!selector || typeof selector !== "string" || selector.trim() === "") return false;
    const dangerous = ["javascript:", "data:", "vbscript:"];
    return !dangerous.some(d => selector.toLowerCase().startsWith(d));
}

function isValidScript(script) {
    if (!script || typeof script !== "string") return false;
    const dangerous = ["window.__proto__", "constructor.prototype", "eval("];
    return !dangerous.some(d => script.includes(d));
}

async function getOrCreateSession(sessionId) {
    if (!sessions.has(sessionId)) {
        const browser = await chromium.launch({ headless: true });
        const context = await browser.newContext({
            viewport: DEFAULT_VIEWPORT,
            userAgent: DEFAULT_USER_AGENT
        });
        const page = await context.newPage();
        
        sessions.set(sessionId, { browser, context, page, createdAt: Date.now() });
        
        sessionLifecycles.set(sessionId, setTimeout(() => {
            closeSession(sessionId);
        }, IDLE_TIMEOUT_MS));
    }
    
    const session = sessions.get(sessionId);
    if (sessionLifecycles.has(sessionId)) {
        clearTimeout(sessionLifecycles.get(sessionId));
        sessionLifecycles.set(sessionId, setTimeout(() => {
            closeSession(sessionId);
        }, IDLE_TIMEOUT_MS));
    }
    
    return session;
}

async function closeSession(sessionId) {
    const session = sessions.get(sessionId);
    if (session) {
        try {
            if (session.page) await session.page.close().catch(() => {});
            if (session.context) await session.context.close().catch(() => {});
            if (session.browser) await session.browser.close().catch(() => {});
        } catch { }
        sessions.delete(sessionId);
    }
    if (sessionLifecycles.has(sessionId)) {
        clearTimeout(sessionLifecycles.get(sessionId));
        sessionLifecycles.delete(sessionId);
    }
}

export async function openBrowser({ sessionId = uuidv4() } = {}) {
    try {
        const session = await getOrCreateSession(sessionId);
        return createStructuredResponse(true, { sessionId, message: "Browser initialized" });
    } catch (error) {
        return createStructuredResponse(false, null, error.message);
    }
}

export async function closeBrowser({ sessionId } = {}) {
    try {
        if (sessionId) {
            await closeSession(sessionId);
            return createStructuredResponse(true, { sessionId, message: "Session closed" });
        }
        for (const id of sessions.keys()) {
            await closeSession(id);
        }
        return createStructuredResponse(true, { message: "All sessions closed" });
    } catch (error) {
        return createStructuredResponse(false, null, error.message);
    }
}

export async function navigateToUrl({ sessionId = uuidv4(), url, waitUntil = "load" }) {
    try {
        if (!url) {
            return createStructuredResponse(false, null, "URL is required");
        }
        if (!isValidUrl(url)) {
            return createStructuredResponse(false, null, `Invalid URL: ${url}`);
        }
        
        const session = await getOrCreateSession(sessionId);
        const response = await session.page.goto(url, { 
            waitUntil, 
            timeout: DEFAULT_TIMEOUT 
        }).catch(err => {
            return createStructuredResponse(false, null, `Navigation failed: ${err.message}`);
        });
        
        if (!response || response.ok() === false) {
            return createStructuredResponse(false, null, `HTTP error: ${response?.status() || 'unknown'}`, { 
                url: session.page.url(),
                status: response?.status() || null
            });
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

export async function getPageContent({ sessionId, format = "text" }) {
    try {
        if (!sessions.has(sessionId)) {
            return createStructuredResponse(false, null, "No active session");
        }
        const session = sessions.get(sessionId);
        let content;
        if (format === "html") {
            content = await session.page.content();
        } else {
            content = await session.page.evaluate(() => document.body?.innerText || "");
        }
        return createStructuredResponse(true, { content, format });
    } catch (error) {
        return createStructuredResponse(false, null, error.message);
    }
}

export async function clickElement({ sessionId, selector, timeout = 5000 }) {
    try {
        if (!isValidSelector(selector)) {
            return createStructuredResponse(false, null, `Invalid selector: ${selector}`);
        }
        if (!sessions.has(sessionId)) {
            return createStructuredResponse(false, null, "No active session");
        }
        const session = sessions.get(sessionId);
        await session.page.click(selector, { timeout });
        return createStructuredResponse(true, { selector });
    } catch (error) {
        return createStructuredResponse(false, null, error.message);
    }
}

export async function fillInput({ sessionId, selector, value, clear = true }) {
    try {
        if (!isValidSelector(selector)) {
            return createStructuredResponse(false, null, `Invalid selector: ${selector}`);
        }
        if (value === undefined || value === null) {
            return createStructuredResponse(false, null, "Value is required");
        }
        if (!sessions.has(sessionId)) {
            return createStructuredResponse(false, null, "No active session");
        }
        const session = sessions.get(sessionId);
        if (clear) await session.page.fill(selector, "");
        await session.page.fill(selector, String(value));
        return createStructuredResponse(true, { selector, value: String(value) });
    } catch (error) {
        return createStructuredResponse(false, null, error.message);
    }
}

export async function getElementText({ sessionId, selector }) {
    try {
        if (!isValidSelector(selector)) {
            return createStructuredResponse(false, null, `Invalid selector: ${selector}`);
        }
        if (!sessions.has(sessionId)) {
            return createStructuredResponse(false, null, "No active session");
        }
        const session = sessions.get(sessionId);
        const text = await session.page.textContent(selector).catch(() => null);
        if (text === null) {
            return createStructuredResponse(false, null, `Element not found: ${selector}`);
        }
        return createStructuredResponse(true, { text: text.trim() });
    } catch (error) {
        return createStructuredResponse(false, null, error.message);
    }
}

export async function evaluateJavaScript({ sessionId, script }) {
    try {
        if (!script || typeof script !== "string") {
            return createStructuredResponse(false, null, "Script is required");
        }
        if (!isValidScript(script)) {
            return createStructuredResponse(false, null, "Script contains potentially dangerous patterns");
        }
        if (!sessions.has(sessionId)) {
            return createStructuredResponse(false, null, "No active session");
        }
        const session = sessions.get(sessionId);
        const result = await session.page.evaluate(script).catch(err => {
            return createStructuredResponse(false, null, `Script execution failed: ${err.message}`);
        });
        if (result && result.success === false) return result;
        return createStructuredResponse(true, { result });
    } catch (error) {
        return createStructuredResponse(false, null, error.message);
    }
}

export async function takeScreenshot({ sessionId, path, fullPage = false }) {
    try {
        if (!sessions.has(sessionId)) {
            return createStructuredResponse(false, null, "No active session");
        }
        const session = sessions.get(sessionId);
        const options = { fullPage };
        if (path) options.path = path;
        const buffer = await session.page.screenshot(options);
        return createStructuredResponse(true, { 
            screenshot: buffer.toString("base64"), 
            fullPage,
            savedTo: path || null
        });
    } catch (error) {
        return createStructuredResponse(false, null, error.message);
    }
}

export async function waitForSelector({ sessionId, selector, state = "visible", timeout = 10000 }) {
    try {
        if (!isValidSelector(selector)) {
            return createStructuredResponse(false, null, `Invalid selector: ${selector}`);
        }
        if (!sessions.has(sessionId)) {
            return createStructuredResponse(false, null, "No active session");
        }
        const session = sessions.get(sessionId);
        await session.page.waitForSelector(selector, { state, timeout });
        return createStructuredResponse(true, { selector, state });
    } catch (error) {
        return createStructuredResponse(false, null, error.message);
    }
}

export async function getPageTitle({ sessionId }) {
    try {
        if (!sessions.has(sessionId)) {
            return createStructuredResponse(false, null, "No active session");
        }
        const session = sessions.get(sessionId);
        const title = await session.page.title();
        return createStructuredResponse(true, { title });
    } catch (error) {
        return createStructuredResponse(false, null, error.message);
    }
}

export async function getCurrentUrl({ sessionId }) {
    try {
        if (!sessions.has(sessionId)) {
            return createStructuredResponse(false, null, "No active session");
        }
        const session = sessions.get(sessionId);
        return createStructuredResponse(true, { url: session.page.url() });
    } catch (error) {
        return createStructuredResponse(false, null, error.message);
    }
}

export async function reloadPage({ sessionId, waitUntil = "load" }) {
    try {
        if (!sessions.has(sessionId)) {
            return createStructuredResponse(false, null, "No active session");
        }
        const session = sessions.get(sessionId);
        await session.page.reload({ waitUntil });
        return createStructuredResponse(true, { 
            url: session.page.url(), 
            title: await session.page.title() 
        });
    } catch (error) {
        return createStructuredResponse(false, null, error.message);
    }
}

export async function goBack({ sessionId }) {
    try {
        if (!sessions.has(sessionId)) {
            return createStructuredResponse(false, null, "No active session");
        }
        const session = sessions.get(sessionId);
        await session.page.goBack();
        return createStructuredResponse(true, { 
            url: session.page.url(), 
            title: await session.page.title() 
        });
    } catch (error) {
        return createStructuredResponse(false, null, error.message);
    }
}

export async function goForward({ sessionId }) {
    try {
        if (!sessions.has(sessionId)) {
            return createStructuredResponse(false, null, "No active session");
        }
        const session = sessions.get(sessionId);
        await session.page.goForward();
        return createStructuredResponse(true, { 
            url: session.page.url(), 
            title: await session.page.title() 
        });
    } catch (error) {
        return createStructuredResponse(false, null, error.message);
    }
}

export async function waitForTimeout({ ms }) {
    try {
        if (typeof ms !== "number" || ms < 0 || ms > 60000) {
            return createStructuredResponse(false, null, "ms must be a number between 0 and 60000");
        }
        await new Promise(r => setTimeout(r, ms));
        return createStructuredResponse(true, { waited: ms });
    } catch (error) {
        return createStructuredResponse(false, null, error.message);
    }
}

export async function getElements({ sessionId, selector }) {
    try {
        if (!isValidSelector(selector)) {
            return createStructuredResponse(false, null, `Invalid selector: ${selector}`);
        }
        if (!sessions.has(sessionId)) {
            return createStructuredResponse(false, null, "No active session");
        }
        const session = sessions.get(sessionId);
        const elements = await session.page.$$(selector);
        const results = await Promise.all(
            elements.slice(0, 100).map(async (el, i) => {
                const text = await el.textContent().catch(() => "");
                const tag = await el.evaluate(e => e.tagName).catch(() => "");
                const id = await el.evaluate(e => e.id || "").catch(() => "");
                const classes = await el.evaluate(e => e.className || "").catch(() => "");
                return { index: i, tag, id, classes, text: text?.trim() };
            })
        );
        return createStructuredResponse(true, { elements: results, count: results.length });
    } catch (error) {
        return createStructuredResponse(false, null, error.message);
    }
}

export async function setViewport({ sessionId, width, height }) {
    try {
        if (typeof width !== "number" || typeof height !== "number") {
            return createStructuredResponse(false, null, "width and height must be numbers");
        }
        if (width < 1 || height < 1) {
            return createStructuredResponse(false, null, "Viewport dimensions must be positive");
        }
        if (!sessions.has(sessionId)) {
            return createStructuredResponse(false, null, "No active session");
        }
        const session = sessions.get(sessionId);
        await session.page.setViewportSize({ width, height });
        return createStructuredResponse(true, { width, height });
    } catch (error) {
        return createStructuredResponse(false, null, error.message);
    }
}

export async function clearCookies({ sessionId }) {
    try {
        if (!sessions.has(sessionId)) {
            return createStructuredResponse(false, null, "No active session");
        }
        const session = sessions.get(sessionId);
        await session.context.clearCookies();
        return createStructuredResponse(true);
    } catch (error) {
        return createStructuredResponse(false, null, error.message);
    }
}

export async function getCookies({ sessionId }) {
    try {
        if (!sessions.has(sessionId)) {
            return createStructuredResponse(false, null, "No active session");
        }
        const session = sessions.get(sessionId);
        const cookies = await session.context.cookies();
        return createStructuredResponse(true, { cookies, count: cookies.length });
    } catch (error) {
        return createStructuredResponse(false, null, error.message);
    }
}

export async function setCookies({ sessionId, cookies }) {
    try {
        if (!Array.isArray(cookies)) {
            return createStructuredResponse(false, null, "cookies must be an array");
        }
        if (!sessions.has(sessionId)) {
            return createStructuredResponse(false, null, "No active session");
        }
        const session = sessions.get(sessionId);
        await session.context.addCookies(cookies);
        return createStructuredResponse(true, { count: cookies.length });
    } catch (error) {
        return createStructuredResponse(false, null, error.message);
    }
}

export function getActiveSessions() {
    return createStructuredResponse(true, { 
        sessions: Array.from(sessions.keys()),
        count: sessions.size 
    });
}
