### Task 5: trash —— 卸载 / 恢复 / 彻底删除

**Files:**
- Create: `plugins/dsh-knj-extension-center/src/trash.ts`
- Create: `plugins/dsh-knj-extension-center/tests/trash.test.ts`

**Interfaces:**
- Produces:
  - `trashSkillDir(skillDir: string): Promise<string>`（移入同级 `.trash/<name>-<timestamp>/`，返回 trash 路径）
  - `listTrash(skillsRoot: string): Promise<TrashItem[]>`，`TrashItem = { name: string; trashPath: string; originalPath: string; deletedAt: string; legacy: boolean }`（识别新格式目录 `.trash/<name>-<ts>/SKILL.md` 与旧格式 `.trash/<ts>-SKILL.md`）
  - `restoreTrashItem(item: TrashItem): Promise<string>`（rename 回 `originalPath`；原位已存在同名 → 抛错）
  - `purgeTrashItem(item: TrashItem): Promise<void>`（rm -rf）

- [ ] **Step 1: 写失败测试**

```ts
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, afterEach } from 'vitest';
import { trashSkillDir, listTrash, restoreTrashItem, purgeTrashItem } from '../src/trash';

const dirs: string[] = [];
function tmpDir() { const d = mkdtempSync(join(tmpdir(), 'tr-')); dirs.push(d); return d; }
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

describe('trash cycle', () => {
  it('moves dir into .trash preserving name, restores back', async () => {
    const root = tmpDir();
    const dir = join(root, 'my-skill');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'SKILL.md'), '---\nname: my-skill\ndescription: d\n---\n');
    const trashPath = await trashSkillDir(dir);
    expect(existsSync(dir)).toBe(false);
    expect(trashPath).toContain('.trash');
    const items = await listTrash(root);
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe('my-skill');
    expect(items[0].legacy).toBe(false);
    await restoreTrashItem(items[0]);
    expect(existsSync(join(root, 'my-skill', 'SKILL.md'))).toBe(true);
  });
  it('detects legacy single-file trash format', async () => {
    const root = tmpDir();
    mkdirSync(join(root, '.trash'), { recursive: true });
    writeFileSync(join(root, '.trash', '1720000000000-SKILL.md'), '---\nname: old\ndescription: d\n---\n');
    const items = await listTrash(root);
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe('old');
    expect(items[0].legacy).toBe(true);
  });
  it('restore refuses when the original path is occupied', async () => {
    const root = tmpDir();
    const dir = join(root, 'my-skill');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'SKILL.md'), '---\nname: my-skill\ndescription: d\n---\n');
    const trashPath = await trashSkillDir(dir);
    mkdirSync(dir, { recursive: true }); // 原位被新技能占据
    writeFileSync(join(dir, 'SKILL.md'), '---\nname: my-skill\ndescription: newer\n---\n');
    const items = await listTrash(root);
    await expect(restoreTrashItem(items[0])).rejects.toThrow(/occupied|exists/i);
  });
  it('purges permanently', async () => {
    const root = tmpDir();
    const dir = join(root, 'gone');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'SKILL.md'), '---\nname: gone\ndescription: d\n---\n');
    await trashSkillDir(dir);
    const items = await listTrash(root);
    await purgeTrashItem(items[0]);
    expect(await listTrash(root)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

- [ ] **Step 3: 实现**（`node:fs/promises`）：
  - `trashSkillDir`：`mkdir .trash` + `rename(dir, join('.trash', \`${basename(dir)}-${Date.now()}\`))`。若 rename 目标已存在（同毫秒）追加随机后缀。
  - `listTrash`：读 `.trash`；目录项且含 `SKILL.md` → 新格式，`originalPath = join(dirname(.trash), name)`（name 取目录名 `-<ts>` 前缀：`name.replace(/-\d+$/, '')`）；`<ts>-SKILL.md` 单文件 → legacy，解析 frontmatter 取名，`originalPath` 未知（恢复时报错提示手移，或按 `join(root, name)` 尝试）。
  - `restoreTrashItem`：目标存在 → 抛 `Error('original path occupied')`；否则 rename。
  - `purgeTrashItem`：`rm(trashPath, { recursive: true, force: true })`。

- [ ] **Step 4: 跑测试确认通过**

- [ ] **Step 5: 提交** —— `git commit -m "feat: recoverable trash (uninstall/restore/purge)"`

---
