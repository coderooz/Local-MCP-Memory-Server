# MCP Tool Coverage Report

**Audit Date:** 2026-11-05  
**Version:** 2.6.0  
**Registered Tools:** 57 Tools  

---

## 1. Tool Matrix by Subsystem

### 1.1 Memory & Project Context (8 Tools)
| Tool Name | Input Schema | Purpose | Status |
|---|---|---|---|
| `store_context` | `{ content, importance, type, tags }` | Stores durable memory entry | Verified |
| `search_context` | `{ query, limit, agent, scope }` | FTS5 ranked search across stored contexts | Verified |
| `update_context` | `{ id, content, expectedVersion }` | Updates context with optimistic locking | Verified |
| `get_full_context` | `{ id }` | Retrieves complete context record | Verified |
| `get_connected_context` | `{ id }` | Context graph linking tasks, issues, actions | Verified |
| `optimize_memory` | `{ threshold }` | Deduplicates and consolidates old memory | Verified |
| `set_project_descriptor` | `{ purpose, stack, rules, constraints }` | Sets baseline project context | Verified |
| `get_project_descriptor` | `{ project }` | Retrieves project descriptor | Verified |

### 1.2 Task Coordination & Work Ownership (4 Tools)
| Tool Name | Input Schema | Purpose | Status |
|---|---|---|---|
| `create_task` | `{ title, description, priority, dependencies }` | Creates coordination task | Verified |
| `fetch_tasks` | `{ status, assignee, priority }` | Lists project tasks | Verified |
| `assign_task` | `{ taskId, assignee }` | Claims or transfers task ownership | Verified |
| `update_task` | `{ taskId, status, result, blocker }` | Updates task progress & dependencies | Verified |

### 1.3 Issues & Blockers (3 Tools)
| Tool Name | Input Schema | Purpose | Status |
|---|---|---|---|
| `create_issue` | `{ title, description, severity, taskId }` | Logs a bug, note, or blocker | Verified |
| `resolve_issue` | `{ issueId, resolution }` | Resolves an issue | Verified |
| `fetch_issues` | `{ status, severity }` | Lists project issues | Verified |

### 1.4 Agent Presence & Messaging (5 Tools)
| Tool Name | Input Schema | Purpose | Status |
|---|---|---|---|
| `register_agent` | `{ name, capabilities }` | Registers agent presence | Verified |
| `heartbeat_agent` | `{ name }` | Refreshes agent liveness | Verified |
| `list_agents` | `{}` | Lists all registered agents | Verified |
| `send_message` | `{ recipient, content, type }` | Sends direct inter-agent message | Verified |
| `request_messages` | `{ agent }` | Reads inbox messages | Verified |

### 1.5 Soft Resource Locks & Concurrency (3 Tools)
| Tool Name | Input Schema | Purpose | Status |
|---|---|---|---|
| `acquire_resource_lock` | `{ resource, ttl }` | Acquires advisory soft lock | Verified |
| `release_resource_lock` | `{ resource }` | Releases held lock | Verified |
| `fetch_resource_locks` | `{}` | Lists active locks | Verified |

### 1.6 Chat Rooms System (7 Tools)
| Tool Name | Input Schema | Purpose | Status |
|---|---|---|---|
| `create_chat_room` | `{ name, topic, scope }` | Creates topic chat room | Verified |
| `send_chat_message` | `{ roomId, message, type }` | Posts message to room | Verified |
| `get_chat_messages` | `{ roomId, limit, since }` | Fetches room history | Verified |
| `list_chat_rooms` | `{}` | Lists all active rooms | Verified |
| `join_chat_room` | `{ roomId }` | Joins agent to room | Verified |
| `leave_chat_room` | `{ roomId }` | Leaves room | Verified |
| `pin_chat_message` | `{ roomId, messageId }` | Pins message in room | Verified |

### 1.7 Feedback & Community Voting (5 Tools)
| Tool Name | Input Schema | Purpose | Status |
|---|---|---|---|
| `submit_feedback` | `{ title, description, type, severity }` | Submits structured feedback | Verified |
| `vote_feedback` | `{ feedbackId, direction }` | Upvotes / downvotes feedback | Verified |
| `get_feedback` | `{ feedbackId }` | Reads feedback item | Verified |
| `list_feedback` | `{ status, type, severity }` | Lists feedback items | Verified |
| `resolve_feedback` | `{ feedbackId, resolution }` | Closes feedback | Verified |

### 1.8 MCP Server Registry & Proxying (9 Tools)
| Tool Name | Input Schema | Purpose | Status |
|---|---|---|---|
| `register_mcp_server` | `{ name, type, endpoint, auth_config }` | Registers external MCP server | Verified |
| `unregister_mcp_server` | `{ id }` | Removes registered server | Verified |
| `list_mcp_servers` | `{ project }` | Lists servers (masked credentials) | Verified |
| `get_mcp_server` | `{ id }` | Gets server details | Verified |
| `connect_mcp_server` | `{ id }` | Connects and caches tools | Verified |
| `disconnect_mcp_server` | `{ id }` | Disconnects server | Verified |
| `discover_mcp_tools` | `{ id }` | Lists cached discovered tools | Verified |
| `proxy_mcp_call` | `{ serverId, toolName, arguments }` | Forwards JSON-RPC call | Verified |
| `get_mcp_health` | `{ id }` | Latency & error count health | Verified |

### 1.9 Execution Sandbox (6 Tools)
| Tool Name | Input Schema | Purpose | Status |
|---|---|---|---|
| `execution_submit` | `{ script, runtime, permissions }` | Submits execution job (sha256 hash) | Verified |
| `execution_approve` | `{ jobId, approvalBinding }` | Approves execution job | Verified |
| `execution_cancel` | `{ jobId }` | Cancels running job | Verified |
| `execution_status` | `{ jobId }` | Queries job state machine | Verified |
| `execution_result` | `{ jobId }` | Retrieves execution log output | Verified |
| `execution_list` | `{ project, status }` | Lists execution jobs | Verified |

### 1.10 Browser Automation & Notifications (17 Tools)
- `open_browser`, `close_browser`, `navigate_to_url`, `get_page_content`, `click_element`, `fill_input`, `get_element_text`, `evaluate_javascript`, `take_screenshot`, `wait_for_selector`, `get_page_title`, `get_current_url`, `get_elements`, `set_viewport`, `clear_cookies`, `get_cookies`, `set_cookies`.
- `play_notification_sound` (Audio alert).
