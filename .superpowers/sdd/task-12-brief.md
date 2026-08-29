### Task 12: 回收站视图

**Files:**
- Create: `plugins/dsh-knj-extension-center/src/client/views/TrashView.tsx`

**Interfaces:**
- Consumes: `api.trashList()` / `api.trashRestore(trashPath)` / `api.trashPurge(trashPath)`。
- Produces:
  - `TrashView({ api, onBack, onChanged })`：条目列表（名称/路径/删除时间 + 恢复 / 彻底删除按钮）；恢复失败（原位被占）→ 显示错误提示（409 message）；彻底删除二次确认（`window.confirm`）；空态「回收站是空的」；顶栏「清空回收站」（遍历 purge，二次确认）。

- [ ] **Step 1: 写失败测试**（jsdom：mock 列表渲染；恢复调 api；purge 确认后调 api）

- [ ] **Step 2: 跑测试确认失败**

- [ ] **Step 3: 实现**：样式对齐设计稿回收站视图。

- [ ] **Step 4: 跑测试确认通过**

- [ ] **Step 5: 提交** —— `git commit -m "feat: trash view with restore and purge"`

---
