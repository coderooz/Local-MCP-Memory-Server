import fs from "node:fs/promises";
import path from "node:path";
import http from "node:http";
import { once } from "node:events";

import {
  openBrowser,
  closeBrowser,
  navigateToUrl,
  fillInput,
  clickElement,
  evaluateJavaScript,
  takeScreenshot
} from "../tools/browserTools.js";

const DOCS_ASSET_DIR = path.resolve(process.cwd(), "docs", "assets");

function createFixtureServer() {
  return http.createServer((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");

    if (url.pathname === "/interaction") {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(`<!doctype html>
<html>
  <head>
    <title>Interaction Flow</title>
    <style>
      body { font-family: Georgia, serif; background: linear-gradient(180deg, #fffaf0, #f4eee2); color: #1c2a39; padding: 40px; }
      .shell { max-width: 960px; margin: 0 auto; background: rgba(255,255,255,0.92); border: 1px solid rgba(28,42,57,0.12); border-radius: 24px; padding: 28px; box-shadow: 0 24px 60px rgba(28,42,57,0.12); }
      .search-row { display: grid; grid-template-columns: 1fr auto; gap: 14px; margin-top: 18px; }
      input { padding: 16px 18px; border-radius: 14px; border: 1px solid rgba(28,42,57,0.18); font-size: 16px; }
      button { padding: 16px 20px; border-radius: 14px; border: none; background: #126a51; color: #fff; font-weight: 700; }
      ul { display: grid; gap: 12px; margin: 22px 0 0; padding: 0; list-style: none; }
      li { padding: 14px 16px; border-radius: 16px; background: #f6f1e6; border: 1px solid rgba(28,42,57,0.09); }
      .meta { color: #5c6b78; margin-top: 12px; }
    </style>
  </head>
  <body>
    <div class="shell">
      <h1>Search Playground</h1>
      <p class="meta">Filter browser automation features with live input updates.</p>
      <div class="search-row">
        <input id="search" placeholder="Search features" />
        <button id="search-trigger" onclick="window.applySearch()">Search</button>
      </div>
      <ul id="results">
        <li data-item="Persistent memory coordination">Persistent memory coordination</li>
        <li data-item="Browser automation screenshots">Browser automation screenshots</li>
        <li data-item="Session aware navigation">Session aware navigation</li>
        <li data-item="Selector validation rules">Selector validation rules</li>
      </ul>
    </div>
    <script>
      window.applySearch = function () {
        const query = document.getElementById('search').value.toLowerCase();
        for (const item of document.querySelectorAll('#results li')) {
          item.hidden = !item.dataset.item.toLowerCase().includes(query);
        }
      };
      document.getElementById('search').addEventListener('input', window.applySearch);
    </script>
  </body>
</html>`);
      return;
    }

    if (url.pathname === "/dom") {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(`<!doctype html>
<html>
  <head>
    <title>DOM Interaction Flow</title>
    <style>
      body { font-family: Georgia, serif; background: linear-gradient(180deg, #f6f9ff, #edf2fb); color: #172033; padding: 44px; }
      .shell { max-width: 960px; margin: 0 auto; background: rgba(255,255,255,0.94); border-radius: 26px; border: 1px solid rgba(23,32,51,0.1); padding: 30px; box-shadow: 0 26px 60px rgba(23,32,51,0.12); }
      button { padding: 16px 20px; border-radius: 14px; border: none; background: #204f97; color: #fff; font-weight: 700; }
      .panel { margin-top: 22px; padding: 18px 20px; border-radius: 18px; background: #eef4ff; border: 1px solid rgba(32,79,151,0.15); }
      .panel[hidden] { display: none; }
      .status { color: #5a6883; margin-top: 10px; }
    </style>
  </head>
  <body>
    <div class="shell">
      <h1>DOM Interaction Playground</h1>
      <p class="status" id="status">Panel hidden</p>
      <button id="toggle-panel" onclick="window.togglePanel()">Reveal system status</button>
      <div class="panel" id="detail-panel" hidden>
        <strong>System state updated</strong>
        <p>Click interaction revealed a deferred diagnostics panel.</p>
      </div>
    </div>
    <script>
      window.togglePanel = function () {
        const panel = document.getElementById('detail-panel');
        panel.hidden = !panel.hidden;
        document.getElementById('status').textContent = panel.hidden ? 'Panel hidden' : 'Panel visible';
      };
    </script>
  </body>
</html>`);
      return;
    }

    if (url.pathname === "/evaluate") {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(`<!doctype html>
<html>
  <head>
    <title>Evaluation Flow</title>
    <style>
      body { font-family: Georgia, serif; background: linear-gradient(180deg, #f8fff8, #edf7ee); color: #163225; padding: 42px; }
      .shell { max-width: 980px; margin: 0 auto; background: rgba(255,255,255,0.94); border: 1px solid rgba(22,50,37,0.1); border-radius: 26px; padding: 30px; box-shadow: 0 26px 60px rgba(22,50,37,0.12); }
      .metrics { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; margin-top: 18px; }
      .metric { padding: 16px; border-radius: 18px; background: #f2f8f1; border: 1px solid rgba(22,50,37,0.08); }
      .metric.active { border-color: rgba(18,106,81,0.36); box-shadow: inset 0 0 0 1px rgba(18,106,81,0.16); }
      #eval-banner { margin-top: 22px; padding: 18px 20px; border-radius: 18px; background: #dff3e7; color: #0e573f; font-weight: 700; min-height: 24px; }
    </style>
  </head>
  <body>
    <div class="shell">
      <h1>Evaluation Playground</h1>
      <p>Metrics below are transformed by JavaScript evaluation.</p>
      <div class="metrics">
        <article class="metric active">Navigation healthy</article>
        <article class="metric active">Selectors validated</article>
        <article class="metric">Retries pending</article>
      </div>
      <div id="eval-banner"></div>
    </div>
  </body>
</html>`);
      return;
    }

    if (url.pathname === "/error") {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(`<!doctype html>
<html>
  <head>
    <title>Error Flow</title>
    <style>
      body { font-family: Georgia, serif; background: linear-gradient(180deg, #fff8f6, #fdf0ec); color: #331f19; padding: 44px; }
      .shell { max-width: 980px; margin: 0 auto; background: rgba(255,255,255,0.96); border-radius: 26px; border: 1px solid rgba(51,31,25,0.12); padding: 30px; box-shadow: 0 26px 60px rgba(51,31,25,0.12); }
      .warning { margin-top: 22px; padding: 18px 20px; border-radius: 18px; background: #fde7df; border: 1px solid rgba(171,69,36,0.22); }
      code { background: rgba(51,31,25,0.06); padding: 2px 6px; border-radius: 8px; }
    </style>
  </head>
  <body>
    <div class="shell">
      <h1>Error Handling Playground</h1>
      <p>Used to demonstrate invalid-selector diagnostics.</p>
      <button id="valid-button">Real button</button>
      <div class="warning" id="error-banner">No error captured yet.</div>
    </div>
  </body>
</html>`);
      return;
    }

    res.statusCode = 404;
    res.end("missing");
  });
}

