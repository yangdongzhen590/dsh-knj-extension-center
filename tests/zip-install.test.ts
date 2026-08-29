import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, afterEach } from 'vitest';
import JSZip from 'jszip';
import { installZip, parseZipMetadata, ZipInstallError } from '../src/zip-install';

const dirs: string[] = [];
function tmpDir() { const d = mkdtempSync(join(tmpdir(), 'zip-')); dirs.push(d); return d; }
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

// Note: installZip's options interface takes `baseDir` (the skills root); there
// is no separate `targetRoot` option, so rejection tests pass `baseDir: root`.

async function makeZip(entries: Record<string, string>): Promise<Buffer> {
  const zip = new JSZip();
  for (const [p, c] of Object.entries(entries)) zip.file(p, c);
  return Buffer.from(await zip.generateAsync({ type: 'nodebuffer' }));
}

describe('parseZipMetadata', () => {
  it('reads name and description from the single skill dir', async () => {
    const buf = await makeZip({ 'my-skill/SKILL.md': '---\nname: my-skill\ndescription: hello skill\n---\nbody', 'my-skill/references/a.md': 'x' });
    const meta = await parseZipMetadata(buf);
    expect(meta.name).toBe('my-skill');
    expect(meta.description).toBe('hello skill');
    expect(meta.fileCount).toBe(2);
  });
  it('rejects a zip without a valid SKILL.md', async () => {
    const buf = await makeZip({ 'README.md': 'no skill here' });
    await expect(parseZipMetadata(buf)).rejects.toThrow(ZipInstallError);
  });
});

describe('installZip', () => {
  it('extracts into targetRoot/name preserving structure', async () => {
    const root = tmpDir();
    const buf = await makeZip({ 'my-skill/SKILL.md': '---\nname: my-skill\ndescription: d\n---\nbody', 'my-skill/references/r.md': 'ref' });
    const res = await installZip({ zipBuffer: buf, baseDir: root });
    expect(res.name).toBe('my-skill');
    expect(existsSync(join(root, 'my-skill', 'SKILL.md'))).toBe(true);
    expect(readFileSync(join(root, 'my-skill', 'references', 'r.md'), 'utf8')).toBe('ref');
  });
  it('rejects zip-slip paths (../ traversal)', async () => {
    const root = tmpDir();
    const buf = await makeZip({ 'my-skill/SKILL.md': '---\nname: my-skill\ndescription: d\n---\n', '../evil.txt': 'pwn' });
    await expect(installZip({ zipBuffer: buf, baseDir: root })).rejects.toThrow(/path/i);
    expect(existsSync(join(root, '..', 'evil.txt'))).toBe(false);
  });
  it('rejects absolute paths', async () => {
    const root = tmpDir();
    const buf = await makeZip({ 'my-skill/SKILL.md': '---\nname: my-skill\ndescription: d\n---\n', '/abs/evil.txt': 'x' });
    await expect(installZip({ zipBuffer: buf, baseDir: root })).rejects.toThrow(/path/i);
  });
  it('rejects non-root skill layout (file at zip root)', async () => {
    const root = tmpDir();
    const buf = await makeZip({ 'SKILL.md': '---\nname: flat\ndescription: d\n---\n' });
    await expect(installZip({ zipBuffer: buf, baseDir: root })).rejects.toThrow(/layout|directory/i);
  });
  it('rejects when frontmatter name is not kebab-case', async () => {
    const root = tmpDir();
    const buf = await makeZip({ 'Bad Name/SKILL.md': '---\nname: Bad Name\ndescription: d\n---\n' });
    await expect(installZip({ zipBuffer: buf, baseDir: root })).rejects.toThrow(/name/i);
  });
  it('rejects oversize archive', async () => {
    const root = tmpDir();
    const buf = await makeZip({ 'my-skill/SKILL.md': '---\nname: my-skill\ndescription: d\n---\n' });
    await expect(installZip({ zipBuffer: buf, baseDir: root, maxZipBytes: 10 })).rejects.toThrow(/size/i);
  });
  it('leaves nothing on disk after failure', async () => {
    const root = tmpDir();
    const buf = await makeZip({ 'my-skill/SKILL.md': '---\nname: my-skill\ndescription: d\n---\n', '../evil.txt': 'x' });
    await expect(installZip({ zipBuffer: buf, baseDir: root })).rejects.toThrow();
    expect(existsSync(join(root, 'my-skill'))).toBe(false);
  });
});
