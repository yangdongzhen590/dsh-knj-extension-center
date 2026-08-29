### Task 8: knj.menu.item 菜单项注册

**Files:**
- Create: `plugins/dsh-knj-extension-center/src/client/menu-entry.tsx`
- Create: `plugins/dsh-knj-extension-center/tests/menu-entry.test.tsx`（jsdom）

**Interfaces:**
- Consumes: `slots`（client ctx.get('slots')）。
- Produces:
  - `registerMenuEntry(slots: SlotsLike, onToggle: () => void): () => void` —— 调 `slots.register({ name: 'knj.menu.item', id: 'skill-center', order: -20, locale: 'zh' }, () => <SkillCenterEntry onClick={onToggle} />)`，返回 disposer。
  - `SkillCenterEntry({ onClick })`：React 组件渲染一行（图标 + 「技能中心」文案 + 激活态 `data-active`），点击 `onClick()`。

- [ ] **Step 1: 写失败测试**（jsdom 渲染组件 + 断言 slots.register 收到正确 options）

```tsx
/** @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react'; // 或 react-dom/client + act
```

（若测试栈不引入 @testing-library/react，用 `react-dom/client` + `act` 手动渲染到容器。）

- [ ] **Step 2: 跑测试确认失败**

- [ ] **Step 3: 实现**：菜单项组件样式对齐设计稿侧边栏（36px 行、hover 态、激活高亮）；`slots.register` 签名与 dsh-knj-menu client.js 一致（`{ name: 'knj.menu.item', id, order, locale }` + component）。注册失败（slots 缺失）→ `applyGuard` 捕获。

- [ ] **Step 4: 跑测试确认通过**

- [ ] **Step 5: 提交** —— `git commit -m "feat: register skill-center entry into knj.menu.item"`

---
