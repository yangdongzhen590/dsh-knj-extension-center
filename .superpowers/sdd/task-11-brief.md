### Task 11: 详情视图

**Files:**
- Create: `plugins/dsh-knj-extension-center/src/client/views/DetailView.tsx`
- Create: `plugins/dsh-knj-extension-center/src/client/views/markdown-lite.ts`

**Interfaces:**
- Consumes: `api.detail(name)`。
- Produces:
  - `DetailView({ api, name, onBack, onUninstall, onToggle })`：返回按钮 + 技能图标/名称/徽标 + 路径（user → `~/.dsh/skills/<name>/SKILL.md`；bundled → 系统内置；runtime → 运行时注册）+ frontmatter 代码块 + 正文（`markdownLite` 渲染标题/列表/代码/粗体）+ 操作（复制路径/卸载/启停开关）。
  - `markdownLite(text): string`：仅支持 `#` 标题、`-` 列表、`` `code` ``、`**bold**`、`pre` 块——**XSS 安全**：先转义 HTML 再应用标记。

- [ ] **Step 1: 写失败测试**（jsdom：mock detail → 断言 frontmatter 与正文渲染；`markdownLite` 转义 `<script>`）

- [ ] **Step 2: 跑测试确认失败**

- [ ] **Step 3: 实现**：`markdownLite` 必须对输入先做 `escapeHtml`（`& < > " '`），再替换标记；禁止 `dangerouslySetInnerHTML` 直插未转义内容。

- [ ] **Step 4: 跑测试确认通过**

- [ ] **Step 5: 提交** —— `git commit -m "feat: detail view with escaped markdown-lite preview"`

---
