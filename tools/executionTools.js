/**
 * Execution Sandbox — MCP Tool Handlers (Phase 1)
 *
 * Delegates each execution_* tool to the execution service, passing the
 * TRUSTED CONFIG (agent/project) rather than any caller-asserted identity.
 *
 * Follows the exact shape of tools/mcpRegistryTools.js so it drops into the
 * existing tools/call dispatch with a single additive block.
 */

import { isFeatureEnabled } from '../core/config/project-config-loader.js';
import { getExecutionService } from '../src/core/execution/service-bridge.js';
import { isExecutionError } from '../src/core/execution/errors.js';

export async function handleExecutionTool(name, args = {}, config = {}) {
  if (!isFeatureEnabled('executionSandbox')) {
    return {
      content: [
        {
          type: 'text',
          text: 'Execution sandbox is disabled. Enable it in project config: features.executionSandbox = true',
        },
      ],
    };
  }

  // Trusted context comes from server config, never from args.
  const context = {
    agent: config.agent,
    project: config.project,
    sessionId: config.sessionId || null,
  };

  try {
    const service = getExecutionService();
    let result;

    switch (name) {
      case 'execution_submit':
        result = await service.submitJob(context, args);
        break;
      case 'execution_status':
        result = { job: await service.getJob(context, args.jobId) };
        break;
      case 'execution_result':
        result = await service.getResult(context, args.jobId);
        break;
      case 'execution_list':
        result = { jobs: await service.listJobs(context, args) };
        break;
      case 'execution_cancel':
        result = await service.cancelJob(context, args.jobId);
        break;
      case 'execution_approve':
        result = await service.approveJob(context, {
          jobId: args.jobId,
          approver: args.approver,
          ttlMs: args.ttlMs,
        });
        break;
      default:
        result = { error: `Unknown execution tool: ${name}` };
    }

    return {
      content: [
        {
          type: 'text',
          text: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (err) {
    if (isExecutionError(err)) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: JSON.stringify(err.toJSON(), null, 2),
          },
        ],
      };
    }
    // Non-execution errors are surfaced generically (no stack leaks).
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            { error: { code: 'INTERNAL_ERROR', message: 'Execution request failed' } },
            null,
            2
          ),
        },
      ],
    };
  }
}
