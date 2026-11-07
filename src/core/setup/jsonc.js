/**
 * Minimal JSON-with-comments (JSONC) utilities.
 *
 * Agent configuration files (notably opencode's `opencode.json`) contain `//`
 * comments and trailing commas. Rewriting them with `JSON.stringify` would
 * destroy user comments, so these helpers perform surgical text edits that
 * preserve everything outside the property being changed.
 *
 * Only the small subset needed by the config adapters is implemented; this is
 * not a general-purpose JSONC library.
 */

function isWhitespace(ch) {
  // A UTF-8 BOM is legal at the start of a config file (Windows editors add it)
  // and must be skipped like whitespace rather than treated as data.
  return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === '\uFEFF';
}

export function skipTrivia(text, index) {
  let i = index;
  while (i < text.length) {
    const ch = text[i];
    if (isWhitespace(ch)) {
      i += 1;
      continue;
    }
    if (ch === '/' && text[i + 1] === '/') {
      const newline = text.indexOf('\n', i + 2);
      i = newline === -1 ? text.length : newline + 1;
      continue;
    }
    if (ch === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      i = end === -1 ? text.length : end + 2;
      continue;
    }
    break;
  }
  return i;
}

export function readJsonString(text, index) {
  if (text[index] !== '"') {
    throw new Error(`expected string at offset ${index}`);
  }
  let i = index + 1;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '\\') {
      i += 2;
      continue;
    }
    if (ch === '"') {
      const raw = text.slice(index, i + 1);
      return { value: JSON.parse(raw), end: i + 1 };
    }
    i += 1;
  }
  throw new Error('unterminated string');
}

export function findMatchingBracket(text, index) {
  const open = text[index];
  const close = open === '{' ? '}' : open === '[' ? ']' : null;
  if (!close) return -1;

  let depth = 0;
  let i = index;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '"') {
      i = readJsonString(text, i).end;
      continue;
    }
    if (ch === '/' && text[i + 1] === '/') {
      const newline = text.indexOf('\n', i + 2);
      i = newline === -1 ? text.length : newline + 1;
      continue;
    }
    if (ch === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      i = end === -1 ? text.length : end + 2;
      continue;
    }
    if (ch === open) depth += 1;
    else if (ch === close) {
      depth -= 1;
      if (depth === 0) return i;
    }
    i += 1;
  }
  return -1;
}

/**
 * End offset (exclusive) of the JSON value starting at `index`.
 */
export function scanValueEnd(text, index) {
  const start = skipTrivia(text, index);
  const ch = text[start];
  if (ch === '{' || ch === '[') {
    const end = findMatchingBracket(text, start);
    return end === -1 ? text.length : end + 1;
  }
  if (ch === '"') {
    return readJsonString(text, start).end;
  }

  let i = start;
  while (i < text.length) {
    const c = text[i];
    if (c === ',' || c === '}' || c === ']') break;
    if (c === '/' && text[i + 1] === '/') {
      const newline = text.indexOf('\n', i + 2);
      i = newline === -1 ? text.length : newline + 1;
      continue;
    }
    if (c === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      i = end === -1 ? text.length : end + 2;
      continue;
    }
    i += 1;
  }
  // Trim trailing whitespace from the value span.
  let end = i;
  while (end > start && isWhitespace(text[end - 1])) end -= 1;
  return end;
}

/**
 * Locate a direct member of the object that starts at `objectOpen`.
 *
 * @returns {{keyStart:number, valueStart:number, valueEnd:number}|null}
 */
export function findPropertyRange(text, objectOpen, key) {
  if (text[objectOpen] !== '{') return null;

  let i = skipTrivia(text, objectOpen + 1);
  while (i < text.length && text[i] !== '}') {
    if (text[i] === ',') {
      i = skipTrivia(text, i + 1);
      continue;
    }
    if (text[i] !== '"') break;

    const keyStart = i;
    const parsedKey = readJsonString(text, i);
    i = skipTrivia(text, parsedKey.end);
    if (text[i] !== ':') break;

    const valueStart = skipTrivia(text, i + 1);
    const valueEnd = scanValueEnd(text, valueStart);

    if (parsedKey.value === key) {
      return { keyStart, valueStart, valueEnd };
    }

    i = skipTrivia(text, valueEnd);
  }
  return null;
}

