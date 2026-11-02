/**
 * Execution Sandbox — Job State Machine
 *
 * A validated finite state machine for execution job lifecycle. Every
 * transition is checked against an allow-list; invalid transitions throw.
 * The machine is pure (no I/O) so it is trivially unit-testable and the
 * repository layer persists each accepted transition durably.
 *
 * States mirror the directive §8 set, adapted only where repository
 * conventions justified a clearer name.
 */

import { ExecutionError, EXECUTION_ERRORS } from './errors.js';

/** Terminal states — no further transitions are permitted. */
export const TERMINAL_STATES = new Set([
  'succeeded',
  'failed',
  'timed_out',
  'cancelled',
  'rejected',
  'expired',
]);

/** All valid states. */
export const JOB_STATES = [
  'validating',
  'awaiting_approval',
  'queued',
  'preparing',
  'running',
  'collecting',
  'validating_result',
  'succeeded',
  'failed',
  'timed_out',
  'cancelling',
  'cancelled',
  'rejected',
  'expired',
  'retry_queued',
];

/**
 * Allowed transitions. A state maps to the set of states it may move to.
 * Cancellation is modeled explicitly: `cancelling -> cancelled|failed` and
 * many non-terminal states may move to `cancelling` on a cancel request.
 */
const TRANSITIONS = {
  // `failed` is reachable from every non-terminal pre-execution state so a
  // job that cannot start (backend unavailable, workspace allocation failure)
  // is never left stuck in an unrecoverable state.
  validating: ['awaiting_approval', 'queued', 'rejected', 'failed', 'cancelling'],
  awaiting_approval: ['queued', 'rejected', 'expired', 'failed', 'cancelling'],
  queued: ['preparing', 'cancelling', 'rejected', 'expired', 'failed'],
  preparing: ['running', 'failed', 'cancelling'],
  running: ['collecting', 'failed', 'timed_out', 'cancelling'],
  collecting: ['validating_result', 'failed', 'cancelling'],
  validating_result: ['succeeded', 'failed', 'retry_queued'],
  succeeded: [],
  failed: ['retry_queued'],
  timed_out: ['retry_queued'],
  cancelling: ['cancelled', 'failed'],
  cancelled: [],
  rejected: [],
  expired: [],
  retry_queued: ['queued', 'rejected', 'expired'],
};

/** Returns true if `from -> to` is a permitted transition. */
export function canTransition(from, to) {
  const allowed = TRANSITIONS[from];
  if (!allowed) return false;
  return allowed.includes(to);
}

/**
 * Assert a transition is legal, else throw INVALID_STATE_TRANSITION.
 * Returns the target state for convenient chaining.
 */
export function assertTransition(from, to) {
  if (!JOB_STATES.includes(to)) {
    throw new ExecutionError(
      EXECUTION_ERRORS.INVALID_STATE_TRANSITION,
      `Unknown job state: ${to}`,
      { from, to }
    );
  }
  if (TERMINAL_STATES.has(from)) {
    throw new ExecutionError(
      EXECUTION_ERRORS.INVALID_STATE_TRANSITION,
      `Job is in terminal state "${from}"; no further transitions allowed`,
      { from, to }
    );
  }
  if (!canTransition(from, to)) {
    throw new ExecutionError(
      EXECUTION_ERRORS.INVALID_STATE_TRANSITION,
      `Transition "${from}" -> "${to}" is not permitted`,
      { from, to, allowed: TRANSITIONS[from] || [] }
    );
  }
  return to;
}

/** True if the state is terminal. */
export function isTerminal(state) {
  return TERMINAL_STATES.has(state);
}

/** True if the job is in a state where cancellation has been requested. */
export function isCancelling(state) {
  return state === 'cancelling';
}

/**
 * Effective terminal state for a job that was cancelled. `failed` is used
 * when the workload already started and its outcome is uncertain; a job that
 * had not yet started resolves straight to `cancelled`.
 */
export function cancellationOutcome(previousState) {
  return previousState === 'running' || previousState === 'collecting' ? 'failed' : 'cancelled';
}

export { TRANSITIONS };
