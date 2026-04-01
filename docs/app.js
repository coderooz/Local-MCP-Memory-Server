const STORAGE_KEY = "lmms-docs-language";

const languages = [
  { code: "en", label: "English" },
  { code: "hi", label: "हिन्दी" },
  { code: "es", label: "Español" },
  { code: "ru", label: "Русский" },
  { code: "fr", label: "Français" },
  { code: "de", label: "Deutsch" },
  { code: "pt", label: "Português" },
  { code: "zh", label: "中文" },
  { code: "ja", label: "日本語" },
  { code: "ar", label: "العربية" }
];

const sectionIds = [
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

const shared = {
  facts: [
    { label: "Repository", value: "coderooz/Local-MCP-Memory-Server" },
    { label: "Runtime", value: "Node.js, Express, MongoDB" },
    { label: "Protocol", value: "Model Context Protocol (JSON-RPC over stdio)" },
    { label: "Primary goal", value: "Human-plus-agent collaboration with durable memory and safe coordination" }
  ],
  prerequisites: [
    "Node.js 18+ so the built-in fetch API and modern ESM syntax work cleanly.",
    "A reachable MongoDB instance for persistence, indexes, logs, tasks, and project map entries.",
    "An editor or MCP-capable client that can launch either mcp-shim.js or mcp-server.js.",
    "Basic environment-variable support so each agent can identify itself and the project scope correctly."
  ],
  envRows: [
    {
      variable: "MONGO_URI",
      required: "Yes",
      defaultValue: "None",
      purpose: "MongoDB connection string for all persisted state."
    },
    {
      variable: "PORT",
      required: "Optional",
      defaultValue: "4000",
      purpose: "HTTP API port used by server.js and by the MCP transport when auto-starting the API."
    },
    {
      variable: "MCP_AGENT",
      required: "Recommended",
      defaultValue: "unknown",
      purpose: "Stable agent identity stored with messages, tasks, actions, and memory."
    },
    {
      variable: "MCP_PROJECT",
      required: "Recommended",
      defaultValue: "Resolved automatically",
      purpose: "Project namespace used to keep one workspace from colliding with another."
    },
    {
      variable: "MCP_SCOPE",
      required: "Optional",
      defaultValue: "project",
      purpose: "Scope of stored data when the client sends memory and project-map entries."
    },
    {
      variable: "MCP_SERVER_URL",
      required: "Optional",
      defaultValue: "http://localhost:${PORT}",
      purpose: "Where the MCP transport sends API requests."
    },
    {
      variable: "MCP_PROJECT_ROOT",
      required: "No",
      defaultValue: "Injected automatically",
      purpose: "Traceable root directory used for project-identity debugging and attribution."
    }
  ],
  startupModes: [
    {
      title: "Install dependencies",
      detail:
        "Clone the repository, enter the project, and install packages before launching either the API or the MCP transport.",
      code: "npm install"
    },
    {
      title: "Run the HTTP API directly",
      detail:
        "Use this when you want to inspect the persistence layer separately, test routes, or run the API as a standalone service.",
      code: "npm run start:api"
    },
    {
      title: "Run the MCP stdio server directly",
      detail:
        "This path starts the transport layer and auto-starts the API if needed. Good for local protocol testing and custom clients.",
      code: "npm start"
    },
    {
      title: "Run through the shim",
      detail:
        "Use the shim from an editor or MCP client when you want automatic project detection and safer project-level identity handling.",
      code: "node /absolute/path/to/mcp-shim.js"
    }
  ],
  toolGroups: [
    {
      name: "Memory and Audit",
      items: [
        ["store_context", "Store durable, reusable memory as content text."],
        ["search_context", "Search stored memory with Mongo text search plus app-side ranking."],
        ["update_context", "Update memory with version tracking and collaboration warnings."],
        ["get_full_context", "Fetch a context entry together with related actions."],
        ["get_connected_context", "Fetch memory together with linked tasks, issues, actions, versions, and agents."],
        ["set_project_descriptor", "Store the structured project descriptor used as baseline project context."],
        ["get_project_descriptor", "Fetch the active project descriptor."],
        ["optimize_memory", "Run memory decay, promotion, and archival checks."],
        ["log_action", "Record meaningful implementation changes for traceability."],
        ["start_session", "Mark a working session for long-running tasks."],
        ["get_logs", "Read backend logs without touching MCP stdout."]
      ]
    },
    {
      name: "Task Coordination",
      items: [
        ["create_task", "Create project-scoped work items before large or shared changes."],
        ["fetch_tasks", "Read filtered task lists by assignment, creator, status, or limit."],
        ["assign_task", "Claim ownership or hand work to another agent."],
        ["update_task", "Update blockers, status, dependencies, priority, handoff results, and collaboration-aware warnings."],
        ["create_issue", "Create bugs, notes, blockers, or insights linked to shared work."],
        ["resolve_issue", "Resolve an issue when the blocker or observation is closed."],
        ["fetch_issues", "Read current issues for the active project."]
      ]
    },
    {
      name: "Messaging, Presence, and Collaboration",
      items: [
        ["send_message", "Send coordination, blocker, status, or handoff messages."],
        ["request_messages", "Read project-scoped messages for the current agent."],
        ["register_agent", "Register an agent identity in the system."],
        ["heartbeat_agent", "Keep the agent registry fresh with active, idle, or offline state."],
        ["list_agents", "See the currently known agents."],
        ["record_activity", "Append a live activity entry for project visibility."],
        ["fetch_activity", "Read the live activity stream."],
        ["acquire_resource_lock", "Request a soft lock for a shared resource before editing."],
        ["release_resource_lock", "Release a soft lock after the shared work is done."],
        ["fetch_resource_locks", "Inspect active locks before entering contested work."]
      ]
    },
    {
      name: "Project Intelligence",
      items: [
        ["create_project_map", "Store structured project knowledge for files, folders, modules, or the project root."],
        ["fetch_project_map", "Retrieve project-map entries so future agents do not re-map the repository from scratch."],
        ["fetch_metrics", "Read task, memory, and collaboration metrics."],
        ["get_agent_instructions", "Read the current system-level instruction contract the transport exposes."]
      ]
    }
  ]
};

shared.apiGroups = [
  {
    name: "Contexts and Actions",
    items: [
      ["POST /context", "Create a persisted memory entry."],
      ["POST /project/descriptor", "Create or update the structured project descriptor."],
      ["GET /project/descriptor", "Fetch the active project descriptor for a project."],
      ["POST /context/search", "Search memory for a given agent and project."],
      ["POST /context/update", "Update memory with version tracking and collaboration-aware warnings."],
      ["GET /context/:id/full", "Fetch one context and its related actions."],
      ["GET /context/:id/connected", "Fetch connected context graph data, including tasks, issues, versions, and agents."],
      ["POST /memory/optimize", "Run the memory optimization engine."],
      ["POST /action", "Write an action log entry."],
      ["POST /session", "Create a tracked working session."]
    ]
  },
  {
    name: "Tasks, Messaging, and Agents",
    items: [
      ["POST /agent/register", "Register or refresh an agent record."],
      ["POST /agent/heartbeat", "Refresh an agent heartbeat and derived status."],
      ["GET /agent/list", "List agents."],
      ["POST /task", "Create a task."],
      ["POST /task/assign", "Assign or claim a task."],
      ["POST /task/update", "Update task status, ownership, blockers, or results."],
      ["GET /task/list", "Fetch project-aware task lists with filters."],
      ["POST /issue", "Create an issue or note linked to memory and tasks."],
      ["POST /issue/resolve", "Resolve an issue."],
      ["GET /issue/list", "Fetch project-scoped issues."],
      ["POST /message", "Send an inter-agent message."],
      ["GET /message/:agent_id", "Fetch project-scoped messages for an agent."]
    ]
  },
  {
    name: "Activity, Locks, Project Map, and Diagnostics",
    items: [
      ["POST /activity", "Record a live activity entry."],
      ["GET /activity", "Fetch the project activity stream."],
      ["POST /lock/acquire", "Attempt to acquire a soft resource lock."],
      ["POST /lock/release", "Release a previously held soft lock."],
      ["GET /lock/list", "List active soft locks."],
      ["POST /project-map", "Create or upsert a project-map entry by project plus file_path."],
      ["GET /project-map", "Query project-map entries by project, file_path, type, text query, and limit."],
      ["GET /metrics", "Query collaboration, memory, and task metrics."],
      ["POST /logs", "Query recent logs."],
      ["POST /log", "Write a single log entry."],
      ["GET /", "Simple health check response."]
    ]
  }
];

shared.examples = [
  {
    id: "env",
    title: "Project-level .env",
    blurb:
      "A practical starting point for local development and correct project attribution.",
    language: "env",
    filename: ".env",
    code: `MONGO_URI=mongodb://localhost:27017/mcp_memory
PORT=4000
MCP_PROJECT=local-mcp-server
MCP_AGENT=codex
MCP_SCOPE=project
MCP_SERVER_URL=http://localhost:4000`
  },
  {
    id: "client",
    title: "Editor or MCP client integration",
    blurb:
      "Launch the shim so project identity is derived from the repository you are actually working in.",
    language: "json",
    filename: "client-config.json",
    code: `{
  "mcpServers": {
    "local-memory": {
      "command": "node",
      "args": [
        "/absolute/path/to/Local-MCP-Memory-Server/mcp-shim.js"
      ],
      "cwd": "/absolute/path/to/your/project",
      "env": {
        "MCP_AGENT": "codex"
      }
    }
  }
}`
  },
  {
    id: "rpc",
    title: "Create a project-map entry over MCP",
    blurb:
      "Use the MCP tool surface when you want reusable structure knowledge stored for future agents.",
    language: "json",
    filename: "project-map-request.json",
    code: `{
  "jsonrpc": "2.0",
  "id": 7,
  "method": "tools/call",
  "params": {
    "name": "create_project_map",
    "arguments": {
      "file_path": "server.js",
      "type": "module",
      "summary": "Express API and persistence orchestration layer.",
      "dependencies": ["mcp.model.js", "logger.js", "utils/routeHandler.js"],
      "key_details": [
        "Creates Mongo indexes during startup",
        "Handles tasks, messages, logs, and project map entries"
      ],
      "relationships": {
        "parent": ".",
        "children": ["utils/routeHandler.js"]
      },
      "tags": ["api", "mongodb", "coordination"]
    }
  }
}`
  },
  {
    id: "lock",
    title: "Acquire a soft lock before shared work",
    blurb:
      "Use a soft lock when you are about to modify a file, module, or shared task area that another agent or the user may also be touching.",
    language: "json",
    filename: "lock-request.json",
    code: `{
  "jsonrpc": "2.0",
  "id": 11,
  "method": "tools/call",
  "params": {
    "name": "acquire_resource_lock",
    "arguments": {
      "resource": "project-map:server.js",
      "expiresInMs": 300000,
      "metadata": {
        "reason": "Updating collaboration routes"
      }
    }
  }
}`
  },
  {
    id: "activity",
    title: "Read the live project activity stream",
    blurb:
      "This helps humans and agents see what changed recently before starting overlapping work.",
    language: "bash",
    filename: "fetch-activity.sh",
    code: `curl "http://localhost:4000/activity?project=local-mcp-server&limit=20"`
  },
  {
    id: "rest",
    title: "Read the project map through the API",
    blurb:
      "Useful for admin tooling, dashboards, or scripts that inspect the stored project structure.",
    language: "bash",
    filename: "fetch-project-map.sh",
    code: `curl "http://localhost:4000/project-map?project=local-mcp-server&limit=20"`
  },
  {
    id: "migrate",
    title: "Fix old project IDs",
    blurb:
      "Rewrite historical records that were stored under a generic workspace name such as vscode.",
    language: "bash",
    filename: "migrate-project-id.sh",
    code: `npm run migrate:project-id -- vscode local-mcp-server`
  }
];

shared.architectureFlow = [
  {
    title: "1. Editor or agent client",
    body:
      "A coding agent, editor integration, or custom MCP client sends JSON-RPC messages over stdio."
  },
  {
    title: "2. MCP transport",
    body:
      "mcp-server.js exposes tools, injects identity, waits for the API, and keeps stdout protocol-safe."
  },
  {
    title: "3. HTTP API layer",
    body:
      "server.js handles route validation, persistence, querying, ranking, logging, and indexing."
  },
  {
    title: "4. Persistence",
    body:
      "MongoDB stores contexts, versions, actions, sessions, agents, tasks, issues, messages, activity, resource locks, metrics, logs, and project-map entries."
  },
  {
    title: "5. Collaboration safety",
    body:
      "The activity stream, soft locks, expected-version checks, and task ownership boundaries help humans and agents work in parallel without silently colliding."
  },
  {
    title: "6. Reuse loop",
    body:
      "Future agents read tasks, messages, memory, and the project map before taking action."
  }
];

shared.publishSteps = [
  "Commit the docs folder to your default branch.",
  "Open GitHub repository settings and go to Pages.",
  "Set the source to “Deploy from a branch”.",
  "Choose your main branch and the `/docs` folder.",
  "Save, wait for the Pages build, and use the generated repository site URL.",
  "Whenever the docs change, push updates to the same branch and Pages will redeploy."
];

shared.troubleshooting = [
  "If memory entries are being saved under the wrong project, add a `.mcp-project` file or set `MCP_PROJECT` in the project `.env`.",
  "If the API is unreachable, verify that MongoDB is running and that `MONGO_URI` points to the correct database.",
  "If you see protocol issues, keep stdout reserved for JSON-RPC only and send logs to stderr or the database.",
  "If task coordination feels noisy, filter `fetch_tasks` by status or assignee and keep `send_message` focused on blockers, handoffs, and status.",
  "If search results look weak, confirm that the startup index creation step still runs before the API begins serving requests.",
  "If you receive collaboration warnings, inspect `fetch_activity`, `fetch_resource_locks`, and the relevant task assignment before forcing overlapping work.",
  "If a soft lock seems stuck, check the expiration time first; expired locks are cleaned automatically."
];

shared.faq = [
  {
    q: "Should I launch the server directly or use the shim?",
    a:
      "Use the shim for editor integrations and project-aware workflows. Launch the server directly when you are debugging the transport itself or building a custom client."
  },
  {
    q: "When should I use memory versus the project map?",
    a:
      "Use memory for durable decisions, patterns, constraints, and debugging context. Use the project map for structural knowledge about files, modules, ownership, relationships, and reusable codebase understanding."
  },
  {
    q: "Do all agents need unique names?",
    a:
      "Yes. Stable `MCP_AGENT` values make tasks, messages, and action logs much easier to reason about."
  },
  {
    q: "Can I run the API separately from the MCP transport?",
    a:
      "Yes. `server.js` can run as a standalone API, while `mcp-server.js` can connect to it using `MCP_SERVER_URL`."
  },
  {
    q: "Do soft locks block the user?",
    a:
      "No. They are warnings for safer collaboration, not hard blockers. The goal is visibility and coordination, not preventing human action."
  },
  {
    q: "How should I handle a concurrent-change warning?",
    a:
      "Treat it as meaningful system state. Review activity, check the related task and locks, and decide whether to re-read the resource, coordinate first, or continue with clear traceability."
  }
];

shared.showcase = {
  title: "Project showcase page",
  body:
    "A portfolio-style page for this project exists separately from the docs site. It works well as a narrative walkthrough and public-facing demonstration, while this docs site stays focused on installation, integration, and operational reference.",
  linkLabel: "Open repository",
  linkHref: "https://github.com/coderooz/Local-MCP-Memory-Server",
  note:
    "When your final website URL is ready, you can swap the link target without changing the docs layout."
};

const baseContent = {
  meta: {
    title: "Local MCP Memory Server Docs",
    description:
      "Detailed documentation for Local MCP Memory Server: installation, architecture, project descriptors, live activity tracking, human-plus-agent collaboration, soft locks, API reference, and production-ready examples.",
    keywords:
      "MCP, Model Context Protocol, memory server, multi-agent, MongoDB, task coordination, activity stream, soft locks, human agent collaboration, GitHub Pages documentation"
  },
  ui: {
    languageLabel: "Language",
    sidebarHeading: "On This Page",
    quickFactsHeading: "Quick Facts",
    copy: "Copy",
    copied: "Copied",
    technicalNote:
      "Command names, tool identifiers, and API paths stay in English so the docs remain copy-paste friendly across languages."
  },
  brandTagline: "Documentation for persistent memory and multi-agent coordination",
  nav: {
    overview: "Overview",
    collaboration: "Human + Agent Collaboration",
    quickstart: "Quick Start",
    setup: "Project Setup",
    integration: "Integration",
    tools: "Tool Reference",
    api: "API Reference",
    identity: "Project Identity",
    examples: "Examples",
    architecture: "Architecture",
    troubleshooting: "Troubleshooting",
    faq: "FAQ",
    publish: "Publish to GitHub Pages"
  },
  hero: {
    eyebrow: "Production-minded MCP Documentation",
    title: "Build, wire, and operate Local MCP Memory Server with confidence.",
    subtitle:
      "This documentation is written for people who want more than a quick install snippet. It walks through setup, editor integration, project descriptors, persistent memory, live activity tracking, soft-lock collaboration, task coordination, project-map usage, identity handling, examples, and practical operations so you can ship it without guesswork.",
    primaryCta: "Start with setup",
    primaryHref: "#setup",
    secondaryCta: "See examples",
    secondaryHref: "#examples",
    badges: [
      {
        title: "Persistent memory that survives sessions",
        body:
          "Store reusable context, decisions, constraints, and debugging knowledge in MongoDB-backed collections."
      },
      {
        title: "Coordination, not competition",
        body:
          "Tasks, agent registration, messages, and project-map entries help multiple agents build on each other’s progress."
      },
      {
        title: "Project-aware by design",
        body:
          "The shim and direct server can both derive or override project identity so one workspace does not pollute another."
      }
    ]
  },
  sections: {
    overview: {
      title: "What This Project Actually Does",
      intro:
        "Local MCP Memory Server is not just a note bucket for agents. It is a MongoDB-backed coordination layer for MCP clients that need durable memory, traceable actions, project-aware task flow, inter-agent messaging, structured project intelligence, and safe human-plus-agent parallel work.",
      cards: [
        {
          title: "Persistent memory",
          body:
            "Contexts are searchable, ranked, and scoped so useful knowledge can outlive a single chat or coding session."
        },
        {
          title: "Task-first collaboration",
          body:
            "Agents can create, assign, fetch, and update tasks before acting, which lowers duplicate work and makes handoffs explicit."
        },
        {
          title: "Live collaboration visibility",
          body:
            "The activity stream and soft locks give humans and agents a shared picture of who is working where right now."
        },
        {
          title: "Project map intelligence",
          body:
            "Instead of re-reading the codebase from scratch every time, agents can store and fetch structural summaries for files, folders, modules, and the project root."
        },
        {
          title: "Protocol-safe operations",
          body:
            "The transport keeps stdout reserved for JSON-RPC, while logging and persistence happen through the API and MongoDB."
        }
      ]
    },
    collaboration: {
      title: "Human + Agent Collaboration",
      intro:
        "The collaboration layer is designed to make parallel work visible and safer. It does not hard-block humans. Instead, it surfaces ownership, activity, locks, and overlap warnings early enough for people and agents to coordinate."
    },
    quickstart: {
      title: "Quick Start Without the Guesswork",
      intro:
        "If you want the shortest path to a working system, follow these steps first. You can come back to the deeper sections afterward.",
      steps: [
        "Install dependencies, create a `.env`, and make sure MongoDB is reachable.",
        "Start the API with `npm run start:api` or let the MCP transport auto-start it for you.",
        "Point your editor or MCP client at `mcp-shim.js` so project identity is handled automatically."
      ]
    },
    setup: {
      title: "Project Setup",
      intro:
        "This section covers the basics you need before integration: runtime requirements, environment variables, startup modes, and repository-specific details such as explicit project identity.",
      envNote:
        "You can keep the local folder name however you like. The project identity used for stored records is separate and should be pinned explicitly when you care about clean namespaces."
    },
    integration: {
      title: "Integration Patterns",
      intro:
        "The project supports more than one deployment shape. The right choice depends on whether you are wiring an editor plugin, a local CLI client, or a custom automation layer."
    },
    tools: {
      title: "Tool Reference",
      intro:
        "This is the MCP surface exposed to clients over JSON-RPC. Treat these as the contract your agents rely on."
    },
    api: {
      title: "API Reference",
      intro:
        "These are the HTTP routes behind the MCP transport. You can call them directly for dashboards, admin tools, or debugging workflows."
    },
    identity: {
      title: "Project Identity and Namespace Safety",
      intro:
        "Project identity is a real operational concern here. If two workspaces share the wrong project ID, they can mix tasks, messages, and project-map entries in confusing ways.",
      bullets: [
        "The preferred override order is `.mcp-project` or `.mcp-project.json`, then project `.env`, then package metadata, then the project-root folder name.",
        "Use `mcp-shim.js` when you want project detection to follow the working tree where the editor or agent is operating.",
        "Pin `MCP_PROJECT` explicitly for production or shared environments, especially if your editor launches from a generic parent workspace.",
        "If you already stored records under the wrong namespace, run the migration script before agents start depending on stale data."
      ],
      callout:
        "This repository pins its own identifier as `local-mcp-server`, even though the local folder name can be different on your machine."
    },
    examples: {
      title: "Examples You Can Reuse",
      intro:
        "These examples are intentionally practical. They mirror the actual code paths in the repository and show the most common real-world entry points."
    },
    architecture: {
      title: "Architecture Flow",
      intro:
        "The system is easier to reason about when you separate transport concerns from persistence concerns. That separation is one of the project’s strongest design choices."
    },
    troubleshooting: {
      title: "Troubleshooting",
      intro:
        "Most deployment pain points come from identity drift, MongoDB connectivity, or protocol contamination. Start there before assuming the logic is broken."
    },
    faq: {
      title: "Frequently Asked Questions",
      intro:
        "These are the questions that tend to come up once people move past the first successful install and start using the server in real workflows."
    },
    publish: {
      title: "Publish This Documentation on GitHub Pages",
      intro:
        "This docs site is already built to live inside the repository’s `docs/` folder, which makes GitHub Pages deployment straightforward."
    }
  },
  footer: {
    lineOne:
      "Local MCP Memory Server Docs are designed to be practical, reference-friendly, and readable by humans first.",
    lineTwo:
      "Update the content whenever the MCP surface, project identity rules, or API behavior changes."
  },
  showcase: {
    title: shared.showcase.title,
    body: shared.showcase.body,
    linkLabel: shared.showcase.linkLabel,
    note: shared.showcase.note
  }
};

const localeOverrides = {
  hi: {
    meta: {
      title: "Local MCP Memory Server दस्तावेज़",
      description:
        "Local MCP Memory Server के लिए विस्तृत दस्तावेज़: installation, setup, integration, tool reference, API reference, project identity, project map workflow और examples."
    },
    ui: {
      languageLabel: "भाषा",
      sidebarHeading: "इस पेज पर",
      quickFactsHeading: "त्वरित जानकारी",
      copy: "कॉपी करें",
      copied: "कॉपी हो गया"
    },
    brandTagline: "स्थायी memory और multi-agent coordination के लिए दस्तावेज़",
    nav: {
      overview: "परिचय",
      quickstart: "त्वरित शुरुआत",
      setup: "प्रोजेक्ट सेटअप",
      integration: "इंटीग्रेशन",
      tools: "टूल संदर्भ",
      api: "API संदर्भ",
      identity: "प्रोजेक्ट पहचान",
      examples: "उदाहरण",
      architecture: "आर्किटेक्चर",
      troubleshooting: "समस्या समाधान",
      faq: "सामान्य प्रश्न",
      publish: "GitHub Pages पर प्रकाशित करें"
    },
    hero: {
      eyebrow: "Production-ready MCP दस्तावेज़",
      title: "Local MCP Memory Server को भरोसे के साथ सेटअप, इंटीग्रेट और ऑपरेट करें।",
      subtitle:
        "यह दस्तावेज़ केवल एक छोटा install snippet नहीं है। इसमें setup, editor integration, persistent memory, task coordination, project map, project identity, examples और practical operations सब कुछ शामिल है।",
      primaryCta: "सेटअप से शुरू करें",
      secondaryCta: "उदाहरण देखें"
    },
    sections: {
      overview: {
        title: "यह प्रोजेक्ट वास्तव में क्या करता है",
        intro:
          "Local MCP Memory Server सिर्फ agent notes रखने का स्थान नहीं है। यह MCP clients के लिए एक MongoDB-backed coordination layer है, जिसमें durable memory, traceable actions, task flow, messaging और structured project intelligence शामिल है।"
      },
      quickstart: {
        title: "बिना उलझन के त्वरित शुरुआत",
        intro:
          "अगर आपको सबसे तेज़ working setup चाहिए, तो पहले यह flow अपनाएँ। उसके बाद आप गहरे sections पढ़ सकते हैं।"
      },
      setup: {
        title: "प्रोजेक्ट सेटअप",
        intro:
          "इस भाग में runtime requirements, environment variables, startup modes और explicit project identity जैसी जरूरी चीज़ें शामिल हैं।",
        envNote:
          "आपकी local folder name कुछ भी हो सकती है। MongoDB में जो project namespace जाएगा, उसे अलग से pin करना बेहतर है।"
      },
      identity: {
        title: "प्रोजेक्ट पहचान और namespace सुरक्षा",
        callout:
          "यह repository अपनी पहचान `local-mcp-server` पर pin करती है, चाहे आपके सिस्टम पर folder का नाम कुछ भी हो।"
      }
    },
    footer: {
      lineOne:
        "यह दस्तावेज़ reference-friendly होने के साथ-साथ पढ़ने में भी सहज बनाया गया है।",
      lineTwo:
        "जब भी MCP surface, identity rules या API behavior बदले, docs को भी अपडेट करें।"
    }
  },
  es: {
    meta: { title: "Documentación de Local MCP Memory Server" },
    ui: {
      languageLabel: "Idioma",
      sidebarHeading: "En esta página",
      quickFactsHeading: "Resumen rápido",
      copy: "Copiar",
      copied: "Copiado"
    },
    brandTagline: "Documentación para memoria persistente y coordinación multiagente",
    nav: {
      overview: "Resumen",
      quickstart: "Inicio rápido",
      setup: "Configuración",
      integration: "Integración",
      tools: "Herramientas",
      api: "Referencia API",
      identity: "Identidad del proyecto",
      examples: "Ejemplos",
      architecture: "Arquitectura",
      troubleshooting: "Solución de problemas",
      faq: "Preguntas frecuentes",
      publish: "Publicar en GitHub Pages"
    },
    hero: {
      eyebrow: "Documentación MCP lista para producción",
      title: "Instala, integra y opera Local MCP Memory Server con claridad.",
      primaryCta: "Ir a configuración",
      secondaryCta: "Ver ejemplos"
    },
    sections: {
      overview: { title: "Qué hace realmente este proyecto" },
      setup: { title: "Configuración del proyecto" },
      identity: {
        title: "Identidad del proyecto y seguridad del namespace",
        callout:
          "Este repositorio fija su identificador como `local-mcp-server`, aunque la carpeta local tenga otro nombre."
      },
      publish: { title: "Publica esta documentación en GitHub Pages" }
    },
    showcase: {
      title: "Página de presentación del proyecto",
      linkLabel: "Abrir repositorio",
      note:
        "Cuando tengas la URL final del sitio, puedes cambiar el enlace sin alterar el diseño de la documentación."
    }
  },
  ru: {
    meta: { title: "Документация Local MCP Memory Server" },
    ui: {
      languageLabel: "Язык",
      sidebarHeading: "На этой странице",
      quickFactsHeading: "Кратко",
      copy: "Копировать",
      copied: "Скопировано"
    },
    brandTagline: "Документация для постоянной памяти и координации нескольких агентов",
    nav: {
      overview: "Обзор",
      quickstart: "Быстрый старт",
      setup: "Настройка проекта",
      integration: "Интеграция",
      tools: "Справочник инструментов",
      api: "Справочник API",
      identity: "Идентификация проекта",
      examples: "Примеры",
      architecture: "Архитектура",
      troubleshooting: "Устранение проблем",
      faq: "FAQ",
      publish: "Публикация на GitHub Pages"
    },
    hero: {
      eyebrow: "Готовая к продакшену документация MCP",
      title: "Настройте, подключите и используйте Local MCP Memory Server без лишней путаницы."
    },
    sections: {
      overview: { title: "Что на самом деле делает проект" },
      setup: { title: "Настройка проекта" },
      identity: {
        title: "Идентификация проекта и безопасность namespace",
        callout:
          "Этот репозиторий закрепляет свой идентификатор как `local-mcp-server`, даже если локальная папка называется иначе."
      },
      publish: { title: "Публикация документации на GitHub Pages" }
    },
    showcase: {
      title: "Витринная страница проекта",
      linkLabel: "Открыть репозиторий",
      note:
        "Когда у вас будет финальный URL сайта, можно просто заменить ссылку, не меняя дизайн документации."
    }
  },
  fr: {
    meta: { title: "Documentation Local MCP Memory Server" },
    ui: {
      languageLabel: "Langue",
      sidebarHeading: "Sur cette page",
      quickFactsHeading: "Repères rapides",
      copy: "Copier",
      copied: "Copié"
    },
    brandTagline: "Documentation pour mémoire persistante et coordination multi-agents",
    nav: {
      overview: "Vue d’ensemble",
      quickstart: "Démarrage rapide",
      setup: "Configuration",
      integration: "Intégration",
      tools: "Outils",
      api: "Référence API",
      identity: "Identité du projet",
      examples: "Exemples",
      architecture: "Architecture",
      troubleshooting: "Dépannage",
      faq: "FAQ",
      publish: "Publier sur GitHub Pages"
    },
    sections: {
      overview: { title: "Ce que fait réellement le projet" },
      setup: { title: "Configuration du projet" },
      identity: {
        title: "Identité du projet",
        callout:
          "Ce dépôt fixe son identifiant sur `local-mcp-server`, même si votre dossier local porte un autre nom."
      },
      publish: { title: "Publier cette documentation sur GitHub Pages" }
    },
    showcase: {
      title: "Page vitrine du projet",
      linkLabel: "Ouvrir le dépôt"
    }
  },
  de: {
    meta: { title: "Local MCP Memory Server Dokumentation" },
    ui: {
      languageLabel: "Sprache",
      sidebarHeading: "Auf dieser Seite",
      quickFactsHeading: "Kurzüberblick",
      copy: "Kopieren",
      copied: "Kopiert"
    },
    brandTagline: "Dokumentation für persistente Memory- und Multi-Agent-Koordination",
    nav: {
      overview: "Überblick",
      quickstart: "Schnellstart",
      setup: "Projekt-Setup",
      integration: "Integration",
      tools: "Tool-Referenz",
      api: "API-Referenz",
      identity: "Projektidentität",
      examples: "Beispiele",
      architecture: "Architektur",
      troubleshooting: "Fehlerbehebung",
      faq: "FAQ",
      publish: "Auf GitHub Pages veröffentlichen"
    },
    sections: {
      overview: { title: "Was dieses Projekt wirklich leistet" },
      setup: { title: "Projekt-Setup" },
      identity: {
        title: "Projektidentität und Namespace-Sicherheit",
        callout:
          "Dieses Repository fixiert seine Kennung auf `local-mcp-server`, auch wenn der lokale Ordner anders heißt."
      }
    },
    showcase: {
      title: "Projekt-Showcase-Seite",
      linkLabel: "Repository öffnen"
    }
  },
  pt: {
    meta: { title: "Documentação do Local MCP Memory Server" },
    ui: {
      languageLabel: "Idioma",
      sidebarHeading: "Nesta página",
      quickFactsHeading: "Resumo rápido",
      copy: "Copiar",
      copied: "Copiado"
    },
    brandTagline: "Documentação para memória persistente e coordenação multiagente",
    nav: {
      overview: "Visão geral",
      quickstart: "Início rápido",
      setup: "Configuração",
      integration: "Integração",
      tools: "Ferramentas",
      api: "Referência API",
      identity: "Identidade do projeto",
      examples: "Exemplos",
      architecture: "Arquitetura",
      troubleshooting: "Solução de problemas",
      faq: "FAQ",
      publish: "Publicar no GitHub Pages"
    },
    sections: {
      overview: { title: "O que este projeto realmente faz" },
      setup: { title: "Configuração do projeto" },
      identity: {
        title: "Identidade do projeto e segurança do namespace",
        callout:
          "Este repositório fixa seu identificador como `local-mcp-server`, mesmo que a pasta local tenha outro nome."
      }
    },
    showcase: {
      title: "Página de apresentação do projeto",
      linkLabel: "Abrir repositório"
    }
  },
  zh: {
    meta: { title: "Local MCP Memory Server 文档" },
    ui: {
      languageLabel: "语言",
      sidebarHeading: "本页内容",
      quickFactsHeading: "快速信息",
      copy: "复制",
      copied: "已复制"
    },
    brandTagline: "面向持久化记忆与多代理协作的文档",
    nav: {
      overview: "概览",
      quickstart: "快速开始",
      setup: "项目配置",
      integration: "集成方式",
      tools: "工具参考",
      api: "API 参考",
      identity: "项目标识",
      examples: "示例",
      architecture: "架构",
      troubleshooting: "问题排查",
      faq: "常见问题",
      publish: "发布到 GitHub Pages"
    },
    sections: {
      overview: { title: "这个项目真正解决了什么问题" },
      setup: { title: "项目配置" },
      identity: {
        title: "项目标识与命名空间安全",
        callout:
          "这个仓库把自己的标识固定为 `local-mcp-server`，即使你本地目录名不同也没关系。"
      }
    },
    showcase: {
      title: "项目展示页面",
      linkLabel: "打开仓库"
    }
  },
  ja: {
    meta: { title: "Local MCP Memory Server ドキュメント" },
    ui: {
      languageLabel: "言語",
      sidebarHeading: "このページ",
      quickFactsHeading: "クイック情報",
      copy: "コピー",
      copied: "コピーしました"
    },
    brandTagline: "永続メモリとマルチエージェント協調のためのドキュメント",
    nav: {
      overview: "概要",
      quickstart: "クイックスタート",
      setup: "セットアップ",
      integration: "統合方法",
      tools: "ツールリファレンス",
      api: "API リファレンス",
      identity: "プロジェクト識別",
      examples: "例",
      architecture: "アーキテクチャ",
      troubleshooting: "トラブルシューティング",
      faq: "FAQ",
      publish: "GitHub Pages へ公開"
    },
    sections: {
      overview: { title: "このプロジェクトが本当に提供するもの" },
      setup: { title: "プロジェクト設定" },
      identity: {
        title: "プロジェクト識別と namespace の安全性",
        callout:
          "このリポジトリはローカルフォルダ名に関係なく `local-mcp-server` を識別子として固定します。"
      }
    },
    showcase: {
      title: "プロジェクト紹介ページ",
      linkLabel: "リポジトリを開く"
    }
  },
  ar: {
    meta: { title: "توثيق Local MCP Memory Server" },
    ui: {
      languageLabel: "اللغة",
      sidebarHeading: "في هذه الصفحة",
      quickFactsHeading: "معلومات سريعة",
      copy: "نسخ",
      copied: "تم النسخ"
    },
    brandTagline: "توثيق للذاكرة الدائمة وتنسيق الوكلاء المتعددين",
    nav: {
      overview: "نظرة عامة",
      quickstart: "بدء سريع",
      setup: "إعداد المشروع",
      integration: "التكامل",
      tools: "مرجع الأدوات",
      api: "مرجع API",
      identity: "هوية المشروع",
      examples: "أمثلة",
      architecture: "المعمارية",
      troubleshooting: "استكشاف الأخطاء",
      faq: "الأسئلة الشائعة",
      publish: "النشر على GitHub Pages"
    },
    sections: {
      overview: { title: "ما الذي يفعله هذا المشروع فعلياً" },
      setup: { title: "إعداد المشروع" },
      identity: {
        title: "هوية المشروع وأمان النطاق",
        callout:
          "هذا المستودع يثبت معرّفه على `local-mcp-server` حتى لو كان اسم المجلد المحلي مختلفاً."
      }
    },
    showcase: {
      title: "صفحة عرض المشروع",
      linkLabel: "افتح المستودع"
    }
  }
};

function isObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function deepMerge(base, override) {
  if (!isObject(base) || !isObject(override)) {
    return override === undefined ? base : override;
  }

  const result = { ...base };

  for (const [key, value] of Object.entries(override)) {
    result[key] = Array.isArray(value) ? value : deepMerge(base[key], value);
  }

  return result;
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function getLanguageFromBrowser() {
  const browser = (navigator.language || "en").toLowerCase();
  const exact = languages.find((entry) => entry.code === browser);
  if (exact) return exact.code;
  const prefix = browser.split("-")[0];
  const prefixed = languages.find((entry) => entry.code === prefix);
  return prefixed ? prefixed.code : "en";
}

function getContent(language) {
  return deepMerge(baseContent, localeOverrides[language] || {});
}

function updateMeta(content, language) {
  document.documentElement.lang = language;
  document.documentElement.dir = language === "ar" ? "rtl" : "ltr";
  document.title = content.meta.title;

  const setMeta = (selector, value) => {
    const element = document.querySelector(selector);
    if (element) {
      element.setAttribute("content", value);
    }
  };

  setMeta('meta[name="description"]', content.meta.description || baseContent.meta.description);
  setMeta('meta[name="keywords"]', content.meta.keywords || baseContent.meta.keywords);
  setMeta('meta[property="og:title"]', content.meta.title);
  setMeta('meta[property="og:description"]', content.meta.description || baseContent.meta.description);
  setMeta('meta[name="twitter:title"]', content.meta.title);
  setMeta('meta[name="twitter:description"]', content.meta.description || baseContent.meta.description);
}

function sectionHeader(id, title, intro) {
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

function renderHero(content) {
  document.getElementById("hero").innerHTML = `
    <div class="hero-grid">
      <div>
        <span class="eyebrow">${content.hero.eyebrow}</span>
        <h1 class="hero-title">${content.hero.title}</h1>
        <p class="hero-subtitle">${content.hero.subtitle}</p>
        <div class="hero-actions">
          <a class="primary" href="${content.hero.primaryHref}">${content.hero.primaryCta}</a>
          <a class="secondary" href="${content.hero.secondaryHref}">${content.hero.secondaryCta}</a>
        </div>
        <div class="pill-row">
          <span class="pill">GitHub Pages-ready</span>
          <span class="pill">Multilingual UI</span>
          <span class="pill">Real code examples</span>
        </div>
      </div>
      <div class="hero-badges">
        ${content.hero.badges
          .map(
            (badge) => `
              <article class="hero-badge">
                <strong>${badge.title}</strong>
                <span>${badge.body}</span>
              </article>
            `
          )
          .join("")}
      </div>
    </div>
  `;
}

function renderQuickFacts(content) {
  document.getElementById("quick-facts").innerHTML = `
    <p class="sidebar-eyebrow">${content.ui.quickFactsHeading}</p>
    <div class="fact-list">
      ${shared.facts
        .map(
          (fact) => `
            <article class="stat-card">
              <strong>${fact.label}</strong>
              <span>${fact.value}</span>
            </article>
          `
        )
        .join("")}
    </div>
  `;
}

function renderSimpleSection(id, content, body) {
  document.getElementById(id).innerHTML = `${sectionHeader(
    id,
    content.sections[id].title,
    content.sections[id].intro
  )}${body}`;
}

function renderReferenceGroups(targetId, content, groups, note) {
  renderSimpleSection(
    targetId,
    content,
    `
      ${note ? `<div class="callout">${note}</div>` : ""}
      <div class="reference-grid">
        ${groups
          .map(
            (group) => `
              <article class="reference-card">
                <h3>${group.name}</h3>
                <ul class="bullets">
                  ${group.items
                    .map(
                      ([name, description]) => `
                        <li><strong><code>${name}</code></strong><br />${description}</li>
                      `
                    )
                    .join("")}
                </ul>
              </article>
            `
          )
          .join("")}
      </div>
    `
  );
}

function render(content) {
  updateMeta(content, currentLanguage);
  document.getElementById("brand-tagline").textContent = content.brandTagline;
  document.getElementById("language-label").textContent = content.ui.languageLabel;
  document.getElementById("sidebar-heading").textContent = content.ui.sidebarHeading;

  renderHero(content);
  renderQuickFacts(content);
  document.getElementById("toc").innerHTML = sectionIds
    .map((id) => `<a href="#${id}" data-section-link="${id}">${content.nav[id]}</a>`)
    .join("");

  document.getElementById("overview").innerHTML = `
    ${sectionHeader("overview", content.sections.overview.title, content.sections.overview.intro)}
    <div class="highlight-grid">
      ${content.sections.overview.cards
        .map(
          (card) => `
            <article class="info-card">
              <h3>${card.title}</h3>
              <p>${card.body}</p>
            </article>
          `
        )
        .join("")}
    </div>
    <div class="callout">
      <strong>${content.showcase.title}</strong><br />
      ${content.showcase.body}
      <div class="hero-actions" style="margin-top: 0.9rem;">
        <a class="secondary" href="${shared.showcase.linkHref}" target="_blank" rel="noreferrer">${content.showcase.linkLabel}</a>
      </div>
      <p class="mini-note">${content.showcase.note}</p>
    </div>
  `;

  renderSimpleSection(
    "collaboration",
    content,
    `<div class="card-grid">
      <article class="info-card"><h3>Project descriptor first</h3><p>Agents should use the project descriptor as baseline context before making architectural assumptions or coordination decisions.</p></article>
      <article class="info-card"><h3>Live activity stream</h3><p>The activity feed provides near-real-time visibility into decisions, task changes, and coordination events so humans and agents can see what just happened.</p></article>
      <article class="info-card"><h3>Soft locks, not hard blockers</h3><p>Locks warn about contested resources such as files, modules, or tasks. They are meant to reduce overlap without preventing human action.</p></article>
      <article class="info-card"><h3>Concurrent change warnings</h3><p>Updates can compare expected versions or timestamps and surface warnings when the resource changed since the caller last read it.</p></article>
    </div>`
  );

  renderSimpleSection(
    "quickstart",
    content,
    `<ol class="numbered">${content.sections.quickstart.steps
      .map((step) => `<li>${step}</li>`)
      .join("")}</ol>`
  );

  document.getElementById("setup").innerHTML = `
    ${sectionHeader("setup", content.sections.setup.title, content.sections.setup.intro)}
    <div class="card-grid">
      <article class="info-card">
        <h3>Prerequisites</h3>
        <ul class="bullets">${shared.prerequisites.map((item) => `<li>${item}</li>`).join("")}</ul>
      </article>
      <article class="info-card">
        <h3>Startup modes</h3>
        <ul class="bullets">
          ${shared.startupModes
            .map((mode) => `<li><strong>${mode.title}</strong><br />${mode.detail}<br /><code>${mode.code}</code></li>`)
            .join("")}
        </ul>
      </article>
    </div>
    <div class="callout">${content.sections.setup.envNote}</div>
    <div class="data-table-wrap">
      <table class="data-table">
        <thead>
          <tr><th>Variable</th><th>Required</th><th>Default</th><th>Purpose</th></tr>
        </thead>
        <tbody>
          ${shared.envRows
            .map(
              (row) => `
                <tr>
                  <td><code>${row.variable}</code></td>
                  <td>${row.required}</td>
                  <td>${row.defaultValue}</td>
                  <td>${row.purpose}</td>
                </tr>
              `
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;

  renderSimpleSection(
    "integration",
    content,
    `<div class="card-grid">
      <article class="info-card"><h3>Use the shim for editor integrations</h3><p>The shim is the safest default because it resolves project identity from the repository root, injects project scope, and forwards stdio cleanly to the MCP transport.</p></article>
      <article class="info-card"><h3>Use direct transport for debugging</h3><p>Run <code>mcp-server.js</code> directly when you are testing the protocol layer, writing a custom client, or debugging transport-specific behavior.</p></article>
      <article class="info-card"><h3>Run the API separately when needed</h3><p>If you want observability, route testing, or admin tooling, run <code>server.js</code> as its own process and point the transport to it with <code>MCP_SERVER_URL</code>.</p></article>
      <article class="info-card"><h3>Seed knowledge early</h3><p>Use the bootstrap document, task creation, and project-map entries early in a new project so future agents inherit context instead of rebuilding it.</p></article>
    </div>`
  );

  renderReferenceGroups("tools", content, shared.toolGroups, content.ui.technicalNote);
  renderReferenceGroups("api", content, shared.apiGroups, content.ui.technicalNote);

  renderSimpleSection(
    "identity",
    content,
    `<ul class="bullets">${content.sections.identity.bullets
      .map((item) => `<li>${item}</li>`)
      .join("")}</ul>
     <div class="callout">${content.sections.identity.callout}</div>`
  );

  renderSimpleSection(
    "examples",
    content,
    `<div class="example-grid">
      ${shared.examples
        .map(
          (example) => `
            <article class="example-card">
              <h3>${example.title}</h3>
              <p>${example.blurb}</p>
              <div class="code-shell">
                <div class="code-topbar">
                  <div class="code-meta"><strong>${example.filename}</strong><span>${example.language}</span></div>
                  <button class="copy-button" data-copy="${escapeHtml(example.code)}">${content.ui.copy}</button>
                </div>
                <pre><code>${escapeHtml(example.code)}</code></pre>
              </div>
            </article>
          `
        )
        .join("")}
    </div>`
  );

  renderSimpleSection(
    "architecture",
    content,
    `<div class="card-grid">
      ${shared.architectureFlow
        .map((step) => `<article class="info-card"><h3>${step.title}</h3><p>${step.body}</p></article>`)
        .join("")}
    </div>`
  );

  renderSimpleSection(
    "troubleshooting",
    content,
    `<ul class="bullets">${shared.troubleshooting.map((item) => `<li>${item}</li>`).join("")}</ul>`
  );

  renderSimpleSection(
    "faq",
    content,
    `<div class="faq-grid">
      ${shared.faq
        .map((item) => `<article class="faq-card"><h3>${item.q}</h3><p>${item.a}</p></article>`)
        .join("")}
    </div>`
  );

  renderSimpleSection(
    "publish",
    content,
    `<div class="publish-grid">
      <article class="publish-card"><h3>GitHub Pages path</h3><p>This site is designed to be served directly from the repository <code>docs/</code> folder.</p></article>
      <article class="publish-card"><h3>Deployment steps</h3><ol class="numbered">${shared.publishSteps
        .map((step) => `<li>${step}</li>`)
        .join("")}</ol></article>
    </div>`
  );

  document.getElementById("footer").innerHTML = `
    <p>${content.footer.lineOne}</p>
    <p>${content.footer.lineTwo}</p>
  `;

  document.querySelectorAll("[data-copy]").forEach((button) => {
    button.addEventListener("click", async () => {
      const decoded = button.getAttribute("data-copy")
        .replaceAll("&lt;", "<")
        .replaceAll("&gt;", ">")
        .replaceAll("&amp;", "&");
      try {
        await navigator.clipboard.writeText(decoded);
        const original = button.textContent;
        button.textContent = content.ui.copied;
        setTimeout(() => { button.textContent = original; }, 1200);
      } catch {}
    });
  });
}

let currentLanguage = localStorage.getItem(STORAGE_KEY) || getLanguageFromBrowser() || "en";

const select = document.getElementById("language-select");
select.innerHTML = languages
  .map((language) => `<option value="${language.code}">${language.label}</option>`)
  .join("");
select.value = currentLanguage;
select.addEventListener("change", () => {
  currentLanguage = select.value;
  localStorage.setItem(STORAGE_KEY, currentLanguage);
  render(getContent(currentLanguage));
});

render(getContent(currentLanguage));
