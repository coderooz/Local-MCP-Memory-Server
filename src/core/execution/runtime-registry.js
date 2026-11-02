/**
 * Execution Sandbox — Trusted Runtime Registry
 *
 * Maps runtime identifiers to explicitly configured, trusted runtime
 * environments. A client may only reference a runtime by ID — never supply
 * an executable path, container image, launch flags, or host environment.
 *
 * Phase 1 ships the registry with a Docker-backed descriptor per runtime.
 * The descriptors are inert until Phase 2 wires a live sandbox adapter; the
 * Docker daemon availability is checked at execution time, not here.
 */

import { ExecutionError, EXECUTION_ERRORS } from './errors.js';

/**
 * Trusted runtime entries. `executable` and `image` are server-configured
 * constants, not caller input. `backend` names the isolation adapter that
 * must run this runtime.
 */
const RUNTIMES = {
  python: {
    id: 'python',
    backend: 'docker',
    // Phase 2 will bind a concrete image; kept explicit and server-side.
    image: null,
    executable: 'python3',
    version: null,
    trusted: true,
  },
  node: {
    id: 'node',
    backend: 'docker',
    image: null,
    executable: 'node',
    version: null,
    trusted: true,
  },
};

/** List the trusted runtime identifiers. */
export function listRuntimes() {
  return Object.keys(RUNTIMES);
}

/**
 * Resolve a trusted runtime descriptor by id. Throws UNKNOWN_RUNTIME for
 * anything not explicitly registered. Never accepts a path or image.
 */
export function resolveRuntime(runtimeId) {
  const runtime = RUNTIMES[runtimeId];
  if (!runtime || !runtime.trusted) {
    throw new ExecutionError(
      EXECUTION_ERRORS.UNKNOWN_RUNTIME,
      `Runtime "${runtimeId}" is not registered in the trusted runtime registry`,
      { runtime: runtimeId, allowed: listRuntimes() }
    );
  }
  return { ...runtime };
}

/** True if the runtime id is registered and trusted. */
export function isRuntimeRegistered(runtimeId) {
  return Boolean(RUNTIMES[runtimeId]?.trusted);
}

/**
 * Register or update a trusted runtime. Intended for server-side
 * configuration (Phase 2 image binding), never for client input.
 */
export function registerRuntime(runtimeId, descriptor) {
  RUNTIMES[runtimeId] = {
    id: runtimeId,
    backend: descriptor.backend || 'docker',
    image: descriptor.image ?? null,
    executable: descriptor.executable || runtimeId,
    version: descriptor.version ?? null,
    trusted: descriptor.trusted !== false,
  };
  return { ...RUNTIMES[runtimeId] };
}
