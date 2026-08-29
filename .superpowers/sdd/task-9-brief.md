### Task 9: 主区域替换视图 mount

**Files:**
- Create: `plugins/dsh-knj-extension-center/src/client/center-mount.tsx`
- Create: `plugins/dsh-knj-extension-center/tests/center-mount.test.tsx`（jsdom）

**Interfaces:**
- Consumes: 视图组件（Task 10-13）。
- Produces:
  - `mountCenterView(controller: { open(): void; close(): void; isOpen(): boolean }, api: SkillApi): { dispose(): void }`
  - 激活协议：`html[data-dsh-skill-center-active]` 控制显隐；`dsh-panel-activate` CustomEvent 互斥（收到其他面板激活事件 → close）；打开时派发自身激活事件；监听宿主会话列重建（MutationObserver 自愈，对齐 task-board `board-mount.tsx`）。
  - 视图容器挂载到 `[data-pane="conversation"], [class*=centerCol]`（旧/新 shell 选择器），`position: absolute; inset: 0; z-index: 60`。

- [ ] **Step 1: 写失败测试**（jsdom：mount 后容器出现；打开设 html 属性；其他面板激活事件关闭）

- [ ] **Step 2: 跑测试确认失败**

- [ ] **Step 3: 实现**：从 task-board `board-mount.tsx` 移植结构，替换激活属性与面板名（`dsh-skill-center`）；CSS 注入（style 标签）控制 `[data-dsh-skill-center-active]` 显隐 + 隐藏 conversation 列其他子元素（对齐 task-board CSS 规则）。

- [ ] **Step 4: 跑测试确认通过**

- [ ] **Step 5: 提交** —— `git commit -m "feat: center view mounts over conversation column"`

---
