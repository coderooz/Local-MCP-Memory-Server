const SECTION_ORDER = [
  "overview",
  "collaboration",
  "quickstart",
  "setup",
  "integration",
  "tools",
  "api",
  "identity",
  "examples",
  "architecture",
  "troubleshooting",
  "faq",
  "publish"
];

const VERSION_SOURCE_URL =
  "https://raw.githubusercontent.com/coderooz/Local-MCP-Memory-Server/main/package.json";
const VERSION_FALLBACK = "Current release";

const SITE = {
  meta: {
    title: "Local MCP Memory Server Docs",
    description:
      "Production-ready documentation for Local MCP Memory Server covering setup, MCP integration, durable memory, coordination, API usage, and GitHub Pages deployment.",
    keywords:
      "MCP, Model Context Protocol, MongoDB, Node.js, agent coordination, persistent memory, GitHub Pages"
  },
  brandTagline: "Production-ready docs for persistent memory and safe agent coordination",
  nav: {
    overview: "Overview",
    collaboration: "Collaboration Model",
    quickstart: "Quick Start",
    setup: "Setup",
    integration: "Integration",
    tools: "Tool Reference",
    api: "API Reference",
    identity: "Project Identity",
    examples: "Examples",
    architecture: "Architecture",
    troubleshooting: "Troubleshooting",
    faq: "FAQ",
    publish: "Deployment"
  },
  quickFacts: [
    ["Runtime", "Node.js, Express, MongoDB"],
    ["Protocol", "MCP over stdio"],
    ["Use case", "Persistent memory and multi-agent coordination"]
  ],
  hero: {
    eyebrow: "Professional MCP Documentation",
    title: "Run Local MCP Memory Server as a collaboration layer, not just a memory store.",
    subtitle:
      "Local MCP Memory Server turns MCP into shared working infrastructure for humans and agents. It combines persistent memory, project descriptors, tasks, activity tracking, soft locks, agent presence, and reusable project intelligence so parallel work stays visible, attributable, and safe to scale.",
    actions: [
      ["Start With Setup", "#setup", "primary"],
      ["Read The Case Study", "https://www.coderooz.in/content/local-mcp-memory-server-nodejs-mongodb", "secondary", true],
      ["Open Repository", "https://github.com/coderooz/Local-MCP-Memory-Server", "secondary", true]
    ],
    pills: ["Static docs in `/docs`", "GitHub Pages ready", "Copy-paste examples"],
    badges: [
      ["Persistent memory across sessions", "Store reusable context, constraints, and architectural decisions in MongoDB-backed collections."],
      ["Coordination built for parallel work", "Tasks, messages, activity entries, locks, and heartbeats reduce overlap and make active work visible."],
      ["Flexible runtime model", "Use the shim for editor integrations or run the transport and API independently for observability and control."]
    ]
  },
  sections: {
    overview: {
      title: "What This Project Delivers",
      intro:
        "This project is designed for workflows where memory alone is not enough. It provides the coordination primitives required for long-running agent work in real repositories.",
      cards: [
        ["From isolated agents to shared system state", "Instead of each agent operating in a disconnected loop, the server keeps shared memory, work ownership, presence, and historical context in one project-scoped backend."],
        ["Durable operational context", "Project descriptors, memories, issues, logs, and project-map entries let future work begin with real context instead of repeated discovery."],
        ["Safer concurrency", "Soft locks, activity streams, and version-aware updates surface overlap early so people can coordinate before they collide."]
      ],
      calloutTitle: "Public project narrative",
      calloutBody:
        "The Coderooz article explains the product story and technical positioning behind this server. Use it alongside these docs when you want both a portfolio-facing overview and an implementation-facing reference."
    },
    collaboration: {
      title: "The Collaboration Model",
      intro:
        "The design goal is coordination without friction. The server helps parallel contributors see each other, communicate intent, and avoid silent overwrites.",
      cards: [
        ["Project descriptor first", "The structured project descriptor gives every participant a shared baseline before they make architectural or workflow assumptions."],
        ["Live activity stream", "Agents can publish what they are doing, what changed, and what is in progress so the latest project state is visible without guesswork."],
        ["Soft locks, not hard blockers", "Locks are advisory. They highlight contested files, modules, or tasks while still keeping the human operator in control."],
        ["Warnings instead of hidden conflicts", "Expected-version and timestamp-aware updates are designed to detect overlap and surface it instead of letting stale assumptions silently win."]
      ]
    },
    quickstart: {
      title: "Quick Start",
      intro:
        "These are the shortest reliable steps to get the API, MCP transport, and project-aware shim working locally.",
      steps: [
        "Install dependencies with `npm install`.",
        "Create a `.env` file with your MongoDB connection and project-scoped MCP values.",
        "Start the API with `npm run start:api`.",
        "Start the MCP transport with `npm start` when you want to test it directly.",
        "Use `mcp-shim.js` for editor integrations so project identity is resolved from the current repository."
      ],
      visuals: [
        [
          "Basic Navigation",
          "open-browser.png",
          "Browser automation navigation flow opened on example.com.",
          "Shows a real browser session launched by the plugin and navigated to example.com.",
          "Use it as the first smoke test for browser startup and outbound navigation."
        ]
      ]
    },
    setup: {
      title: "Environment And Runtime Setup",
      intro:
        "The runtime is intentionally simple: MongoDB for persistence, Express for the HTTP layer, and a stdio MCP transport for client integration.",
      prerequisites: [
        "Node.js 18 or later.",
        "A reachable MongoDB instance.",
        "An MCP-capable client or editor.",
        "Project-level environment configuration for stable attribution."
      ],
      modes: [
        ["Install dependencies", "npm install", "Run once after cloning."],
        ["Run the API", "npm run start:api", "Use when you want route visibility or backend-only testing."],
        ["Run the MCP transport", "npm start", "Use for transport-level testing and direct MCP integration."],
        ["Run the shim", "node /absolute/path/to/mcp-shim.js", "Recommended for editor setups and automatic project detection."]
      ],
      envNote:
        "For predictable attribution, keep `MCP_PROJECT` stable and prefer the shim when the active repository should determine the namespace automatically.",
      envRows: [
        ["MONGO_URI", "Yes", "None", "MongoDB connection string for persisted state."],
        ["PORT", "Optional", "4000", "HTTP API port used by `server.js`."],
        ["MCP_AGENT", "Recommended", "unknown", "Stable agent name stored with tasks, actions, and activity."],
        ["MCP_PROJECT", "Recommended", "Auto-resolved when available", "Project namespace that prevents collisions across workspaces."],
        ["MCP_SCOPE", "Optional", "project", "Default scope for memory and project-scoped operations."],
        ["MCP_SERVER_URL", "Optional", "http://localhost:${PORT}", "Base URL used when the transport reaches the API."]
      ]
    },
    integration: {
      title: "How To Integrate It Cleanly",
      intro:
        "The deployment model supports local editor workflows, direct MCP testing, and split API plus transport setups for deeper inspection.",
      cards: [
        ["Use the shim for editor integrations", "The shim is the safest default because it resolves the current project root, keeps identity consistent, and forwards stdio cleanly."],
        ["Run transport directly for protocol debugging", "Start `mcp-server.js` directly when you are working on the MCP layer itself."],
        ["Split the API when you need observability", "Running `server.js` separately makes route testing, logs, and process-level troubleshooting easier."],
        ["Seed structure early", "Create project descriptors, tasks, and project-map entries early so later sessions inherit useful context instead of rebuilding it."]
      ]
    },
    tools: {
      title: "Tool Reference",
      intro:
        "The MCP surface is organized around persistent memory, coordination, messaging, and reusable project intelligence.",
      note:
        "Tool identifiers stay in English so examples remain copy-paste friendly in prompts, JSON, and editor configuration.",
      groups: [
        ["Memory And Audit", [
          ["store_context", "Store durable project memory."],
          ["search_context", "Search stored memory with ranking."],
          ["update_context", "Update memory with version tracking."],
          ["get_connected_context", "Read a context with linked tasks, issues, and actions."],
          ["set_project_descriptor", "Save the shared project descriptor."],
          ["log_action", "Record meaningful implementation changes."]
        ]],
        ["Task Coordination", [
          ["create_task", "Create project-scoped work items."],
          ["fetch_tasks", "Read filtered task lists."],
          ["assign_task", "Claim or hand off a task."],
          ["update_task", "Update blockers, dependencies, or results."],
          ["create_issue", "Create bugs, notes, or blockers."],
          ["resolve_issue", "Resolve an issue when it is closed."]
        ]],
        ["Presence And Messaging", [
          ["send_message", "Send status, warning, or handoff messages."],
          ["request_messages", "Read messages for the current agent."],
          ["register_agent", "Register an agent identity."],
          ["heartbeat_agent", "Refresh presence state."],
          ["record_activity", "Append a live activity entry."],
          ["acquire_resource_lock", "Request a soft lock before shared work."]
        ]],
        ["Project Intelligence", [
          ["create_project_map", "Store structural knowledge about the codebase."],
          ["fetch_project_map", "Retrieve saved project-map entries."],
          ["fetch_metrics", "Read collaboration and memory metrics."],
          ["get_agent_instructions", "Read the system instruction contract."]
        ]],
        ["Browser Automation", [
          ["open_browser", "Initialize browser session, returns sessionId."],
          ["close_browser", "Close session or all sessions."],
          ["navigate_to_url", "Navigate to URL (requires sessionId)."],
          ["get_page_content", "Get page content as text or HTML."],
          ["click_element", "Click element by CSS selector."],
          ["fill_input", "Fill input field with value."],
          ["get_element_text", "Get text content of element."],
          ["evaluate_javascript", "Execute JS in page context."],
          ["take_screenshot", "Capture screenshot (base64 or file)."],
          ["wait_for_selector", "Wait for element state."],
          ["get_page_title", "Get page title."],
          ["get_current_url", "Get current URL."],
          ["get_elements", "Get all matching elements."],
          ["set_viewport", "Set viewport size."],
          ["clear_cookies", "Clear all cookies."],
          ["get_cookies", "Get all cookies."],
          ["set_cookies", "Set cookies."],
          ["get_active_sessions", "List active browser sessions."]
        ]]
      ],
      visuals: [
        [
          "Script Evaluation",
          "evaluate-result.png",
          "JavaScript evaluation result rendered inside the browser documentation fixture.",
          "Demonstrates a real evaluation flow that reads live DOM state and writes the result back into the page.",
          "Use it for advanced browser automation where decisions depend on computed page state."
        ]
      ]
    },
    api: {
      title: "HTTP API Reference",
      intro:
        "The HTTP layer mirrors the MCP capabilities and is useful for admin tooling, dashboards, and direct operational testing.",
      note:
        "Routes are grouped by responsibility so the service can be inspected without reading implementation files first.",
      groups: [
        ["Contexts And Actions", [
          ["POST /context", "Create a persisted memory entry."],
          ["POST /project/descriptor", "Create or update the project descriptor."],
          ["POST /context/search", "Search memory for an agent and project."],
          ["POST /context/update", "Update memory with collaboration-aware checks."],
          ["GET /context/:id/connected", "Fetch a connected context graph."],
          ["POST /action", "Write an action log entry."]
        ]],
        ["Tasks, Issues, And Messaging", [
          ["POST /task", "Create a task."],
          ["POST /task/assign", "Assign or claim a task."],
          ["POST /task/update", "Update task ownership or status."],
          ["POST /issue", "Create a project-scoped issue or note."],
          ["POST /message", "Send an inter-agent message."],
          ["GET /message/:agent_id", "Fetch messages for one agent."]
        ]],
        ["Activity, Locks, And Diagnostics", [
          ["POST /activity", "Record a live activity entry."],
          ["GET /activity", "Fetch recent project activity."],
          ["POST /lock/acquire", "Attempt to acquire a soft resource lock."],
          ["GET /lock/list", "List active soft locks."],
          ["GET /project-map", "Query project-map entries."],
          ["GET /", "Basic health response."]
        ]]
      ]
    },
    identity: {
      title: "Project Identity And Namespace Safety",
      intro:
        "One of the most important operational details is keeping memory and coordination data attached to the correct repository namespace.",
      bullets: [
        "Use a stable `MCP_PROJECT` value so memories, tasks, messages, and activity stay grouped correctly.",
        "Prefer `mcp-shim.js` when your editor is launched inside a repository and the project root should drive identity automatically.",
        "Use `.mcp-project` when a repository needs an explicit project identifier independent of folder naming.",
        "Keep `MCP_AGENT` unique and stable so ownership, heartbeats, messages, and action logs remain easy to interpret."
      ],
      callout:
        "The safer default is to keep the namespace explicit and avoid generic values that can mix records across unrelated workspaces."
    },
    examples: {
      title: "Operational Examples",
      intro:
        "These examples are ready to paste into local setup, editor configuration, or quick verification scripts.",
      items: [
        ["Project-level `.env`", "A practical local starting point with stable project attribution.", ".env", "env", `MONGO_URI=mongodb://localhost:27017/mcp_memory
PORT=4000
MCP_PROJECT=local-mcp-server
MCP_AGENT=codex
MCP_SCOPE=project
MCP_SERVER_URL=http://localhost:4000`],
        ["Editor integration through the shim", "Use the shim when the working repository should determine the project namespace.", "client-config.json", "json", `{
  "mcpServers": {
    "local-memory": {
      "command": "node",
      "args": ["/absolute/path/to/Local-MCP-Memory-Server/mcp-shim.js"],
      "cwd": "/absolute/path/to/your/project",
      "env": { "MCP_AGENT": "codex" }
    }
  }
}`],
        ["Create a project-map entry over MCP", "Store reusable structural knowledge so future sessions do not need to rediscover the codebase.", "project-map-request.json", "json", `{
  "jsonrpc": "2.0",
  "id": 7,
  "method": "tools/call",
  "params": {
    "name": "create_project_map",
    "arguments": {
      "file_path": "server.js",
      "type": "module",
      "summary": "Express API and persistence orchestration layer."
    }
  }
}`],
        ["Acquire a soft lock", "Use a lock when a file or module is likely to be touched by more than one contributor.", "lock-request.json", "json", `{
  "jsonrpc": "2.0",
  "id": 11,
  "method": "tools/call",
  "params": {
    "name": "acquire_resource_lock",
    "arguments": {
      "resource": "project-map:server.js",
      "expiresInMs": 300000
    }
    }
  }`]
      ],
      visuals: [
        [
          "Search Interaction",
          "search-action.png",
          "Live input interaction filtering browser automation features in the documentation fixture.",
          "Shows a real input-driven interaction flow with typed text and updated search results.",
          "Use it when documenting form entry, live filters, or search-driven workflows."
        ],
        [
          "DOM Interaction",
          "dom-interaction.png",
          "DOM interaction screenshot with a clicked control revealing additional UI state.",
          "Shows a real click action that changes page state and reveals a hidden diagnostic panel.",
          "Use it when demonstrating selector-based clicks, toggles, and visible state transitions."
        ]
      ]
    },
    architecture: {
      title: "End-To-End Architecture",
      intro:
        "The runtime is straightforward on purpose: editor or agent client, MCP transport, HTTP API, and MongoDB persistence.",
      cards: [
        ["1. Editor or MCP client", "A coding agent, editor integration, or custom MCP client sends JSON-RPC requests over stdio."],
        ["2. MCP transport", "`mcp-server.js` exposes tools, keeps stdout protocol-safe, injects identity, and can wait for the API when needed."],
        ["3. HTTP API layer", "`server.js` handles validation, querying, indexing, activity, locks, and collaboration state."],
        ["4. Persistence", "MongoDB stores contexts, actions, tasks, issues, messages, agents, activity, metrics, resource locks, and project-map entries."],
        ["5. Reuse loop", "Future sessions read memory, tasks, messages, and project intelligence before taking action."]
      ]
    },
    troubleshooting: {
      title: "Troubleshooting",
      intro:
        "Most problems come down to project identity, API reachability, or incorrect assumptions about coordination state.",
      bullets: [
        "If records appear under the wrong workspace, set `MCP_PROJECT` explicitly or add a `.mcp-project` file.",
        "If the API is unreachable, confirm MongoDB is running and verify that `MONGO_URI` is correct.",
        "If MCP requests fail unexpectedly, keep stdout reserved for JSON-RPC only and send logs elsewhere.",
        "If search quality drops, verify that the text indexes are still being created during startup.",
        "If you see overlap warnings, inspect activity, locks, and current task ownership before forcing shared changes."
      ],
      visuals: [
        [
          "Error Case",
          "error-case.png",
          "Invalid selector failure rendered back into the browser fixture as a troubleshooting example.",
          "Shows a real failure flow where an invalid selector is caught and surfaced as structured feedback.",
          "Use it to explain how selector failures should be diagnosed before retrying automation steps."
        ]
      ]
    },
    faq: {
      title: "Frequently Asked Questions",
      intro:
        "These are the most common operational questions that come up when wiring the server into real workflows.",
      items: [
        ["Should I launch the transport directly or use the shim?", "Use the shim for editor integrations and project-aware workflows. Run the transport directly when you are debugging the MCP layer itself."],
        ["When should I use memory versus the project map?", "Use memory for decisions, patterns, fixes, and reusable narrative context. Use the project map for structural knowledge about files, modules, folders, and ownership."],
        ["Can the API run separately from the MCP transport?", "Yes. `server.js` can run as a standalone API, and `mcp-server.js` can point to it through `MCP_SERVER_URL`."],
        ["Do soft locks block the user?", "No. They are advisory coordination signals. The system is designed to warn and coordinate, not remove human control."],
        ["Why do stable agent names matter?", "Stable `MCP_AGENT` values make ownership, messages, heartbeats, and action logs much easier to interpret over time."]
      ]
    },
    publish: {
      title: "Deployment And Publishing",
      intro:
        "The docs site is already structured as a static deployment from the repository `docs/` directory, so no build step is required for GitHub Pages.",
      cards: [
        ["Static by design", "The documentation is shipped as plain HTML, CSS, and JavaScript, which keeps hosting simple and deployment risk low."],
        ["Repository-friendly", "Because everything lives in `docs/`, the docs site stays versioned alongside the implementation."]
      ],
      steps: [
        "Commit the `docs/` directory to your default branch.",
        "Open GitHub repository settings and go to Pages.",
        "Choose `Deploy from a branch`.",
        "Select your main branch and the `/docs` folder.",
        "Save the settings and wait for the Pages build to complete.",
        "Use the generated site URL, or add a custom domain later if needed.",
        "Push future docs updates to the same branch and GitHub Pages will redeploy automatically."
      ],
      callout:
        "This page now uses deployment-safe copy and points only to complete, public references: the repository, the live docs, and the Coderooz case study."
    }
  },
  footer: {
    lineOne:
      "Local MCP Memory Server provides a production-focused coordination layer for MCP workflows that need durable context, shared visibility, and safer parallel execution.",
    lineTwo:
      'Reference links: <a href="https://github.com/coderooz/Local-MCP-Memory-Server" target="_blank" rel="noreferrer">Repository</a> | <a href="https://www.coderooz.in/content/local-mcp-memory-server-nodejs-mongodb" target="_blank" rel="noreferrer">Case Study</a> | <a href="https://coderooz.github.io/Local-MCP-Memory-Server/" target="_blank" rel="noreferrer">Live Docs</a>'
  }
};

