### Task 4: zip-install —— 解压安装 + zip-slip 防护

**Files:**
- Create: `plugins/dsh-knj-extension-center/src/zip-install.ts`
- Create: `plugins/dsh-knj-extension-center/tests/zip-install.test.ts`

**Interfaces:**
- Consumes: `parseFrontmatter` (Task 2)。
- Produces:
  - `parseZipMetadata(zipBuffer: Buffer): Promise<ZipMetadata>`，`ZipMetadata = { name: string; description: string; whenToUse?: string; fileCount: number; entries: string[] }`（只读，不落盘）
  - `installZip(opts: { zipBuffer: Buffer; baseDir: string; maxZipBytes?: number; maxTotalBytes?: number; maxFiles?: number }): Promise<{ name: string; targetDir: string }>`，baseDir 是用户根（`~/.dsh/skills`），解压目标 `join(baseDir, name)`。校验失败抛 `ZipInstallError`（含具体原因），**不落盘**。

- [ ] **Step 1: 写失败测试**

```ts
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, afterEach } from 'vitest';
import JSZip from 'jszip';
import { installZip, parseZipMetadata, ZipInstallError } from '../src/zip-install';

const dirs: string[] = [];
function tmpDir() { const d = mkdtempSync(join(tmpdir(), 'zip-')); dirs.push(d); return d; }
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

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
    await expect(installZip({ zipBuffer: buf, targetRoot: root, baseDir: root })).rejects.toThrow(/path/i);
    expect(existsSync(join(root, '..', 'evil.txt'))).toBe(false);
  });
  it('rejects absolute paths', async () => {
    const root = tmpDir();
    const buf = await makeZip({ 'my-skill/SKILL.md': '---\nname: my-skill\ndescription: d\n---\n', '/abs/evil.txt': 'x' });
    await expect(installZip({ zipBuffer: buf, targetRoot: root, baseDir: root })).rejects.toThrow(/path/i);
  });
  it('rejects non-root skill layout (file at zip root)', async () => {
    const root = tmpDir();
    const buf = await makeZip({ 'SKILL.md': '---\nname: flat\ndescription: d\n---\n' });
    await expect(installZip({ zipBuffer: buf, targetRoot: root, baseDir: root })).rejects.toThrow(/layout|directory/i);
  });
  it('rejects when frontmatter name is not kebab-case', async () => {
    const root = tmpDir();
    const buf = await makeZip({ 'Bad Name/SKILL.md': '---\nname: Bad Name\ndescription: d\n---\n' });
    await expect(installZip({ zipBuffer: buf, targetRoot: root, baseDir: root })).rejects.toThrow(/name/i);
  });
  it('rejects oversize archive', async () => {
    const root = tmpDir();
    const buf = await makeZip({ 'my-skill/SKILL.md': '---\nname: my-skill\ndescription: d\n---\n' });
    await expect(installZip({ zipBuffer: buf, targetRoot: root, baseDir: root, maxZipBytes: 10 })).rejects.toThrow(/size/i);
  });
  it('leaves nothing on disk after failure', async () => {
    const root = tmpDir();
    const buf = await makeZip({ 'my-skill/SKILL.md': '---\nname: my-skill\ndescription: d\n---\n', '../evil.txt': 'x' });
    await expect(installZip({ zipBuffer: buf, targetRoot: root, baseDir: root })).rejects.toThrow();
    expect(existsSync(join(root, 'my-skill'))).toBe(false);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

- [ ] **Step 3: 实现**：
  - 用 `yauzl` 流式读取：`yauzl.fromBuffer(zipBuffer, { lazyEntries: true })`，`entry` 事件循环。
  - 路径校验函数 `assertSafeEntryPath(entryPath, skillName)`：拒绝绝对路径（`/` 开头、盘符 `^[A-Za-z]:`）、`..` 段、空段异常；顶层必须恰为 `<skillName>/`（`entry.fileName.split('/')[0] === skillName`，且首段后不再有 `..`）。
  - 校验 frontmatter：`<skillName>/SKILL.md` 必须存在、`parseFrontmatter` 的 name 与 skillName 一致且 kebab-case、description 非空。
  - 限制：`zipBuffer.length ≤ maxZipBytes ?? 8MB`；累计解压字节 ≤ `maxTotalBytes ?? 16MB`；文件数 ≤ `maxFiles ?? 200`。
  - 先全部校验（含解析）→ 通过后统一解压写入（mkdir -p + writeFile，每个文件单独原子写）。任一失败抛 `ZipInstallError` 且不落盘（校验阶段不写，解压阶段失败则 `rmSync(targetDir, { recursive: true, force: true })` 清理）。
  - `parseZipMetadata` 只跑校验与解析，不写盘。

- [ ] **Step 4: 跑测试确认通过**

- [ ] **Step 5: 提交** —— `git commit -m "feat: zip install with zip-slip protection"`

---
