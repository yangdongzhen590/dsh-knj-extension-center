### Task 14: client 装配 + 集成验证

**Files:**
- Modify: `plugins/dsh-knj-extension-center/src/client/index.ts`
- Create: `plugins/dsh-knj-extension-center/README.md`
- Modify: `plugins/dsh-knj-extension-center/package.json`（version 0.1.0 保持）

**Interfaces:**
- Consumes: 全部 Task 7-13。
- Produces:
  - `apply(ctx)`：`ctx.locale.register('dsh-skill-center', { zh, en })` → `registerMenuEntry(slots, toggle)`（toggle = `center.toggle()`）→ `mountCenterView(controller, api)`；全部包 `applyGuard`，disposer 汇总。

- [ ] **Step 1: 写失败测试**（jsdom：`apply` 用 mock ctx（slots/locale stub）→ 断言 locale 注册与菜单项注册被调用、无 throw）

- [ ] **Step 2: 跑测试确认失败**

- [ ] **Step 3: 实现** `src/client/index.ts` 装配 + README（安装/卸载/功能说明）。

- [ ] **Step 4: 构建 + 全量测试**

Run: `npm.cmd run build && npm.cmd test && npm.cmd run typecheck`
Expected: 全部通过；`lib/index.js` + `lib/client.js` 产出。

- [ ] **Step 5: 安装到 web profile 实测**

```bash
# 在 plugins/dsh-knj-extension-center 下打包
npm.cmd pack
# 安装到 web profile
dsh plugin --profile web add .\dsh-knj-extension-center-0.1.0.tgz
```

重启 `dsh web`（或确认 HMR），浏览器打开 http://127.0.0.1:3080：侧边栏 knj-menu 区出现「技能中心」入口 → 点击替换主区域 → 实测列表/搜索/详情/回收站/安装流程（用设计稿同款 zip 包）。

- [ ] **Step 6: 提交** —— `git commit -m "feat: assemble client and verify in web profile"`

---
