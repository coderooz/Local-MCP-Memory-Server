/**
 * Execution Sandbox — MCP Tool Contracts (Phase 1)
 *
 * Six narrow tools. Definitions are feature-gated so that when the sandbox is
 * disabled the tools are never advertised (and the handlers refuse).
 *
 * No existing tool is modified. These are appended to the tools/list array.
 */

import { isFeatureEnabled } from '../../../core/config/project-config-loader.js';

export function getExecutionTools() {
  if (!isFeatureEnabled('executionSandbox')) {
    return [];
  }

  return [
    {
      name: 'execution_submit',
      description:
        'Submit an approved task or a generated script for sandboxed execution. ' +
        'Identity and project are resolved server-side and cannot be forged.',
      inputSchema: {
        type: 'object',
        properties: {
          mode: { type: 'string', enum: ['task', 'script'], description: 'Execution mode' },
          taskId: { type: 'string', description: 'Approved task id (mode=task)' },
          taskVersion: { type: 'number', description: 'Approved task version (optional)' },
          source: { type: 'string', description: 'Script source (mode=script)' },
          runtime: {
            type: 'string',
            enum: ['python', 'node'],
            description: 'Trusted runtime identifier (never a path or image)',
          },
          permissions: {
            type: 'array',
            items: { type: 'string' },
            description: 'Requested permissions (may only narrow the effective set)',
          },
          limits: {
            type: 'object',
            description: 'Requested resource limits (clamped to safe maxima)',
          },
          idempotencyKey: { type: 'string', description: 'Safe replay key' },
        },
        required: ['mode', 'runtime'],
      },
    },
    {
      name: 'execution_status',
      description: 'Get the current state of a sandboxed execution job (project-scoped).',
      inputSchema: {
        type: 'object',
        properties: {
          jobId: { type: 'string', description: 'Job identifier' },
        },
        required: ['jobId'],
      },
    },
    {
      name: 'execution_result',
      description: 'Get the bounded, redacted result of a finished execution job.',
      inputSchema: {
        type: 'object',
        properties: {
          jobId: { type: 'string', description: 'Job identifier' },
        },
        required: ['jobId'],
      },
    },
    {
      name: 'execution_list',
      description: 'List execution jobs within the trusted project scope.',
      inputSchema: {
        type: 'object',
        properties: {
          state: { type: 'string', description: 'Filter by job state' },
          mode: { type: 'string', enum: ['task', 'script'], description: 'Filter by mode' },
          limit: { type: 'number', description: 'Max results (default 50, cap 200)' },
        },
      },
    },
    {
      name: 'execution_cancel',
      description: 'Request cancellation of an execution job. Idempotent.',
      inputSchema: {
        type: 'object',
        properties: {
          jobId: { type: 'string', description: 'Job identifier' },
        },
        required: ['jobId'],
      },
    },
    {
      name: 'execution_approve',
      description:
        'Approve a job awaiting approval. The approving principal must differ from the ' +
        'requesting agent; self-approval is forbidden.',
      inputSchema: {
        type: 'object',
        properties: {
          jobId: { type: 'string', description: 'Job identifier' },
          approver: { type: 'string', description: 'Trusted approving principal' },
          ttlMs: { type: 'number', description: 'Approval lifetime in ms (default 30 min)' },
        },
        required: ['jobId', 'approver'],
      },
    },
  ];
}

export const EXECUTION_TOOL_NAMES = [
  'execution_submit',
  'execution_status',
  'execution_result',
  'execution_list',
  'execution_cancel',
  'execution_approve',
];