export function findRootObjectIndex(text) {
  const index = skipTrivia(text, 0);
  if (text[index] !== '{') {
    throw new Error('configuration file must contain a JSON object at the top level');
  }
  return index;
}

function detectIndentUnit(text, objectOpen) {
  const firstMember = skipTrivia(text, objectOpen + 1);
  const lineStart = text.lastIndexOf('\n', firstMember) + 1;
  const indent = text.slice(lineStart, firstMember);
  return /^[ \t]+$/.test(indent) ? indent : '  ';
}

/**
 * Replace or insert `key` inside the object at `objectOpen`.
 * Returns the new file text.
 */
export function setJsonProperty(text, objectOpen, key, value) {
  const formatted = JSON.stringify(value, null, 2).replace(/\n/g, '\n');
  const existing = findPropertyRange(text, objectOpen, key);
  const indent = detectIndentUnit(text, objectOpen);

  if (existing) {
    const indented = formatted.replace(/\n/g, `\n${indent}`);
    return text.slice(0, existing.valueStart) + indented + text.slice(existing.valueEnd);
  }

  const objectEnd = findMatchingBracket(text, objectOpen);
  if (objectEnd === -1) throw new Error('unterminated object');

  const isEmpty = skipTrivia(text, objectOpen + 1) === objectEnd;
  const memberIndent = `${indent}`;
  const outerIndent = indent.slice(0, Math.max(0, indent.length - 2));
  const indented = formatted.replace(/\n/g, `\n${memberIndent}`);

  if (isEmpty) {
    const insertion = `\n${memberIndent}${JSON.stringify(key)}: ${indented}\n${outerIndent}`;
    return text.slice(0, objectOpen + 1) + insertion + text.slice(objectOpen + 1);
  }

  const insertion = `\n${memberIndent}${JSON.stringify(key)}: ${indented},`;
  return text.slice(0, objectOpen + 1) + insertion + text.slice(objectOpen + 1);
}

/**
 * Remove `key` from the object at `objectOpen`. Returns the new file text.
 */
export function removeJsonProperty(text, objectOpen, key) {
  const range = findPropertyRange(text, objectOpen, key);
  if (!range) return text;

  let start = range.keyStart;
  let end = range.valueEnd;

  // Consume the trailing comma when this is not the last member.
  const afterValue = skipTrivia(text, end);
  if (text[afterValue] === ',') {
    end = afterValue + 1;
  } else {
    // Last member: remove the preceding comma instead.
    let before = start - 1;
    while (before >= 0 && isWhitespace(text[before])) before -= 1;
    if (text[before] === ',') start = before;
  }

  // Remove the indentation/newline that preceded the member.
  const lineStart = text.lastIndexOf('\n', start);
  if (lineStart !== -1) {
    const between = text.slice(lineStart + 1, start);
    if (/^[ \t]*$/.test(between)) start = lineStart + 1;
  }

  return text.slice(0, start) + text.slice(end);
}

/**
 * Parse JSONC text (comments + trailing commas tolerated).
 */
export function parseJsonc(text) {
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const withoutComments = (() => {
    let out = '';
    let i = 0;
    while (i < source.length) {
      const ch = source[i];
      if (ch === '"') {
        const parsed = readJsonString(source, i);
        out += source.slice(i, parsed.end);
        i = parsed.end;
        continue;
      }
      if (ch === '/' && source[i + 1] === '/') {
        const newline = source.indexOf('\n', i + 2);
        i = newline === -1 ? source.length : newline;
        continue;
      }
      if (ch === '/' && source[i + 1] === '*') {
        const end = source.indexOf('*/', i + 2);
        i = end === -1 ? source.length : end + 2;
        continue;
      }
      out += ch;
      i += 1;
    }
    return out;
  })();

  const withoutTrailingCommas = withoutComments.replace(/,(\s*[}\]])/g, '$1');
  return JSON.parse(withoutTrailingCommas);
}

export { isWhitespace };