const ELS = {
  hero: document.getElementById("hero"),
  toc: document.getElementById("toc"),
  quickFacts: document.getElementById("quick-facts"),
  footer: document.getElementById("footer"),
  brandTagline: document.getElementById("brand-tagline"),
  sidebarHeading: document.getElementById("sidebar-heading"),
  languagePicker: document.querySelector(".language-picker"),
  softwareSchema: document.getElementById("software-schema")
};

const state = {
  version: VERSION_FALLBACK
};

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function setMeta(selector, value) {
  const element = document.querySelector(selector);
  if (element) element.setAttribute("content", value);
}

function sectionHeading(id, title, intro) {
  return `
    <div class="section-heading">
      <div>
        <h2>${title}</h2>
        <p>${intro}</p>
      </div>
      <a class="anchor-link" href="#${id}" aria-label="Link to ${title}">#</a>
    </div>
  `;
}

function list(items, ordered = false) {
  const tag = ordered ? "ol" : "ul";
  const className = ordered ? "numbered" : "bullets";
  return `<${tag} class="${className}">${items.map((item) => `<li>${item}</li>`).join("")}</${tag}>`;
}

function cardGrid(cards, className = "info-card") {
  return `
    <div class="card-grid">
      ${cards
        .map(
          ([title, body]) => `
            <article class="${className}">
              <h3>${title}</h3>
              <p>${body}</p>
            </article>
          `
        )
        .join("")}
    </div>
  `;
}

