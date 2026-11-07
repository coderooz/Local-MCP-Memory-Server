/**
 * Lazy Playwright loader.
 *
 * Browser automation is an optional capability: a memory/coordination server
 * must install and start without downloading browser binaries. Playwright is
 * therefore resolved on first use, with an actionable error when the optional
 * dependency is missing.
 */

let cached = null;

export const PLAYWRIGHT_MISSING_MESSAGE =
  'Browser automation requires Playwright, which is an optional dependency. ' +
  'Install it with `npm install playwright` and then run `npx playwright install chromium`.';

/**
 * Resolve the Playwright module.
 *
 * @returns {Promise<typeof import('playwright')>}
 */
export async function loadPlaywright() {
  if (cached) return cached;

  try {
    cached = await import('playwright');
    return cached;
  } catch (error) {
    const wrapped = new Error(PLAYWRIGHT_MISSING_MESSAGE);
    wrapped.code = 'PLAYWRIGHT_NOT_INSTALLED';
    wrapped.cause = error;
    throw wrapped;
  }
}

/**
 * Resolve the Chromium launcher.
 */
export async function loadChromium() {
  const playwright = await loadPlaywright();
  return playwright.chromium;
}

/** Test seam: forget the cached module. */
export function resetPlaywrightLoader() {
  cached = null;
}

export default { loadPlaywright, loadChromium, PLAYWRIGHT_MISSING_MESSAGE };
