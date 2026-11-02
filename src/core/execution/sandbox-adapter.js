/**
 * Execution Sandbox — Replaceable Sandbox Backend Interface
 *
 * Defines the contract every isolation backend must satisfy, plus the
 * registry used to select one. Phase 1 ships only the interface and a
 * Docker-backed stub; NO process is ever spawned here.
 *
 * The Docker backend is intentionally fail-closed: it refuses to run unless
 * the Docker daemon is verified available (Phase 2). This keeps the security
 * posture honest — we never substitute an unrestricted host process.
 */

import { ExecutionError, EXECUTION_ERRORS } from './errors.js';

/** Named backend identifiers. */
export const BACKENDS = {
  docker: 'docker',
};

/**
 * Contract every backend must implement:
 *  - name                 : string identifier
 *  - isAvailable()        : async () => boolean  (daemon/runtime probe)
 *  - prepare(job)         : async (job) => workspaceHandle
 *  - run(workspaceHandle) : async (job) => raw result { exitCode, stdout, stderr, durationMs }
 *  - cleanup(workspaceHandle) : async () => void
 *  - cancel(workspaceHandle)  : async () => void
 */
export function createDockerBackend({ availabilityProbe }) {
  return {
    name: BACKENDS.docker,

    /**
     * Probe whether the Docker daemon is reachable. The probe is injected so
     * this module stays free of child-process concerns; Phase 2 wires the
     * real `docker version` check.
     */
    async isAvailable() {
      if (typeof availabilityProbe !== 'function') return false;
      try {
        return Boolean(await availabilityProbe());
      } catch {
        return false;
      }
    },

    async prepare() {
      // Phase 2 implements workspace staging + container launch prep.
      throw new ExecutionError(
        EXECUTION_ERRORS.SANDBOX_START_FAILED,
        'Docker sandbox backend is not yet implemented (Phase 2)',
        {}
      );
    },

    async run() {
      throw new ExecutionError(
        EXECUTION_ERRORS.SANDBOX_START_FAILED,
        'Docker sandbox backend is not yet implemented (Phase 2)',
        {}
      );
    },

    async cleanup() {
      // No-op in Phase 1; nothing is allocated.
    },

    async cancel() {
      // No-op in Phase 1; nothing is running.
    },
  };
}

/** In-memory backend registry keyed by name. */
const registry = new Map();

export function registerBackend(backend) {
  registry.set(backend.name, backend);
  return backend;
}

export function getBackend(name) {
  const backend = registry.get(name);
  if (!backend) {
    throw new ExecutionError(
      EXECUTION_ERRORS.SANDBOX_START_FAILED,
      `Sandbox backend "${name}" is not registered`,
      { backend: name, available: Array.from(registry.keys()) }
    );
  }
  return backend;
}

export function listBackends() {
  return Array.from(registry.keys());
}
