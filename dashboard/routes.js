/**
 * Dashboard Routes
 *
 * Serves the visual dashboard UI and provides a combined API
 * endpoint for the dashboard to consume.
 *
 * The dashboard is a client-side routed SPA (hash routes such as `#/memory`),
 * so every path under /dashboard resolves to the same app shell.
 */

import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DASHBOARD_PATH = join(__dirname, 'index.html');

/**
 * Send the dashboard app shell, or a 404 if it is missing from disk.
 */
function sendDashboard(res) {
  if (!existsSync(DASHBOARD_PATH)) {
    res.status(404).json({ error: 'Dashboard not found' });
    return;
  }
  res.setHeader('Content-Type', 'text/html');
  res.send(readFileSync(DASHBOARD_PATH, 'utf-8'));
}

/**
 * Register dashboard routes on an Express app
 */
export function registerDashboardRoutes(app) {
  // Serve the dashboard HTML
  app.get('/dashboard', (req, res) => {
    sendDashboard(res);
  });

  // SPA fallback: any deeper path under /dashboard serves the app shell so a
  // direct navigation or a stray link never 404s. Registered with the
  // middleware form (rather than a `/dashboard/*` pattern) because Express 5
  // changed wildcard syntax and the middleware form works on both majors.
  app.use('/dashboard', (req, res, next) => {
    if (req.method !== 'GET') return next();
    sendDashboard(res);
  });

  // Redirect root to dashboard if dashboard exists
  app.get('/ui', (req, res) => {
    res.redirect(302, '/dashboard');
  });
}
