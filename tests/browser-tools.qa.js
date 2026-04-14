import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import http from "node:http";
import { once } from "node:events";

import {
  openBrowser,
  closeBrowser,
  navigateToUrl,
  getPageTitle,
  getCurrentUrl,
  getPageContent,
  clickElement,
  fillInput,
  getElementText,
  evaluateJavaScript,
  takeScreenshot,
  waitForSelector,
  reloadPage,
  goBack,
  goForward,
  getCookies,
  setCookies,
  clearCookies,
  getActiveSessions
} from "../tools/browserTools.js";

function createFixtureServer() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    if (url.pathname === "/") {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(`<!doctype html>
<html>
  <head><title>QA Fixture</title></head>
  <body>
    <h1 id="title">QA Fixture</h1>
    <input id="field" value="" />
    <button id="apply" onclick="document.querySelector('#output').textContent = document.querySelector('#field').value">Apply</button>
    <button id="next" onclick="location.href='/next'">Next</button>
    <div id="output"></div>
    <script>document.cookie = 'server=1; path=/';</script>
  </body>
</html>`);
      return;
    }

    if (url.pathname === "/next") {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(`<!doctype html><html><head><title>QA Next</title></head><body><h1>QA Next</h1></body></html>`);
      return;
    }

    res.statusCode = 404;
    res.end("missing");
  });

  return server;
}

function sendMcpRequest(child, payload) {
  child.stdin.write(`${JSON.stringify(payload)}\n`);
}

