# Local MCP Memory Server

A **persistent, multi-agent memory system** built on the **Model Context Protocol (MCP)**, designed to give AI agents long-term memory, shared context, and structured learning across projects.

![GitHub stars](https://img.shields.io/github/stars/coderooz/Local-MCP-Memory-Server)
![Issues](https://img.shields.io/github/issues/coderooz/Local-MCP-Memory-Server)
![License](https://img.shields.io/github/license/coderooz/Local-MCP-Memory-Server)
---

## 🚀 Overview

This project provides a **fully functional MCP server** backed by **MongoDB**, enabling:

* 🧠 Persistent memory across sessions
* 🤖 Multi-agent collaboration (Codex, Roo, etc.)
* 📁 Project-aware context separation
* 🔍 Intelligent memory search and ranking
* 📝 Action tracking and logging
* ⚙️ Automatic project detection via shim

This is not just a storage layer — it is a **memory infrastructure for evolving AI systems**.

---

## 🧠 Architecture

```
Agent (Codex / Roo / Others)
        ↓
   MCP Server (stdio, JSON-RPC)
        ↓
   HTTP API (Express)
        ↓
   MongoDB (Persistence Layer)
```

### Key Components

* **`mcp-server.js`**

  * MCP stdio server (JSON-RPC)
  * Handles tool calls
  * Ensures protocol-safe communication

* **`server.js`**

  * Express-based HTTP API
  * MongoDB integration
  * Handles persistence, search, and logging

* **`mcp.model.js`**

  * Defines memory models:

    * Context
    * Action
    * Session
  * Includes query builder + normalization

* **`logger.js`**

  * Central logging system
  * Stores logs + converts critical errors into memory

* **`startMemoryServer.js`**

  * Ensures API server starts once (in-process)

* **`mcp-shim.js`**

  * Automatically derives:

    * `MCP_PROJECT` from folder name
    * `MCP_SCOPE = project`
  * Enables **global config, zero per-project setup**

---

## 🧰 MCP Tools

The server exposes the following tools:

| Tool                     | Description                                    |
| ------------------------ | ---------------------------------------------- |
| `store_context`          | Store reusable memory (decisions, rules, bugs) |
| `search_context`         | Retrieve relevant past memory                  |
| `log_action`             | Record meaningful changes or work              |
| `get_full_context`       | Retrieve context with related actions          |
| `start_session`          | Track multi-step work sessions                 |
| `get_agent_instructions` | Fetch canonical agent behavior rules           |
| `get_logs`               | Retrieve system logs for debugging             |

---

## ⚙️ Setup

### 1. Install Dependencies

```bash
npm install
```

---

### 2. Configure Environment

Create a `.env` file:

```env
MONGO_URI=mongodb://localhost:27017/mcp_memory
PORT=4000

# Optional
MCP_AGENT=codex
MCP_SERVER_URL=http://localhost:4000
```

---

### 3. Start the Server

#### Start API (Express + MongoDB)

```bash
npm run start:api
```

#### Start MCP Server (for agents)

```bash
npm start
```

---

## 🤖 Agent Integration

### ✅ Recommended (Global Setup)

Configure your agent (Codex / Roo) to use:

```
mcp-shim.js
```

This enables:

* Automatic project detection
* No per-project config required
* Clean multi-project memory separation

---

### Example (Conceptual)

```json
{
  "memory": {
    "command": "node",
    "args": ["path/to/mcp-shim.js"],
    "env": {
      "MCP_AGENT": "codex",
      "MCP_SERVER_URL": "http://localhost:4000"
    }
  }
}
```

---

## 🧠 Memory Model

### Context

Stores reusable knowledge:

* Architecture decisions
* Rules and constraints
* Bug fixes
* Patterns

---

### Action

Tracks changes:

* File updates
* Fixes
* Feature additions

---

### Session

Tracks work lifecycle:

* Multi-step tasks
* Ongoing work
* Status tracking

---

## 🔍 Search System

Memory search uses:

* MongoDB text index
* Ranking based on:

  * keyword match
  * importance
  * recency
  * access frequency

---

## 🧾 Logging System

Logs are:

* Stored in MongoDB (`logs` collection)
* Accessible via `get_logs`
* Automatically created for:

  * errors
  * important events

Critical errors are also converted into **memory entries**.

---

## ⚠️ Important Design Rules

### MCP Protocol Safety

* ❌ Do NOT write logs to stdout
* ✅ stdout = JSON-RPC only
* ✅ logs → stderr or database

---

### Memory Quality

Only store:

* reusable knowledge
* important decisions
* non-obvious fixes

Avoid:

* noise
* temporary thoughts
* large raw logs

---

### Environment Consistency

Memory identity depends on:

* `MCP_AGENT`
* `MCP_PROJECT`
* `MCP_SCOPE`

Incorrect configuration leads to:

* mixed agent data
* incorrect project attribution

---

## 🧪 Validation

Run:

```bash
npm test
```

This checks all core files for syntax validity.

---

## 📁 Project-Aware Behavior (Key Feature)

With `mcp-shim.js`:

* Project name is derived automatically
* Example:

```
C:\Projects\mycelium-growth → MCP_PROJECT=mycelium-growth
```

No need for per-project config.

---

## 🧠 Use Cases

* AI agents with long-term memory
* Multi-agent collaboration systems
* Self-improving code generation systems
* Debugging systems with memory of past failures
* Research simulations (like mycelium growth)

---

## 🚀 Future Improvements

* Vector embeddings for semantic search
* Memory importance auto-scoring
* Conflict resolution system
* Self-healing server (auto-restart + health checks)
* Agent feedback loops

---

## 🤝 Contributing

We welcome contributions!

If you're interested in:
- AI systems
- MCP / agent tooling
- distributed memory systems

👉 Check issues or open a discussion

---

## 👨‍💻 Author

**Ranit Saha (Coderooz)**
🌐 https://www.coderooz.in

---

## 📄 License

MIT License

---

## 🧠 Final Note

This system transforms AI from:

```
stateless responder
```

into:

```
persistent, learning collaborator
```

Use it as infrastructure — not just a tool.
