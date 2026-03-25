# Local MCP Memory Server

A **distributed multi-agent memory system** built on the **Model Context Protocol (MCP)**.

This project transforms MCP from a simple memory layer into a **coordinated system platform** with:

- 🧠 Persistent memory
- 🤖 Agent coordination
- 📋 Task management
- 💬 Inter-agent messaging
- 🗺 Project structure intelligence

---

![GitHub stars](https://img.shields.io/github/stars/coderooz/Local-MCP-Memory-Server)
![Issues](https://img.shields.io/github/issues/coderooz/Local-MCP-Memory-Server)
![License](https://img.shields.io/github/license/coderooz/Local-MCP-Memory-Server)

---

## 🚀 Overview

This system enables AI agents to:

- Remember across sessions
- Coordinate work via tasks
- Communicate through messages
- Understand project structure
- Share persistent knowledge

👉 This is no longer just a memory server —  
it is a **multi-agent coordination infrastructure**.

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

````

---

## 🧩 Core System Components

### 🧠 Memory System
- Persistent knowledge storage
- Searchable, ranked context
- Cross-agent reuse

---

### 📋 Task System
- Work coordination between agents
- Task lifecycle:
  - pending → in_progress → completed / blocked
- Prevents duplication of work

---

### 💬 Messaging System
- Agent-to-agent communication
- Used for:
  - coordination
  - handoffs
  - updates
  - blockers

---

### 🤖 Agent System
- Register and track agents
- Maintain system awareness
- Enables distributed execution

---

### 🗺 Project Map System
- Persistent representation of codebase structure
- Tracks:
  - dependencies
  - relationships
  - architecture patterns
- Enables system-level reasoning

---

## 📦 Key Files

| File | Description |
|------|------------|
| `mcp-server.js` | MCP stdio server (JSON-RPC tools layer) |
| `server.js` | Express API + system orchestration |
| `mcp.model.js` | Models: Memory, Task, Agent, Message, ProjectMap |
| `mcp-shim.js` | Auto project detection + environment injection |
| `utils/routeHandler.js` | Unified route abstraction |
| `agent-instruction.js` | System-level agent execution contract |

---

## 🧰 MCP Tools

### 🧠 Memory Tools
| Tool | Description |
|------|------------|
| `store_context` | Store reusable knowledge |
| `search_context` | Retrieve memory |
| `get_full_context` | Detailed memory view |
| `get_logs` | Debug logs |

---

### 📋 Task Tools
| Tool | Description |
|------|------------|
| `create_task` | Create task |
| `fetch_tasks` | Get tasks |
| *(API)* `/task/assign` | Assign task |

---

### 💬 Messaging Tools
| Tool | Description |
|------|------------|
| `send_message` | Send message |
| `request_messages` | Fetch messages |

---

### 🤖 Agent Tools
| Tool | Description |
|------|------------|
| `register_agent` | Register agent |
| `list_agents` | List agents |

---

### ⚙️ System Tools
| Tool | Description |
|------|------------|
| `get_agent_instructions` | Fetch execution rules |

---

## ⚙️ Setup

### 1. Install

```bash
npm install
````

---

### 2. Environment

Create `.env`:

```env
MONGO_URI=mongodb://localhost:27017/mcp_memory
PORT=4000

MCP_AGENT=codex
MCP_SERVER_URL=http://localhost:4000
```

---

### 3. Run

#### API Server

```bash
npm run start:api
```

#### MCP Server

```bash
npm start
```

---

## 🤖 Agent Integration

Use:

```
mcp-shim.js
```

### Benefits:

* Automatic project detection
* Zero per-project config
* Clean multi-project isolation

---

## 🧠 Execution Model (v2)

Agents must follow:

```
Memory → Tasks → Messages → Decision → Action → Persistence
```

System state takes priority over:

```
user request > memory > system state
```

---

## 🔍 Search System

Ranking based on:

* relevance
* importance
* recency
* access frequency

---

## 🧾 Logging

* Stored in MongoDB (`logs`)
* Accessible via MCP
* Errors auto-promoted to memory

---

## ⚠️ Critical Rules

### MCP Protocol

* ❌ No stdout logs
* ✅ stdout = JSON-RPC only
* ✅ logs → stderr / DB

---

### System Rules

* Do NOT skip task checks
* Do NOT duplicate work
* Always check messages before acting
* Memory ≠ source of truth (tasks are)

---

## 🧠 Use Cases

* Multi-agent AI systems
* Autonomous coding agents
* Persistent debugging systems
* Research simulations
* Collaborative AI workflows

---

## 📈 Evolution

### v1

```
Memory server
```

### v2

```
Multi-agent system platform
```

---

## 🚀 Future Roadmap

* Semantic (vector) search
* Conflict detection
* Auto task assignment
* Self-healing system
* Agent learning loops

---

## 🤝 Contributing

We welcome contributions in:

* MCP tooling
* AI agent systems
* distributed coordination
* memory systems

---

## 👨‍💻 Author

**Ranit Saha (Coderooz)**
🌐 [https://www.coderooz.in](https://www.coderooz.in)

---

## 📄 License

MIT License

---

## 🧠 Final Note

This system evolves AI from:

```
stateless tool
```

into:

```
coordinated, memory-driven system
```

Use it as **infrastructure — not just a library**.
