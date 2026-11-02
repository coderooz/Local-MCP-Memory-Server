/**
 * Execution Sandbox — Result Collector
 *
 * Normalizes raw backend output into a bounded, redacted, structured result.
 * Enforces output caps and strips sensitive patterns before anything is
 * persisted or returned through MCP.
 *
 * Phase 1 provides the normalization + redaction + bounding logic (pure,
 * unit-testable). Phase 2 feeds real container output into it.
 */

import { ExecutionError, EXECUTION_ERRORS } from './errors.js';

/** Patterns whose matches are redacted from captured output. */
const SENSITIVE_PATTERNS = [
  /(password\s*[=:]\s*)\S+/gi,
  /(secret\s*[=:]\s*)\S+/gi,
  /(token\s*[=:]\s*)\S+/gi,
  /(api[_-]?key\s*[=:]\s*)\S+/gi,
  /(authorization\s*[=:]\s*bearer\s+)\S+/gi,
  /(mongodb(\+srv)?:\/\/)[^\s]+/gi,
];

/** Redact sensitive values from a string. */
export function redact(text) {
  if (typeof text !== 'string' || !text) return '';
  let out = text;
  for (const re of SENSITIVE_PATTERNS) {
    out = out.replace(re, (match, prefix) => `${prefix}[REDACTED]`);
  }
  return out;
}

/**
 * Bound a chunk of output to a maximum byte length. Appends a truncation
 * marker when the input exceeds the cap so consumers know it was cut.
 */
export function boundOutput(text, maxBytes) {
  const raw = typeof text === 'string' ? text : '';
  const buf = Buffer.from(raw, 'utf8');
  if (buf.length <= maxBytes) {
    return { text: raw, truncated: false, bytes: buf.length };
  }
  const slice = buf.subarray(0, maxBytes).toString('utf8');
  return { text: slice, truncated: true, bytes: buf.length };
}

/**
 * Normalize a raw backend result into the structured result shape.
 *
 * @param {object} raw  { exitCode, stdout, stderr, durationMs }
 * @param {object} limits  { outputBytes }
 */
export function normalizeResult(raw, limits = {}) {
  const outputBytes = limits.outputBytes || 65536;
  const stdout = boundOutput(redact(raw.stdout || ''), outputBytes);
  const stderr = boundOutput(redact(raw.stderr || ''), outputBytes);

  if (stdout.truncated || stderr.truncated) {
    // Output limit exceeded is a signal the caller may want to treat as a
    // distinct condition; we surface it as a flag rather than an error so the
    // job can still be recorded deterministically.
  }

  return {
    exitCode: Number.isFinite(raw.exitCode) ? raw.exitCode : null,
    durationMs: Number.isFinite(raw.durationMs) ? raw.durationMs : null,
    stdout: stdout.text,
    stderr: stderr.text,
    stdoutTruncated: stdout.truncated,
    stderrTruncated: stderr.truncated,
    outputBytes: {
      stdout: stdout.bytes,
      stderr: stderr.bytes,
    },
    success: raw.exitCode === 0,
  };
}

/**
 * Enforce an output cap and raise OUTPUT_LIMIT_EXCEEDED when a strict limit
 * is configured and breached. Used where truncation is not acceptable.
 */
export function enforceOutputLimit(bytes, maxBytes) {
  if (bytes > maxBytes) {
    throw new ExecutionError(
      EXECUTION_ERRORS.OUTPUT_LIMIT_EXCEEDED,
      'Execution output exceeded the configured limit',
      { bytes, maxBytes }
    );
  }
  return true;
}
