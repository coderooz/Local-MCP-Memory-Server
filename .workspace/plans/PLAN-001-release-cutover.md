# PLAN-001: v2.6.0 Release and Cutover Plan

## Objective
Execute a seamless, zero-downtime cutover from v2.5.0 to v2.6.0.

## Phases
1. **Verification:** Confirm all automated tests and governance suites pass.
2. **Migration Authorization:** Execute production data migration using verified script.
3. **Global Client Update:** Update `%USERPROFILE%\.gemini\antigravity\mcp_config.json` to target v2.6.0.
4. **Smoke Testing:** Perform memory write, task creation, and lock acquisition verification via Antigravity.
5. **Archive:** Safely archive legacy v2.5.0 instance.
