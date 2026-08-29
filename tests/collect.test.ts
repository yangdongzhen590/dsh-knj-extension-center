import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, afterEach } from 'vitest';
import { collectSkills, type SkillRegistry } from '../src/collect';

const dirs: string[] = [];
function tmpDir() { const d = mkdtempSync(join(tmpdir(), 'col-')); dirs.push(d); return d; }
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

const registry: SkillRegistry = {
  async snapshot() {
    return {
      complete: true,
      skills: [
        { name: 'code-review', description: 'builtin', source: 'bundled', invocation: { modelInvocable: true } },
        { name: 'ux-scan', description: 'runtime', source: 'runtime', invocation: { modelInvocable: true } },
        { name: 'overlap', description: 'registry version', source: 'bundled' },
      ],
    };
  },
};

describe('collectSkills', () => {
  it('scans ~/.dsh/skills directory skills', async () => {
    const dsh = tmpDir();
    mkdirSync(join(dsh, 'skills', 'my-skill'), { recursive: true });
    writeFileSync(join(dsh, 'skills', 'my-skill', 'SKILL.md'), '---\nname: my-skill\ndescription: a skill\n---\nbody');
    const { skills } = await collectSkills({ cwd: tmpDir(), dshHome: dsh, registry });
    const found = skills.find(s => s.name === 'my-skill');
    expect(found).toBeDefined();
    expect(found!.level).toBe('user-dsh');
    expect(found!.path).toBe(join(dsh, 'skills', 'my-skill', 'SKILL.md'));
    expect(found!.modelInvocable).toBe(true);
  });
  it('includes bundled and runtime registry skills', async () => {
    const { skills } = await collectSkills({ cwd: tmpDir(), dshHome: tmpDir(), registry });
    expect(skills.some(s => s.name === 'code-review' && s.level === 'bundled')).toBe(true);
    expect(skills.some(s => s.name === 'ux-scan' && s.level === 'runtime')).toBe(true);
  });
  it('filesystem wins over registry on name conflict', async () => {
    const dsh = tmpDir();
    mkdirSync(join(dsh, 'skills', 'overlap'), { recursive: true });
    writeFileSync(join(dsh, 'skills', 'overlap', 'SKILL.md'), '---\nname: overlap\ndescription: filesystem version\n---\n');
    const { skills } = await collectSkills({ cwd: tmpDir(), dshHome: dsh, registry });
    const found = skills.find(s => s.name === 'overlap')!;
    expect(found.level).toBe('user-dsh');
    expect(found.description).toBe('filesystem version');
  });
  it('skips names violating kebab-case', async () => {
    const dsh = tmpDir();
    mkdirSync(join(dsh, 'skills', 'Bad Name'), { recursive: true });
    writeFileSync(join(dsh, 'skills', 'Bad Name', 'SKILL.md'), '---\nname: Bad Name\ndescription: x\n---\n');
    const { skills } = await collectSkills({ cwd: tmpDir(), dshHome: dsh, registry });
    expect(skills.some(s => s.name === 'Bad Name')).toBe(false);
  });
  it('skips dot-prefixed entries so trashed skills do not resurrect', async () => {
    const dsh = tmpDir();
    // Task 5 trash layout: .trash/<name>-<ts>/SKILL.md keeps a valid frontmatter name.
    mkdirSync(join(dsh, 'skills', '.trash', 'foo-123'), { recursive: true });
    writeFileSync(join(dsh, 'skills', '.trash', 'foo-123', 'SKILL.md'), '---\nname: foo\ndescription: trashed\n---\n');
    // A dot-prefixed top-level dir with a valid SKILL.md must also be skipped.
    mkdirSync(join(dsh, 'skills', '.hidden'), { recursive: true });
    writeFileSync(join(dsh, 'skills', '.hidden', 'SKILL.md'), '---\nname: hidden\ndescription: h\n---\n');
    // Control: a normal skill is still collected.
    mkdirSync(join(dsh, 'skills', 'foo'), { recursive: true });
    writeFileSync(join(dsh, 'skills', 'foo', 'SKILL.md'), '---\nname: foo\ndescription: live\n---\n');
    const { skills } = await collectSkills({ cwd: tmpDir(), dshHome: dsh, registry });
    expect(skills.some(s => s.name === 'hidden')).toBe(false);
    const foo = skills.find(s => s.name === 'foo');
    expect(foo).toBeDefined();
    expect(foo!.description).toBe('live');
    expect(foo!.path).toBe(join(dsh, 'skills', 'foo', 'SKILL.md'));
  });
});
