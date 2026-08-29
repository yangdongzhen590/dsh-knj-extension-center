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

describe('installZip security matrix', () => {
  it('rejects backslash entry paths (win32 traversal)', async () => {
    const root = tmpDir();
    const buf = await makeZip({ 'my-skill/SKILL.md': '---\nname: my-skill\ndescription: d\n---\n', 'my-skill\\..\\evil.txt': 'x' });
    await expect(installZip({ zipBuffer: buf, baseDir: root })).rejects.toThrow(/path/i);
    expect(existsSync(join(root, '..', 'evil.txt'))).toBe(false);
  });
  it('rejects drive-letter absolute paths', async () => {
    const root = tmpDir();
    const buf = await makeZip({ 'my-skill/SKILL.md': '---\nname: my-skill\ndescription: d\n---\n', 'C:/evil.txt': 'x' });
    await expect(installZip({ zipBuffer: buf, baseDir: root })).rejects.toThrow(/path/i);
  });
  it('rejects when a single entry exceeds maxTotalBytes (streaming budget)', async () => {
    const root = tmpDir();
    const big = 'x'.repeat(1024 * 1024); // ~1 MB, deflates to a few KB
    const buf = await makeZip({ 'my-skill/SKILL.md': '---\nname: my-skill\ndescription: d\n---\n', 'my-skill/big.txt': big });
    await expect(installZip({ zipBuffer: buf, baseDir: root, maxTotalBytes: 50 * 1024 })).rejects.toThrow(/size/i);
    expect(existsSync(join(root, 'my-skill'))).toBe(false);
  });
  it('rejects more files than maxFiles', async () => {
    const root = tmpDir();
    const entries: Record<string, string> = { 'my-skill/SKILL.md': '---\nname: my-skill\ndescription: d\n---\n' };
    for (let i = 0; i < 5; i++) entries[`my-skill/f${i}.md`] = 'x';
    const buf = await makeZip(entries);
    await expect(installZip({ zipBuffer: buf, baseDir: root, maxFiles: 3 })).rejects.toThrow(/files/i);
    expect(existsSync(join(root, 'my-skill'))).toBe(false);
  });
  it('rejects multiple top-level directories', async () => {
    const root = tmpDir();
    const buf = await makeZip({ 'a/SKILL.md': '---\nname: a\ndescription: d\n---\n', 'b/extra.md': 'x' });
    await expect(installZip({ zipBuffer: buf, baseDir: root })).rejects.toThrow(/layout/i);
  });
  it('rejects frontmatter name that differs from the directory name', async () => {
    const root = tmpDir();
    const buf = await makeZip({ 'real-name/SKILL.md': '---\nname: other-name\ndescription: d\n---\n' });
    await expect(installZip({ zipBuffer: buf, baseDir: root })).rejects.toThrow(/name/i);
  });
  it('rejects a package whose SKILL.md has no description', async () => {
    const root = tmpDir();
    const buf = await makeZip({ 'my-skill/SKILL.md': '---\nname: my-skill\n---\n' });
    await expect(installZip({ zipBuffer: buf, baseDir: root })).rejects.toThrow(ZipInstallError);
  });
  it('skips directory-marker entries while preserving structure', async () => {
    const root = tmpDir();
    const buf = await makeZip({
      'my-skill/': '',
      'my-skill/SKILL.md': '---\nname: my-skill\ndescription: d\n---\n',
      'my-skill/refs/': '',
      'my-skill/refs/a.md': 'x',
    });
    const res = await installZip({ zipBuffer: buf, baseDir: root });
    expect(res.name).toBe('my-skill');
    expect(existsSync(join(root, 'my-skill', 'SKILL.md'))).toBe(true);
    expect(readFileSync(join(root, 'my-skill', 'refs', 'a.md'), 'utf8')).toBe('x');
    const meta = await parseZipMetadata(buf);
    expect(meta.fileCount).toBe(2); // dir markers are not counted
  });
  it('parseZipMetadata passes whenToUse through', async () => {
    const buf = await makeZip({ 'my-skill/SKILL.md': '---\nname: my-skill\ndescription: d\nwhen-to-use: when needed\n---\n' });
    const meta = await parseZipMetadata(buf);
    expect(meta.whenToUse).toBe('when needed');
  });
});
