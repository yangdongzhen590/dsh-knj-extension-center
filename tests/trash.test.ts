import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync } from 'node:fs';
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
  it('recognizes new single-file trash format (<name>.md-<ts>) and restores the file', async () => {
    const root = tmpDir();
    const file = join(root, 'demo.md');
    writeFileSync(file, '---\nname: demo\ndescription: d\n---\nbody');
    const trashPath = await trashSkillDir(file);
    expect(existsSync(file)).toBe(false);
    expect(trashPath).toMatch(/[\\/]\.trash[\\/]demo\.md-\d+$/);
    const items = await listTrash(root);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      name: 'demo',
      originalPath: join(root, 'demo.md'),
      legacy: false,
    });
    await restoreTrashItem(items[0]);
    expect(readFileSync(join(root, 'demo.md'), 'utf8')).toBe('---\nname: demo\ndescription: d\n---\nbody');
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
  it('parses dir names with the same-millisecond random suffix and restores to the real original', async () => {
    const root = tmpDir();
    mkdirSync(join(root, '.trash', 'my-skill-1720000000000-abc123'), { recursive: true });
    writeFileSync(join(root, '.trash', 'my-skill-1720000000000-abc123', 'SKILL.md'), '---\nname: my-skill\ndescription: d\n---\n');
    const items = await listTrash(root);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ name: 'my-skill', originalPath: join(root, 'my-skill'), deletedAt: '1720000000000', legacy: false });
    await restoreTrashItem(items[0]);
    expect(existsSync(join(root, 'my-skill', 'SKILL.md'))).toBe(true);
    expect(existsSync(join(root, '.trash', 'my-skill-1720000000000-abc123'))).toBe(false);
  });
  it('parses single-file names with the same-millisecond random suffix and restores the .md', async () => {
    const root = tmpDir();
    mkdirSync(join(root, '.trash'), { recursive: true });
    writeFileSync(join(root, '.trash', 'demo.md-1720000000000-abc123'), '---\nname: demo\ndescription: d\n---\nbody');
    const items = await listTrash(root);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ name: 'demo', originalPath: join(root, 'demo.md'), deletedAt: '1720000000000', legacy: false });
    await restoreTrashItem(items[0]);
    expect(readFileSync(join(root, 'demo.md'), 'utf8')).toBe('---\nname: demo\ndescription: d\n---\nbody');
  });
  it('parses skill names that end in digits (my-skill-2) without the collision suffix', async () => {
    const root = tmpDir();
    mkdirSync(join(root, '.trash', 'my-skill-2-1720000000000'), { recursive: true });
    writeFileSync(join(root, '.trash', 'my-skill-2-1720000000000', 'SKILL.md'), '---\nname: my-skill-2\ndescription: d\n---\n');
    const items = await listTrash(root);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ name: 'my-skill-2', originalPath: join(root, 'my-skill-2') });
  });
});