async function run() {
  const server = createFixtureServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  const functionalSession = "qa-functional";
  const edgeSession = "qa-edge";

  try {
    const open = await openBrowser({ sessionId: functionalSession });
    assert.equal(open.success, true);
    assert.equal(open.data.sessionId, functionalSession);

    const navigate = await navigateToUrl({ sessionId: functionalSession, url: baseUrl });
    assert.equal(navigate.success, true);
    assert.equal(navigate.data.title, "QA Fixture");

    const title = await getPageTitle({ sessionId: functionalSession });
    assert.equal(title.data.title, "QA Fixture");

    const currentUrl = await getCurrentUrl({ sessionId: functionalSession });
    assert.equal(currentUrl.data.url, `${baseUrl}/`);

    const pageText = await getPageContent({ sessionId: functionalSession, format: "text" });
    assert.equal(pageText.success, true);
    assert.match(pageText.data.content, /QA Fixture/);

    const selector = await waitForSelector({ sessionId: functionalSession, selector: "#apply" });
    assert.equal(selector.success, true);

    const fill = await fillInput({ sessionId: functionalSession, selector: "#field", value: "alpha" });
    assert.equal(fill.success, true);

    const click = await clickElement({ sessionId: functionalSession, selector: "#apply" });
    assert.equal(click.success, true);

    const output = await getElementText({ sessionId: functionalSession, selector: "#output" });
    assert.equal(output.data.text, "alpha");

    const append = await fillInput({
      sessionId: functionalSession,
      selector: "#field",
      value: "-beta",
      clear: false
    });
    assert.equal(append.success, true);

    const appendClick = await clickElement({ sessionId: functionalSession, selector: "#apply" });
    assert.equal(appendClick.success, true);

    const appendedOutput = await getElementText({ sessionId: functionalSession, selector: "#output" });
    assert.equal(appendedOutput.data.text, "alpha-beta");

    const evalResult = await evaluateJavaScript({
      sessionId: functionalSession,
      script: "({ title: document.title, output: document.querySelector('#output').textContent })"
    });
    assert.equal(evalResult.success, true);
    assert.equal(evalResult.data.result.output, "alpha-beta");

    const screenshot = await takeScreenshot({ sessionId: functionalSession, fullPage: true });
    assert.equal(screenshot.success, true);
    assert.ok(screenshot.data.screenshot.length > 100);

    const reload = await reloadPage({ sessionId: functionalSession });
    assert.equal(reload.success, true);

    const goNext = await clickElement({ sessionId: functionalSession, selector: "#next" });
    assert.equal(goNext.success, true);

    const back = await goBack({ sessionId: functionalSession });
    assert.equal(back.success, true);
    assert.equal(back.data.title, "QA Fixture");

    const forward = await goForward({ sessionId: functionalSession });
    assert.equal(forward.success, true);
    assert.equal(forward.data.title, "QA Next");

    const initialCookies = await getCookies({ sessionId: functionalSession });
    assert.equal(initialCookies.success, true);
    assert.ok(initialCookies.data.cookies.some((cookie) => cookie.name === "server"));

    const cookieSet = await setCookies({
      sessionId: functionalSession,
      cookies: [{ name: "custom", value: "two", domain: "127.0.0.1", path: "/" }]
    });
    assert.equal(cookieSet.success, true);

    const cookiesAfterSet = await getCookies({ sessionId: functionalSession });
    assert.ok(cookiesAfterSet.data.cookies.some((cookie) => cookie.name === "custom"));

    const cookiesCleared = await clearCookies({ sessionId: functionalSession });
    assert.equal(cookiesCleared.success, true);

    const cookiesAfterClear = await getCookies({ sessionId: functionalSession });
    assert.equal(cookiesAfterClear.data.count, 0);

    const invalidUrl = await navigateToUrl({ sessionId: functionalSession, url: "javascript:alert(1)" });
    assert.equal(invalidUrl.success, false);

    const invalidFormat = await getPageContent({ sessionId: functionalSession, format: "binary" });
    assert.equal(invalidFormat.success, false);

    const unsafeScript = await evaluateJavaScript({
      sessionId: functionalSession,
      script: 'Object["constructor"]["prototype"].polluted = true'
    });
    assert.equal(unsafeScript.success, false);

    const unsafeScreenshot = await takeScreenshot({ sessionId: functionalSession, path: "../outside.png" });
    assert.equal(unsafeScreenshot.success, false);

    const badCookies = await setCookies({ sessionId: functionalSession, cookies: [{ bad: "shape" }] });
    assert.equal(badCookies.success, false);

    const concurrency = await Promise.all(
      Array.from({ length: 3 }, async (_, index) => {
        const sessionId = `qa-concurrency-${index}`;
        await openBrowser({ sessionId });
        await navigateToUrl({ sessionId, url: baseUrl });
        await fillInput({ sessionId, selector: "#field", value: `value-${index}` });
        await clickElement({ sessionId, selector: "#apply" });
        const text = await getElementText({ sessionId, selector: "#output" });
        const cookies = await getCookies({ sessionId });
        await closeBrowser({ sessionId });
        return {
          text: text.data.text,
          cookieNames: cookies.data.cookies.map((cookie) => cookie.name).sort()
        };
      })
    );

    assert.deepEqual(
      concurrency.map((entry) => entry.text).sort(),
      ["value-0", "value-1", "value-2"]
    );
    assert.deepEqual(
      concurrency.map((entry) => entry.cookieNames),
      [["server"], ["server"], ["server"]]
    );

    const duplicateOpens = await Promise.all(
      Array.from({ length: 5 }, () => openBrowser({ sessionId: edgeSession }))
    );
    assert.ok(duplicateOpens.every((result) => result.success));
    assert.equal(getActiveSessions().data.sessions.includes(edgeSession), true);

    const duplicateClose = await closeBrowser({ sessionId: edgeSession });
    assert.equal(duplicateClose.success, true);

    const closedSessionUse = await getPageTitle({ sessionId: edgeSession });
    assert.equal(closedSessionUse.success, false);

    const child = spawn(process.execPath, ["mcp-server.js"], {
      cwd: process.cwd(),
      stdio: ["pipe", "pipe", "pipe"],
      env: process.env
    });

    let stdout = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    sendMcpRequest(child, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "qa", version: "1.0.0" }
      }
    });
    sendMcpRequest(child, {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name: "open_browser",
        arguments: { sessionId: "mcp-qa" }
      }
    });
    sendMcpRequest(child, {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: "navigate_to_url",
        arguments: { sessionId: "mcp-qa", url: baseUrl }
      }
    });
    sendMcpRequest(child, {
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: {
        name: "get_page_title",
        arguments: { sessionId: "mcp-qa" }
      }
    });
    sendMcpRequest(child, {
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: {
        name: "close_browser",
        arguments: { sessionId: "mcp-qa" }
      }
    });

    await new Promise((resolve) => setTimeout(resolve, 2500));
    child.kill("SIGTERM");
    await once(child, "exit");

    const responses = stdout
      .trim()
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line));

    const openResponse = responses.find((entry) => entry.id === 2);
    const navigateResponse = responses.find((entry) => entry.id === 3);
    const titleResponse = responses.find((entry) => entry.id === 4);
    assert.match(openResponse.result.content[0].text, /Session ID: mcp-qa/);
    assert.match(navigateResponse.result.content[0].text, /Title: QA Fixture/);
    assert.equal(titleResponse.result.content[0].text, "QA Fixture");

    console.log("browser QA passed");
  } finally {
    await closeBrowser({ sessionId: functionalSession }).catch(() => {});
    await closeBrowser({ sessionId: edgeSession }).catch(() => {});
    await closeBrowser({}).catch(() => {});
    server.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
