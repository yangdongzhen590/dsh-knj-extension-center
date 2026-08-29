### Task 10: 列表视图 —— 卡片网格 + 搜索 + 三区域直排

**Files:**
- Create: `plugins/dsh-knj-extension-center/src/client/views/ListView.tsx`
- Create: `plugins/dsh-knj-extension-center/src/client/views/SkillCard.tsx`
- Create: `plugins/dsh-knj-extension-center/src/client/views/skill-center.module.css`
- Create: `plugins/dsh-knj-extension-center/src/client/views/GroupSection.tsx`

**Interfaces:**
- Consumes: `SkillApi`、`ListPayload`、locales。
- Produces:
  - `ListView({ api, onOpenDetail(name), onStartInstall(), onOpenTrash(), onChanged() })`：加载列表 → 渲染搜索框 + 三区域（`GroupSection`：系统内置 / 用户技能（~/.dsh/skills）/ 运行时注册，可折叠，标题含计数与 hint）+ `SkillCard` 网格；搜索输入过滤（调 `api.list({ q })` 或本地过滤——**实现用服务端 `?q=`**，输入防抖 200ms）。
  - `SkillCard({ skill, onOpen, onToggle, onUninstall })`：名称/描述/徽标（可调用：模型·用户 / 软链接）/启停开关（`role=switch` + `aria-checked`）/复制路径/卸载按钮；点击卡片 → 详情。路径为 undefined（bundled/runtime）时不显示开关与卸载。
  - 空状态、加载态、错误反馈（来自 locales）。

- [ ] **Step 1: 写失败测试**（jsdom：mock api.list 返回两区域数据 → 断言分组标题与卡片渲染；点击卡片回调 onOpenDetail；搜索输入触发带 q 的 api 调用）

- [ ] **Step 2: 跑测试确认失败**

- [ ] **Step 3: 实现**：样式从 `dsh-extension-center-ui.html` 设计稿移植（CSS Modules 化，`--dsw-alias-*` 变量；卡片 hover 阴影；分组折叠 chevron）。

- [ ] **Step 4: 跑测试确认通过**

- [ ] **Step 5: 提交** —— `git commit -m "feat: list view with card grid, search, region groups"`

---
