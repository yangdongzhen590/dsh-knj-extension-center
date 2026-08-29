### Task 2: frontmatter 解析与原子改写

**Files:**
- Create: `plugins/dsh-knj-extension-center/src/frontmatter.ts`
- Create: `plugins/dsh-knj-extension-center/tests/frontmatter.test.ts`

**Interfaces:**
- Consumes: `invariant` from Task 1.
- Produces:
  - `parseFrontmatter(content: string): ParsedFrontmatter`，`ParsedFrontmatter = { name?: string; description?: string; whenToUse?: string; disableModelInvocation?: boolean; userInvocable?: boolean }`
  - `setFrontmatterField(file: string, field: string, value: boolean): ParsedFrontmatter`（原子改写，tmp 写入 + rename）
  - `yamlQuote(value: string): string`（单引号包裹、双写内嵌单引号）

- [ ] **Step 1: 写失败测试**（覆盖：标量解析、`|`/`>` 块标量、布尔解析、无 frontmatter 返回空、setFrontmatterField 保留正文与无关行、追加缺失字段、无 frontmatter 时抛错）

```ts
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
```

- [ ] **Step 2: 跑测试确认失败** —— `Cannot find module '../src/frontmatter'`

- [ ] **Step 3: 实现**（从 skill-explorer `src/frontmatter.ts` 移植，接口如上；`setFrontmatterField` 用 `writeFileSync(tmp, ..., { flag: 'wx' })` + `renameSync`，失败清理 tmp）

- [ ] **Step 4: 跑测试确认通过** —— `npm.cmd test` PASS

- [ ] **Step 5: 提交** —— `git commit -m "feat: frontmatter parse and atomic field rewrite"`

---
