// Lightweight SKILL.md frontmatter parser + atomic boolean field rewrite.
// Port of the skill-explorer plugin's frontmatter logic (parseYamlBool /
// unquote / parseFrontmatter / setFrontmatterField), zero dependencies.

import { readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { invariant } from './invariant';

export interface ParsedFrontmatter {
  name?: string;
  description?: string;
  whenToUse?: string;
  disableModelInvocation?: boolean;
  userInvocable?: boolean;
}

/** kebab-case YAML key -> camelCase ParsedFrontmatter field. */
const FIELD_MAP: Record<string, keyof ParsedFrontmatter> = {
  name: 'name',
  description: 'description',
  'when-to-use': 'whenToUse',
  'disable-model-invocation': 'disableModelInvocation',
  'user-invocable': 'userInvocable',
};

/** Boolean fields are stored as real booleans; the rest stay strings. */
const BOOLEAN_FIELDS = new Set<keyof ParsedFrontmatter>([
  'disableModelInvocation',
  'userInvocable',
]);

function parseYamlBool(raw: string): boolean | undefined {
  const v = raw.trim().toLowerCase();
  if (v === 'true' || v === 'yes' || v === 'on') return true;
  if (v === 'false' || v === 'no' || v === 'off') return false;
  return undefined;
}

function unquote(s: string): string {
  if (s.length >= 2) {
    if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
      return s.slice(1, -1);
    }
  }
  return s;
}

/** Single-quote a YAML scalar, doubling any embedded single quotes. */
export function yamlQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

interface FrontmatterMatch {
  /** Frontmatter body between the `---` delimiters (no delimiters). */
  body: string;
  /** Everything after the closing `---` line, verbatim. */
  rest: string;
  /** Line ending detected in the source (`\n` or `\r\n`). */
  eol: string;
}

/** Frontmatter block matcher shared by the parser and the raw splitter. */
const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

function matchFrontmatter(content: string): FrontmatterMatch | null {
  const m = FRONTMATTER_RE.exec(content);
  if (!m) return null;
  return {
    body: m[1],
    rest: content.slice(m[0].length),
    eol: content.includes('\r\n') ? '\r\n' : '\n',
  };
}

/**
 * Split content into the raw frontmatter block (`---` delimiters included)
 * and the verbatim body that follows; null when there is no frontmatter.
 * Shares the FRONTMATTER_RE matcher with parseFrontmatter.
 */
export function splitFrontmatter(content: string): { frontmatter: string; body: string } | null {
  const m = FRONTMATTER_RE.exec(content);
  if (m === null) return null;
  return { frontmatter: m[0].replace(/\r?\n$/, ''), body: content.slice(m[0].length) };
}

/** Parse a SKILL.md frontmatter block into typed fields. Unknown keys are ignored. */
export function parseFrontmatter(content: string): ParsedFrontmatter {
  const fm = matchFrontmatter(content);
  if (!fm) return {};
  const out: ParsedFrontmatter = {};
  const rec = out as Record<string, string | boolean>;
  const lines = fm.body.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (!m) continue;
    const key = m[1];
    const field = FIELD_MAP[key];
    if (!field) continue;
    const raw = m[2].trim();
    if (raw === '|' || raw === '>') {
      // Block scalar: consume subsequent indented lines.
      const block: string[] = [];
      let j = i + 1;
      while (j < lines.length && /^[ \t]/.test(lines[j])) {
        block.push(lines[j].replace(/^[ \t]+/, ''));
        j++;
      }
      i = j - 1;
      const value = raw === '|' ? block.join('\n') : block.join(' ');
      if (value !== '') rec[field] = value;
    } else if (BOOLEAN_FIELDS.has(field)) {
      const b = parseYamlBool(raw);
      if (b !== undefined) rec[field] = b;
    } else if (raw !== '') {
      rec[field] = unquote(raw);
    }
  }
  return out;
}

/** Atomically replace `file` with `content` via an exclusive tmp file + rename. */
function atomicWrite(file: string, content: string): void {
  const tmp = join(dirname(file), `.${file.split(/[\\/]/).pop()}.${process.pid}.${Date.now()}.tmp`);
  try {
    writeFileSync(tmp, content, { encoding: 'utf8', flag: 'wx' });
    renameSync(tmp, file);
  } catch (err) {
    try {
      unlinkSync(tmp);
    } catch {
      // best effort cleanup; ignore
    }
    throw err;
  }
}

/**
 * Rewrite a frontmatter field (kebab-case key) to a boolean value, atomically.
 * Preserves unrelated frontmatter lines and the body verbatim; appends the
 * field when absent. Throws when the file has no frontmatter.
 */
export function setFrontmatterField(file: string, field: string, value: boolean): ParsedFrontmatter {
  const content = readFileSync(file, 'utf8');
  const fm = matchFrontmatter(content);
  invariant(fm, `no frontmatter found in ${file}`);
  const valueStr = value ? 'true' : 'false';
  const prefix = `${field}:`;
  const lines = fm.body.split(/\r?\n/);
  let found = false;
  const newLines = lines.map((line) => {
    if (line.startsWith(prefix)) {
      found = true;
      return `${prefix} ${valueStr}`;
    }
    return line;
  });
  if (!found) newLines.push(`${prefix} ${valueStr}`);
  const newContent = `---${fm.eol}${newLines.join(fm.eol)}${fm.eol}---${fm.eol}${fm.rest}`;
  atomicWrite(file, newContent);
  return parseFrontmatter(newContent);
}
