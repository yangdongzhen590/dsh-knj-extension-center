### Task 7: client 基础 —— api / locales / apply-guard

**Files:**
- Create: `plugins/dsh-knj-extension-center/src/client/api.ts`
- Create: `plugins/dsh-knj-extension-center/src/client/locales.ts`
- Create: `plugins/dsh-knj-extension-center/src/client/apply-guard.ts`
- Create: `plugins/dsh-knj-extension-center/src/client/css-modules.d.ts`
- Modify: `plugins/dsh-knj-extension-center/src/client/index.ts`（替换 Task 1 的占位为真实装配入口）

**Interfaces:**
- Produces:
  - `SkillApi`：`list(opts?: { q?: string; level?: string }): Promise<ListPayload>`、`detail(name: string): Promise<DetailPayload>`、`setEnabled(name, path, enabled): Promise<void>`、`uninstall(name, path): Promise<void>`、`install(zip: File, overwrite: boolean): Promise<InstallResult>`、`trashList(): Promise<TrashPayload>`、`trashRestore(trashPath: string)`、`trashPurge(trashPath: string)`；错误抛 `ApiError`。
  - `ListPayload = { cwd: string; groups: Group[]; complete: boolean }`，`Group = { key: string; title: string; hint: string; skills: SkillItem[] }`，`SkillItem = { name; description; whenToUse?; provider?; level; path?; linked; modelInvocable; userInvocable }`。
  - `DetailPayload = { name; description; whenToUse?; level; path?; linked; modelInvocable; userInvocable; frontmatter: string; body: string }`。
  - `locales.ts`：`zh` / `en` 字典 + `SkillCenterKey` 类型；文案键全部来自 UI 设计稿（entry.label / panel / 视图 / 安装流程 / 冲突 / 回收站 / toast）。
  - `applyGuard(fn)`：try/catch 包裹 client apply 主体，失败 `console.warn` 不抛（外部插件不得拖垮 GUI）。

- [ ] **Step 1: 写失败测试**（用 `fetch` mock 断言 api 请求形状与错误处理）

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SkillApi, ApiError } from '../src/client/api';

describe('SkillApi', () => {
  it('list sends q and level query params', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ cwd: '/x', groups: [], complete: true }) });
    vi.stubGlobal('fetch', fetchMock);
    const api = new SkillApi();
    await api.list({ q: 'test', level: 'user' });
    expect(fetchMock.mock.calls[0][0]).toContain('q=test');
    expect(fetchMock.mock.calls[0][0]).toContain('level=user');
    vi.unstubAllGlobals();
  });
  it('throws ApiError with host message on failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: 'forbidden' }) }));
    const api = new SkillApi();
    await expect(api.list({})).rejects.toMatchObject({ message: 'forbidden' });
    vi.unstubAllGlobals();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

- [ ] **Step 3: 实现**：`api.ts` 封装 same-origin fetch（JSON body），错误抛 `ApiError`；`install` 用 `File` 转 `arrayBuffer` → base64。`locales.ts` 字典内容以 UI 设计稿文案为准（zh 主源）。`apply-guard.ts` 参考 task-board `apply-guard.ts`。`css-modules.d.ts` 声明 `*.module.css` 导出 string map。

- [ ] **Step 4: 跑测试确认通过**

- [ ] **Step 5: 提交** —— `git commit -m "feat: client api + locales + apply guard"`

---
