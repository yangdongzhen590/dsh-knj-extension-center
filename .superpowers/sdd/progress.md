# SDD ledger — plan: D:\workspace\iobs_pro\docs\superpowers\plans\2026-08-29-dsh-knj-extension-center.md

## Preflight scan (2026-08-29)

环境裁定：
- 工作区 D:\workspace\iobs_pro 是 SVN 管理（非 git）。Ruling: 在 plugins/dsh-knj-extension-center/ 内独立 git init（master，BASE 4ed74c3）支撑 SDD 的 commit/diff/review 流程；SVN 不受影响（.git 为局部子目录，交付说明提示可 svn:ignore）。错的话代价：SVN 状态里出现 .git 噪音，可清理。
- 本机无 bash；skill 的 sdd-workspace/task-brief/review-package 脚本用 pwsh 等效实现（手工提取 brief / git diff 重定向）。

计划修正（preflight 发现的接口缺陷，已改计划文本）：
- Task 1 package.json 缺 dependencies/devDependencies → 已补（yauzl/jszip 运行时 + 完整 devDeps）。Ruling: 计划原文只写了 peerDeps，构建/测试依赖缺失；错的话代价：implementer 无法装依赖。
- Task 1 tsdown entry 指向不存在的 src/client/index.ts → 计划已加最小占位 client 入口；Task 7 改为 Modify。Ruling: 无入口文件则 Task 1 构建必然失败。
- Task 4 installZip 签名含冗余 targetRoot → 简化为 baseDir。Ruling: 设计文档 §5 只有用户根安装，targetRoot 无需求对应；错的话代价：无。
- Task 6 makeRoutes deps 含 agentsHome 但无消费者 → 已移除。Ruling: 设计文档 §3.1 三级来源不含 agents 根；错的话代价：未来要加 agents 时再加参数。

待办衔接（dispatch 时携带）：
- Task 7 SkillApi.install(zip, overwrite) 的 body 形状 = Task 6 的 { zipBase64, overwrite, cwd }，dispatch Task 7 时说明。
- 所有 git 命令在插件目录内执行（git add .），非工作区根。

## 进度

Task 1: 待开始