function referenceGroups(groups) {
  return `
    <div class="reference-grid">
      ${groups
        .map(
          ([name, items]) => `
            <article class="reference-card">
              <h3>${name}</h3>
              <ul class="bullets">
                ${items
                  .map(([tool, body]) => `<li><strong><code>${tool}</code></strong><br />${body}</li>`)
                  .join("")}
              </ul>
            </article>
          `
        )
        .join("")}
    </div>
  `;
}

function examples(items) {
  return `
    <div class="example-grid">
      ${items
        .map(
          ([title, body, filename, language, code]) => `
            <article class="example-card">
              <h3>${title}</h3>
              <p>${body}</p>
              <div class="code-shell">
                <div class="code-topbar">
                  <div class="code-meta"><strong>${filename}</strong><span>${language}</span></div>
                  <button class="copy-button" data-copy="${escapeHtml(code)}">Copy</button>
                </div>
                <pre><code>${escapeHtml(code)}</code></pre>
              </div>
            </article>
          `
        )
        .join("")}
    </div>
  `;
}

function faq(items) {
  return `
    <div class="faq-grid">
      ${items
        .map(
          ([question, answer]) => `
            <article class="faq-card">
              <h3>${question}</h3>
              <p>${answer}</p>
            </article>
          `
        )
        .join("")}
    </div>
  `;
}

