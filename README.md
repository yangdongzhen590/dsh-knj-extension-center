# dsh-knj-extension-center（技能中心 · Skill Center）

DSH 技能中心插件：按区域浏览已加载的 skill、从 zip 安装新技能、管理（启用/禁用模型可调用、卸载入回收站、回收站恢复/彻底删除、搜索）。

- **宿主端（host）**：`/api/dsh-skill-center` 路由家族（list/install/set-enabled/uninstall/trash/detail），通过 loopback 信任围栏提供服务。
- **客户端（client）**：浏览器面板，挂载到主区域（center column），入口注册在侧边栏 knj-menu 区的「技能中心」行。

## 功能

| 功能 | 说明 |
| --- | --- |
| 浏览 | 按 系统内置（bundled）/ 用户技能（user-dsh）/ 运行时注册（runtime）三个区域分组展示；标题、描述、可调用徽标（模型/用户）、软链接徽标 |
| 搜索 | 服务端 `?q=` 搜索技能名称/描述，200ms 防抖，IME 合成期间暂停 |
| 详情 | 点击卡片进入详情：frontmatter 代码块 + 正文预览（markdown-lite，转义优先）；用户技能显示路径、模型可调用开关、复制路径、卸载。bundled/runtime 无文件路径，详情不可打开、只读 |
| 安装 | 上传 zip（≤8MB）：本地解析预览（单一 `<name>/SKILL.md`、kebab-case 名称、description 必填）→ 确认信息 → 完成；重名冲突弹窗支持「覆盖（旧版入回收站）」 |
| 启停 | 模型可调用开关改写 `disable-model-invocation`（仅文件技能） |
| 卸载 | 移入可恢复回收站（非永久删除） |
| 回收站 | 恢复 / 彻底删除 / 清空；restore 409（原路径被占用）等失败内联展示 |

## 安装

```bash
# 在插件目录打包并安装到 web profile
npm.cmd pack
dsh plugin --profile web add .\dsh-knj-extension-center-0.1.0.tgz
```

安装后重启 `dsh web`（或确认 HMR），浏览器打开 http://127.0.0.1:3080：
侧边栏 knj-menu 区出现「技能中心」入口 → 点击替换主区域为技能列表。

> 与 `@linxin666/dsh-client-ui-skill-explorer` 类插件的共存：挂载按包名隔离（mountOnce），入口均注册在 `knj.menu.item` 槽位，会并列显示。

## 卸载

```bash
dsh plugin --profile web remove dsh-knj-extension-center
```

## 安全模型要点

- 所有 REST 路由仅绑定 loopback 信任围栏（host webserver 注入），浏览器同源访问；每个非 2xx 响应转为 `ApiError` 携带宿主 `{ error }` 文本。
- 卸载是**移入回收站**而非删除；回收站清空/彻底删除才做永久删除，且需确认。
- 安装目标固定 `~/.dsh/skills/<name>/`；重名时默认拒绝，用户明确选择「覆盖」才将旧版本移入回收站后安装。
- 客户端 zip 预览与宿主校验镜像一致（kebab-case、单一顶层目录、`<name>/SKILL.md`、description 非空、8MB 上限），不上传前先做本地校验。
- 详情正文经 markdown-lite 转义后注入 DOM（escape-first，XSS 安全）。
- 客户端装配整体包 `applyGuard`：任何失败降级为 `console.warn`，不拖垮宿主 GUI；菜单项注册经 `slots.inject` 延迟到 `knj.menu.item` 槽位声明后再执行（宿主对未声明槽位注册会 throw），入口随 knj-menu 生命周期折叠。

## 路由表（host）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/dsh-skill-center/list` | 分组技能列表；`?q=` 搜索、`?level=` 过滤 |
| GET | `/api/dsh-skill-center/detail` | `?name=` 原始详情（frontmatter + body） |
| POST | `/api/dsh-skill-center/install` | zip base64 安装；`{ overwrite }` 覆盖 |
| POST | `/api/dsh-skill-center/set-enabled` | `{ name, path, enabled }` 模型可调用开关 |
| POST | `/api/dsh-skill-center/uninstall` | `{ name, path }` 卸载入回收站 |
| GET | `/api/dsh-skill-center/trash/list` | 回收站条目 |
| POST | `/api/dsh-skill-center/trash/restore` | `{ trashPath }` 恢复 |
| POST | `/api/dsh-skill-center/trash/purge` | `{ trashPath }` 彻底删除 |
| GET | `/api/dsh-skill-center/health` | 健康检查 |

## 开发

```bash
npm.cmd run build      # tsc(host) + tsdown(client bundle) → lib/
npm.cmd test           # vitest（node + jsdom）
npm.cmd run typecheck  # tsc --noEmit
```

客户端装配入口 `src/client/index.ts`：`apply(ctx)` 依次注册 locale 字典、挂载主区域视图（`CenterApp` 视图状态机：列表/详情/回收站/安装）、经 `slots.inject` 延迟注册 knj-menu 侧边栏入口；返回合并 disposer。
