# Authoritative MCP Tool Inventory (v2.6.0)

**Inventory Date:** 2026-11-06  
**Project:** `local-mcp-memory`  

---

## 1. Tool Category Breakdown

The v2.6.0 MCP server provides a comprehensive suite of tools organized across 9 functional categories:

| Category | Tool Count | Primary Responsibilities |
|---|---|---|
| **Memory & Context** | 8 | Persistent storage, semantic/full-text search, versioning, context connection |
| **Project & Coordination** | 4 | Project maps, descriptors, activity streams, coordination |
| **Task Management** | 4 | Task creation, assignment, status tracking, idempotency |
| **Issue Tracking** | 3 | Issue creation, resolution, filtering |
| **Agent Presence & Messaging** | 5 | Agent registration, heartbeats, presence listing, direct messaging |
| **Resource Soft Locks** | 3 | Acquiring, releasing, and inspecting resource soft locks |
| **Multi-Agent Chat** | 7 | Chat room creation, message history, pinning, search |
| **Feedback System** | 5 | Feedback submission, voting, severity triage, resolution |
| **MCP Server Registry** | 9 | Upstream MCP registration, health checks, discovery, proxying |
| **Browser Automation & System** | 16 | Playwright automation, cookies, DOM inspection, audio alert |
| **Execution Sandbox (Gated)** | 6 | Script submission, job status, auditing (fail-closed Phase 1) |

---

## 2. Complete Tool Inventory List

### 2.1 Memory & Context Tools (8 tools)
1. `store_context` — Store persistent memory such as architecture decisions, rules, or notes.
2. `search_context` — Search stored memories using keywords or semantic query.
3. `get_full_context` — Retrieve the complete context record by ID.
4. `update_context` — Update existing memory record with version tracking.
5. `get_connected_context` — Query connected or related contexts based on metadata.
6. `optimize_memory` — Prune or optimize memory indexes and versions.
7. `set_project_descriptor` — Set persistent metadata descriptor for a project.
8. `get_project_descriptor` — Fetch project architecture and metadata descriptor.

### 2.2 Project & Coordination Tools (4 tools)
9. `create_project_map` — Store high-level architectural map for a project.
10. `fetch_project_map` — Retrieve project architecture map.
11. `record_activity` — Record activity event for multi-agent timelines.
12. `fetch_activity` — Query chronological activity events.

### 2.3 Task Management Tools (4 tools)
13. `create_task` — Create a new tracked task with idempotency key.
14. `assign_task` — Assign an existing task to an agent.
15. `update_task` — Update task status, result, or progress.
16. `fetch_tasks` — List and filter tasks by project or agent.

### 2.4 Issue Tracking Tools (3 tools)
17. `create_issue` — Log an issue or impediment.
18. `resolve_issue` — Mark an issue as resolved with resolution notes.
19. `fetch_issues` — List active or resolved issues.

### 2.5 Agent Presence & Messaging Tools (5 tools)
20. `register_agent` — Register agent identity and capabilities.
21. `heartbeat_agent` — Send heartbeat to maintain online status.
22. `list_agents` — Discover active and registered agents.
23. `send_message` — Dispatch inter-agent communication.
24. `request_messages` — Retrieve pending incoming messages.

### 2.6 Resource Soft Lock Tools (3 tools)
25. `acquire_resource_lock` — Request exclusive lease on a file or resource.
26. `release_resource_lock` — Release an acquired resource lease.
27. `fetch_resource_locks` — Inspect currently held locks across agents.

### 2.7 Multi-Agent Chat Tools (7 tools)
28. `create_chat_room` — Create collaboration room with scope and permissions.
29. `join_chat_room` — Join an active discussion room.
30. `send_chat_message` — Post structured message into a chat room.
31. `fetch_chat_messages` — Retrieve message history with pagination.
32. `pin_chat_message` — Pin critical decision or instruction.
33. `list_chat_rooms` — Discover available chat rooms.
34. `leave_chat_room` — Depart a chat room.

### 2.8 Feedback System Tools (5 tools)
35. `submit_feedback` — Submit bug report, feature request, or observation.
36. `vote_feedback` — Cast upvote/downvote on feedback items.
37. `resolve_feedback` — Transition feedback state with resolution note.
38. `fetch_feedback` — Query feedback items by status or severity.
39. `get_feedback_summary` — Aggregate metrics and feedback trends.

### 2.9 MCP Server Registry Tools (9 tools)
40. `register_mcp_server` — Register an upstream MCP server (stdio or sse).
41. `unregister_mcp_server` — Remove an upstream server registration.
42. `list_mcp_servers` — List registered upstream MCP servers.
43. `get_mcp_server` — Retrieve details for a registered server.
44. `connect_mcp_server` — Establish active session to upstream server.
45. `disconnect_mcp_server` — Terminate connection to upstream server.
46. `proxy_mcp_call` — Proxy a tool invocation to an upstream MCP server.
47. `discover_mcp_tools` — Discover tools provided by connected upstream servers.
48. `get_mcp_health` — Health check and circuit breaker status for servers.

### 2.10 Browser Automation & System Tools (16 tools)
49. `open_browser` — Initialize browser session via Playwright loader.
50. `close_browser` — Terminate browser session.
51. `navigate_to_url` — Navigate browser to URL.
52. `get_page_content` — Retrieve DOM HTML content.
53. `click_element` — Click target DOM selector.
54. `fill_input` — Input text into input element.
55. `get_element_text` — Extract text content of an element.
56. `evaluate_javascript` — Run JavaScript expression in browser context.
57. `take_screenshot` — Capture page screenshot.
58. `wait_for_selector` — Wait for selector visibility.
59. `get_page_title` — Retrieve page title.
60. `get_current_url` — Get current browser location.
61. `reload_page` — Refresh current page.
62. `go_back` — Browser back navigation.
63. `go_forward` — Browser forward navigation.
64. `play_notification_sound` — Play audio notification ping.

### 2.11 Execution Sandbox Tools (6 tools — Phase 1 Gated)
65. `execution_submit` — Submit script for sandboxed execution (fails closed).
66. `execution_status` — Query job execution status.
67. `execution_cancel` — Cancel queued or running job.
68. `execution_logs` — Retrieve stdout/stderr logs.
69. `execution_approve` — Approve execution job.
70. `execution_audit` — Review execution audit trail.
