### Task 13: 安装流程 —— 选择文件 / 确认卡 / 冲突浮层

**Files:**
- Create: `plugins/dsh-knj-extension-center/src/client/views/InstallFlow.tsx`
- Create: `plugins/dsh-knj-extension-center/src/client/views/ConflictDialog.tsx`

**Interfaces:**
- Consumes: `api.install(zip: File, overwrite: boolean)`、`jszip`（本地预览解析）、`api.detail/list`（冲突判定现有版本信息）。
- Produces:
  - `InstallFlow({ api, onDone, onCancel })`：三步步骤条（选择文件 → 确认信息 → 完成）。
    - 步骤 1：拖放区 + `input[type=file][accept=.zip]`；选文件后用 **jszip** 本地解析（`zip.file(...)` 找 `<name>/SKILL.md`，读 frontmatter 关键行 name/description）→ 进入步骤 2，**不上传**。
    - 步骤 2：确认卡（技能名 / 描述 / 目标位置固定 `~/.dsh/skills/<name>/` / 包内容文件清单）；「安装」→ `api.install(zip, false)`；若返回 `{ conflict: true, existing }` → 显示 `ConflictDialog`（现有版本/来源/路径 + 覆盖（旧版入回收站）/取消）。
    - 覆盖 → `api.install(zip, true)` → 步骤 3 成功卡（路径 + 旧版入回收站提示）→ 完成回列表刷新。
  - `ConflictDialog({ existing, onOverwrite, onCancel })`：视图内浮层（非浏览器 confirm），对齐设计稿冲突对话框。

- [ ] **Step 1: 写失败测试**（jsdom：jszip 解析 mock zip 出确认卡；install 返回 conflict → 浮层出现；overwrite 调用带 true）

- [ ] **Step 2: 跑测试确认失败**

- [ ] **Step 3: 实现**：样式对齐设计稿安装流程（步骤条/拖放区/确认卡/成功卡/冲突浮层）。

- [ ] **Step 4: 跑测试确认通过**

- [ ] **Step 5: 提交** —— `git commit -m "feat: install flow with local zip preview and conflict dialog"`

---