async function writeIfChanged(targetPath, nextBuffer) {
  let currentBuffer = null;
  try {
    currentBuffer = await fs.readFile(targetPath);
  } catch {}

  if (currentBuffer && Buffer.compare(currentBuffer, nextBuffer) === 0) {
    return false;
  }

  await fs.writeFile(targetPath, nextBuffer);
  return true;
}

async function captureToAsset(sessionId, fileName) {
  const shot = await takeScreenshot({ sessionId, fullPage: true });
  if (!shot.success) {
    throw new Error(shot.error || `Screenshot failed for ${fileName}`);
  }

  const buffer = Buffer.from(shot.data.screenshot, "base64");
  const targetPath = path.join(DOCS_ASSET_DIR, fileName);
  await writeIfChanged(targetPath, buffer);
}

async function assertSuccess(result, label) {
  if (!result.success) {
    throw new Error(`${label}: ${result.error || "unknown error"}`);
  }
  return result;
}

async function main() {
  await fs.mkdir(DOCS_ASSET_DIR, { recursive: true });

  const server = createFixtureServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    await assertSuccess(await openBrowser({ sessionId: "docs-open" }), "open browser flow");
    await assertSuccess(
      await navigateToUrl({ sessionId: "docs-open", url: "https://example.com" }),
      "navigate example.com"
    );
    await captureToAsset("docs-open", "open-browser.png");

    await assertSuccess(await openBrowser({ sessionId: "docs-search" }), "open search flow");
    await assertSuccess(
      await navigateToUrl({ sessionId: "docs-search", url: `${baseUrl}/interaction` }),
      "navigate interaction"
    );
    await assertSuccess(
      await fillInput({ sessionId: "docs-search", selector: "#search", value: "browser" }),
      "fill search"
    );
    await assertSuccess(
      await clickElement({ sessionId: "docs-search", selector: "#search-trigger" }),
      "click search"
    );
    await captureToAsset("docs-search", "search-action.png");

    await assertSuccess(await openBrowser({ sessionId: "docs-dom" }), "open dom flow");
    await assertSuccess(
      await navigateToUrl({ sessionId: "docs-dom", url: `${baseUrl}/dom` }),
      "navigate dom"
    );
    await assertSuccess(
      await clickElement({ sessionId: "docs-dom", selector: "#toggle-panel" }),
      "toggle panel"
    );
    await captureToAsset("docs-dom", "dom-interaction.png");

    await assertSuccess(await openBrowser({ sessionId: "docs-eval" }), "open eval flow");
    await assertSuccess(
      await navigateToUrl({ sessionId: "docs-eval", url: `${baseUrl}/evaluate` }),
      "navigate evaluate"
    );
    await assertSuccess(
      await evaluateJavaScript({
        sessionId: "docs-eval",
        script: `(() => {
          const activeCount = document.querySelectorAll('.metric.active').length;
          const banner = document.getElementById('eval-banner');
          banner.textContent = 'Evaluation result: ' + activeCount + ' active checks detected';
          return { activeCount };
        })()`
      }),
      "evaluate page"
    );
    await captureToAsset("docs-eval", "evaluate-result.png");

    await assertSuccess(await openBrowser({ sessionId: "docs-error" }), "open error flow");
    await assertSuccess(
      await navigateToUrl({ sessionId: "docs-error", url: `${baseUrl}/error` }),
      "navigate error"
    );
    const invalidClick = await clickElement({
      sessionId: "docs-error",
      selector: "#missing-selector",
      timeout: 600
    });
    if (invalidClick.success) {
      throw new Error("invalid selector flow unexpectedly succeeded");
    }
    const safeMessage = JSON.stringify(invalidClick.error || "Unknown invalid selector error");
    await assertSuccess(
      await evaluateJavaScript({
        sessionId: "docs-error",
        script: `(() => {
          const message = ${safeMessage};
          document.getElementById('error-banner').innerHTML = '<strong>Captured failure</strong><br/><code>' + message + '</code>';
          return { message };
        })()`
      }),
      "render error message"
    );
    await captureToAsset("docs-error", "error-case.png");
  } finally {
    await closeBrowser({}).catch(() => {});
    server.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