function envTable(rows) {
  return `
    <div class="data-table-wrap">
      <table class="data-table">
        <thead>
          <tr><th>Variable</th><th>Required</th><th>Default</th><th>Purpose</th></tr>
        </thead>
        <tbody>
          ${rows
            .map(
              ([variable, required, defaultValue, purpose]) => `
                <tr>
                  <td><code>${variable}</code></td>
                  <td>${required}</td>
                  <td>${defaultValue}</td>
                  <td>${purpose}</td>
                </tr>
              `
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function docVisuals(items) {
  if (!items?.length) return "";

  return `
    <div class="doc-visual-grid">
      ${items
        .map(
          ([featureName, fileName, alt, description, usage]) => `
            <div class="doc-section doc-visual-card">
              <h3>Feature: ${escapeHtml(featureName)}</h3>
              <img src="./assets/${escapeHtml(fileName)}" alt="${escapeHtml(alt)}" loading="lazy" />
              <p>
                Description:
                - ${escapeHtml(description)}<br/>
                - ${escapeHtml(usage)}
              </p>
            </div>
          `
        )
        .join("")}
    </div>
  `;
}

function getQuickFacts() {
  return [["Version", state.version], ...SITE.quickFacts];
}

const SECTION_RENDERERS = {
  overview(section) {
    return `
      ${sectionHeading("overview", section.title, section.intro)}
      <div class="highlight-grid">
        ${section.cards
          .map(
            ([title, body]) => `
              <article class="info-card">
                <h3>${title}</h3>
                <p>${body}</p>
              </article>
            `
          )
          .join("")}
      </div>
      <div class="callout">
        <strong>${section.calloutTitle}</strong><br />
        ${section.calloutBody}
        <div class="hero-actions" style="margin-top: 0.9rem;">
          <a class="secondary" href="https://www.coderooz.in/content/local-mcp-memory-server-nodejs-mongodb" target="_blank" rel="noreferrer">Open Case Study</a>
          <a class="secondary" href="https://github.com/coderooz/Local-MCP-Memory-Server" target="_blank" rel="noreferrer">Open Repository</a>
        </div>
      </div>
    `;
  },
  collaboration: (section) => `${sectionHeading("collaboration", section.title, section.intro)}${cardGrid(section.cards)}`,
  quickstart: (section) => `${sectionHeading("quickstart", section.title, section.intro)}${list(section.steps, true)}${docVisuals(section.visuals)}`,
  setup(section) {
    return `
      ${sectionHeading("setup", section.title, section.intro)}
      <div class="card-grid">
        <article class="info-card">
          <h3>Prerequisites</h3>
          ${list(section.prerequisites)}
        </article>
        <article class="info-card">
          <h3>Startup modes</h3>
          <ul class="bullets">
            ${section.modes
              .map(([title, code, body]) => `<li><strong>${title}</strong><br />${body}<br /><code>${code}</code></li>`)
              .join("")}
          </ul>
        </article>
      </div>
      <div class="callout">${section.envNote}</div>
      ${envTable(section.envRows)}
    `;
  },
  integration: (section) => `${sectionHeading("integration", section.title, section.intro)}${cardGrid(section.cards)}`,
  tools: (section) => `${sectionHeading("tools", section.title, section.intro)}<div class="callout">${section.note}</div>${referenceGroups(section.groups)}${docVisuals(section.visuals)}`,
  api: (section) => `${sectionHeading("api", section.title, section.intro)}<div class="callout">${section.note}</div>${referenceGroups(section.groups)}`,
  identity: (section) => `${sectionHeading("identity", section.title, section.intro)}${list(section.bullets)}<div class="callout">${section.callout}</div>`,
  examples: (section) => `${sectionHeading("examples", section.title, section.intro)}${examples(section.items)}${docVisuals(section.visuals)}`,
  architecture: (section) => `${sectionHeading("architecture", section.title, section.intro)}${cardGrid(section.cards)}`,
  troubleshooting: (section) => `${sectionHeading("troubleshooting", section.title, section.intro)}${list(section.bullets)}${docVisuals(section.visuals)}`,
  faq: (section) => `${sectionHeading("faq", section.title, section.intro)}${faq(section.items)}`,
  publish(section) {
    return `
      ${sectionHeading("publish", section.title, section.intro)}
      <div class="publish-grid">
        ${section.cards
          .map(
            ([title, body]) => `
              <article class="publish-card">
                <h3>${title}</h3>
                <p>${body}</p>
              </article>
            `
          )
          .join("")}
        <article class="publish-card">
          <h3>Deployment steps</h3>
          ${list(section.steps, true)}
        </article>
      </div>
      <div class="callout">${section.callout}</div>
    `;
  }
};

function renderMeta() {
  document.documentElement.lang = "en";
  document.documentElement.dir = "ltr";
  document.title = SITE.meta.title;
  setMeta('meta[name="description"]', SITE.meta.description);
  setMeta('meta[name="keywords"]', SITE.meta.keywords);
  setMeta('meta[property="og:title"]', SITE.meta.title);
  setMeta('meta[property="og:description"]', SITE.meta.description);
  setMeta('meta[property="og:url"]', "https://coderooz.github.io/Local-MCP-Memory-Server/");
  setMeta('meta[name="twitter:title"]', SITE.meta.title);
  setMeta('meta[name="twitter:description"]', SITE.meta.description);
}

function renderHero() {
  ELS.hero.innerHTML = `
    <div class="hero-grid">
      <div>
        <span class="eyebrow">${SITE.hero.eyebrow}</span>
        <h1 class="hero-title">${SITE.hero.title}</h1>
        <p class="hero-subtitle">${SITE.hero.subtitle}</p>
        <div class="hero-actions">
          ${SITE.hero.actions
            .map(
              ([label, href, variant, external]) =>
                `<a class="${variant}" href="${href}"${external ? ' target="_blank" rel="noreferrer"' : ""}>${label}</a>`
            )
            .join("")}
        </div>
        <div class="pill-row">${SITE.hero.pills.map((pill) => `<span class="pill">${pill}</span>`).join("")}</div>
      </div>
      <div class="hero-badges">
        ${SITE.hero.badges
          .map(
            ([title, body]) => `
              <article class="hero-badge">
                <strong>${title}</strong>
                <span>${body}</span>
              </article>
            `
          )
          .join("")}
      </div>
    </div>
  `;
}

function renderToc() {
  ELS.toc.innerHTML = SECTION_ORDER.map(
    (id) => `<a href="#${id}" data-section-link="${id}">${SITE.nav[id]}</a>`
  ).join("");
}

function renderQuickFacts() {
  ELS.quickFacts.innerHTML = `
    <p class="sidebar-eyebrow">Quick Facts</p>
    <div class="fact-list">
      ${getQuickFacts()
        .map(
          ([label, value]) => `
            <article class="stat-card">
              <strong>${label}</strong>
              <span>${value}</span>
            </article>
          `
        )
        .join("")}
    </div>
  `;
}

function updateStructuredData() {
  if (!ELS.softwareSchema) return;

  try {
    const data = JSON.parse(ELS.softwareSchema.textContent);
    data.softwareVersion = state.version;
    ELS.softwareSchema.textContent = JSON.stringify(data, null, 2);
  } catch {}
}

function renderSections() {
  SECTION_ORDER.forEach((id) => {
    const element = document.getElementById(id);
    if (element) element.innerHTML = SECTION_RENDERERS[id](SITE.sections[id]);
  });
}

function renderFooter() {
  ELS.footer.innerHTML = `<p>${SITE.footer.lineOne}</p><p>${SITE.footer.lineTwo}</p>`;
}

async function fetchProjectVersion() {
  try {
    const response = await fetch(VERSION_SOURCE_URL, {
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error(`Version fetch failed: ${response.status}`);
    }

    const pkg = await response.json();
    if (pkg?.version) {
      state.version = pkg.version;
    }
  } catch {}
}

function bindCopyButtons() {
  document.querySelectorAll("[data-copy]").forEach((button) => {
    button.addEventListener("click", async () => {
      const text = button
        .getAttribute("data-copy")
        .replaceAll("&quot;", '"')
        .replaceAll("&lt;", "<")
        .replaceAll("&gt;", ">")
        .replaceAll("&amp;", "&");

      try {
        await navigator.clipboard.writeText(text);
        const original = button.textContent;
        button.textContent = "Copied";
        setTimeout(() => {
          button.textContent = original;
        }, 1200);
      } catch {
        button.textContent = "Copy failed";
        setTimeout(() => {
          button.textContent = "Copy";
        }, 1200);
      }
    });
  });
}

function bindActiveSectionTracking() {
  const links = new Map(
    [...document.querySelectorAll("[data-section-link]")].map((link) => [
      link.getAttribute("data-section-link"),
      link
    ])
  );

  const observer = new IntersectionObserver(
    (entries) => {
      const entry = entries
        .filter((item) => item.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

      if (!entry) return;

      links.forEach((link) => link.classList.remove("active"));
      const active = links.get(entry.target.id);
      if (active) active.classList.add("active");
    },
    { rootMargin: "-25% 0px -60% 0px", threshold: [0.1, 0.3, 0.6] }
  );

  SECTION_ORDER.forEach((id) => {
    const section = document.getElementById(id);
    if (section) observer.observe(section);
  });
}

async function init() {
  renderMeta();
  if (ELS.languagePicker) ELS.languagePicker.hidden = true;
  ELS.brandTagline.textContent = SITE.brandTagline;
  ELS.sidebarHeading.textContent = "On This Page";
  renderHero();
  renderToc();
  renderQuickFacts();
  renderSections();
  renderFooter();
  updateStructuredData();
  bindCopyButtons();
  bindActiveSectionTracking();

  await fetchProjectVersion();
  renderQuickFacts();
  updateStructuredData();
}

init();
