### Task 3: collect —— 三级来源收集

**Files:**
- Create: `plugins/dsh-knj-extension-center/src/collect.ts`
- Create: `plugins/dsh-knj-extension-center/tests/collect.test.ts`

**Interfaces:**
- Consumes: `parseFrontmatter` (Task 2).
- Produces:
  - `type SkillEntry = { name: string; description: string; whenToUse?: string; provider: string; level: 'bundled' | 'user-dsh' | 'runtime'; path?: string; linked: boolean; modelInvocable: boolean; userInvocable: boolean }`
  - `collectSkills(opts: { cwd: string; dshHome: string; registry: SkillRegistry; }): Promise<{ skills: SkillEntry[]; complete: boolean }>`
  - `SkillRegistry = { snapshot(opts: { cwd: string }): Promise<{ complete?: boolean; skills: RegistrySkill[] }> }`，`RegistrySkill = { name: string; description?: string; whenToUse?: string; provider?: string; source?: string; invocation?: { modelInvocable?: boolean; userInvocable?: boolean } }`

- [ ] **Step 1: 写失败测试**

```ts
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
});
```

- [ ] **Step 2: 跑测试确认失败**

- [ ] **Step 3: 实现**（从 skill-explorer `src/collect.ts` 移植并简化）：
  - `scanSkillRoot(root, level, into)`：只扫 `~/.dsh/skills`（`user-dsh` 级）；目录型 `<name>/SKILL.md` + `<name>.md` 单文件 + 符号链接（`linked=true`）；解析 frontmatter，`name` 校验 `^[a-z0-9][a-z0-9-]*$`。
  - 注册表补充：`registry.snapshot({ cwd })` 的 skills 按 `source` 映射 `bundled`/`runtime`（未知 source 归 `other:<source>` 并在 payload 丢弃或归 runtime——**本插件只保留 bundled/runtime**，其余 source 丢弃）；文件系统条目赢同名；注册表补 `whenToUse`/`invocation` 到已有条目。
  - `complete`：任一 snapshot 非 complete 则 false。

- [ ] **Step 4: 跑测试确认通过**

- [ ] **Step 5: 提交** —— `git commit -m "feat: collect skills from user root and registry"`

---
