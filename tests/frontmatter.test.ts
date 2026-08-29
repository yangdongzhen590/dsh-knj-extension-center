import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, afterEach } from 'vitest';
import { parseFrontmatter, setFrontmatterField, yamlQuote } from '../src/frontmatter';

const dirs: string[] = [];
function tmpDir() { const d = mkdtempSync(join(tmpdir(), 'fm-')); dirs.push(d); return d; }
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

describe('parseFrontmatter', () => {
  it('parses scalar fields and booleans', () => {
    const fm = parseFrontmatter('---\nname: my-skill\ndescription: "Do things"\ndisable-model-invocation: true\nuser-invocable: false\n---\nbody');
    expect(fm.name).toBe('my-skill');
    expect(fm.description).toBe('Do things');
    expect(fm.disableModelInvocation).toBe(true);
    expect(fm.userInvocable).toBe(false);
  });
  it('parses | block scalar for description', () => {
    const fm = parseFrontmatter('---\ndescription: |\n  line one\n  line two\n---\n');
    expect(fm.description).toContain('line one');
    expect(fm.description).toContain('line two');
  });
  it('parses > folded block scalar for description', () => {
    const fm = parseFrontmatter('---\ndescription: >\n  line one\n  line two\n---\n');
    expect(fm.description).toBe('line one line two');
  });
  it('returns empty object when no frontmatter', () => {
    expect(parseFrontmatter('no frontmatter here')).toEqual({});
  });
});

describe('setFrontmatterField', () => {
  it('rewrites an existing field and preserves body verbatim', () => {
    const dir = tmpDir();
    const file = join(dir, 'SKILL.md');
    writeFileSync(file, '---\nname: a\n---\n\n# Title\nkeep me');
    setFrontmatterField(file, 'disable-model-invocation', true);
    const out = readFileSync(file, 'utf8');
    expect(out).toContain('disable-model-invocation: true');
    expect(out).toContain('# Title');
    expect(out).toContain('keep me');
  });
  it('appends the field when absent', () => {
    const dir = tmpDir();
    const file = join(dir, 'SKILL.md');
    writeFileSync(file, '---\nname: a\n---\nbody');
    setFrontmatterField(file, 'disable-model-invocation', true);
    expect(readFileSync(file, 'utf8')).toContain('disable-model-invocation: true');
  });
  it('throws when the file has no frontmatter', () => {
    const dir = tmpDir();
    const file = join(dir, 'SKILL.md');
    writeFileSync(file, 'plain');
    expect(() => setFrontmatterField(file, 'disable-model-invocation', true)).toThrow(/no frontmatter/);
  });
});

describe('yamlQuote', () => {
  it('wraps and doubles embedded quotes', () => {
    expect(yamlQuote("it's ok")).toBe("'it''s ok'");
  });
});
