import { startServer } from "./server.js";

let startupPromise = null;

export function startMemoryServer() {
  if (!startupPromise) {
    startupPromise = startServer({ silent: true }).catch((error) => {
      startupPromise = null;
      throw error;
    });
  }

  return startupPromise;
}
