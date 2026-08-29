### Task 6: routes —— 宿主 REST API + loopback 围栏

**Files:**
- Create: `plugins/dsh-knj-extension-center/src/loopback.ts`
- Create: `plugins/dsh-knj-extension-center/src/http.ts`
- Create: `plugins/dsh-knj-extension-center/src/mount-once.ts`
- Create: `plugins/dsh-knj-extension-center/src/routes.ts`
- Modify: `plugins/dsh-knj-extension-center/src/index.ts`
- Create: `plugins/dsh-knj-extension-center/tests/routes.test.ts`

**Interfaces:**
- Consumes: `collectSkills` (Task 3)、`installZip`/`parseZipMetadata` (Task 4)、trash 模块 (Task 5)、`setFrontmatterField` (Task 2)。
- Produces:
  - `makeRoutes(ctx, deps): Route[]`，`Route = { kind: 'exact'; path: string; handler(req, res): Promise<void> }`
  - 路由表：`GET /api/dsh-skill-center/list`、`POST /api/dsh-skill-center/install`、`POST /api/dsh-skill-center/set-enabled`、`POST /api/dsh-skill-center/uninstall`、`GET /api/dsh-skill-center/trash/list`、`POST /api/dsh-skill-center/trash/restore`、`POST /api/dsh-skill-center/trash/purge`、`GET /api/dsh-skill-center/detail`、`GET /api/dsh-skill-center/health`
  - `ROUTES` 常量（client 镜像）
  - `isLoopbackRequest(req)`、`readJsonBody(req, opts)`（上限默认 8MB，超限 destroy 返回 null）、`writeJson(res, status, body)`
  - `index.ts` 的 `apply(ctx, config)` 用 `mountOnce` 包装，注册路由。

- [ ] **Step 1: 写失败测试**（用 mock ctx + node http 请求模拟）

```ts
import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { makeRoutes, ROUTES } from '../src/routes';
import { collectSkills } from '../src/collect';

// mock ctx：webServer.register 收集路由；skills/sessions 用最小 stub
function makeCtx(handlers: Route[]) {
  return {
    webServer: { register: (r: Route) => { handlers.push(r); return () => {}; } },
    logger: { warn: () => {} },
    get: () => undefined,
  };
}

// 用真实 http 请求打到路由 handler 的辅助：构造 req/res 双端
function request(handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>, method: string, url: string, body?: unknown, headers: Record<string,string> = {}) {
  return new Promise<{ status: number; json: any }>((resolve, reject) => {
    const server: Server = createServer((req, res) => { handler(req as any, res as any); });
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as any;
      const payload = body === undefined ? undefined : JSON.stringify(body);
      const req = (globalThis as any).fetch as any; // 占位，用 http.request
      const http = require('node:http');
      const r = http.request({ host: '127.0.0.1', port: addr.port, method, path: url, headers: { 'host': '127.0.0.1:3080', 'sec-fetch-site': 'same-origin', ...(payload ? { 'content-type': 'application/json' } : {}), ...headers } }, (res) => {
        let data = ''; res.on('data', (c) => data += c); res.on('end', () => { server.close(); resolve({ status: res.statusCode!, json: JSON.parse(data) }); });
      });
      if (payload) r.write(payload);
      r.end();
    });
  });
}

describe('skill-center routes', () => {
  it('list returns grouped skills with correct cwd', async () => {
    const dsh = mkdtempSync(join(tmpdir(), 'rt-'));
    mkdirSync(join(dsh, 'skills', 'demo'), { recursive: true });
    writeFileSync(join(dsh, 'skills', 'demo', 'SKILL.md'), '---\nname: demo\ndescription: demo skill\n---\n');
    const handlers: Route[] = [];
    const ctx = makeCtx(handlers);
    const routes = makeRoutes(ctx as any, { dshHome: dsh, registry: { snapshot: async () => ({ skills: [], complete: true }) }, activeSessionCwds: () => [], logger: { warn: () => {} } });
    const listHandler = routes.find(r => r.path === ROUTES.list)!.handler;
    const res = await request(listHandler, 'GET', ROUTES.list + '?cwd=' + encodeURIComponent(tmpdir()));
    expect(res.status).toBe(200);
    expect(res.json.groups.some((g: any) => g.skills.some((s: any) => s.name === 'demo'))).toBe(true);
    rmSync(dsh, { recursive: true, force: true });
  });
  it('set-enabled rewrites frontmatter', async () => {
    // 建技能 → set-enabled false → 重读文件断言 disable-model-invocation: true
  });
  it('uninstall moves into trash', async () => {
    // 建技能 → uninstall → 断言原位消失、trash/list 有条目
  });
  it('install rejects invalid zip with 400 and leaves no files', async () => {
    // POST install 带损坏 zip → 400
  });
  it('detail returns frontmatter text for a user skill', async () => {
    // GET detail?name=demo → 200 含 body
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

- [ ] **Step 3: 实现**：
  - `loopback.ts`：从 skill-explorer `src/loopback.ts` 原样移植（`isIPv4Loopback` / `isLoopbackAddress` / `isLoopbackHostname` / `isLoopbackRequest`）。
  - `http.ts`：`readJsonBody`（默认 maxBytes 8MB，超限 `req.destroy()` 返回 null，`objectOnly` 支持）+ `writeJson` + `isJsonObject`。
  - `mount-once.ts`：`mountOnce(packageName, fn)` 全局 Symbol 守卫，原样移植。
  - `routes.ts`：
    - `guard(req, res, method)`：非 loopback → 403 `{ error: 'forbidden: loopback-only' }`；方法不符 → 405。
    - `collectOptions(cwd)` → `{ cwd, dshHome, agentsHome, registry, activeSessionCwds }`。
    - `findSkill(name, cwd)`：fresh `collectSkills`，按名找。
    - `resolveMutationSkill(name, expectedPath, cwd, res)`：path 为 undefined → 404；path !== expectedPath → 409。
    - `list`：`?q=` 搜索（name/description 包含，大小写不敏感）、`?level=` 过滤（bundled/user-dsh/runtime），返回 `{ cwd, groups: [{ key, title, hint, skills }], complete }`。
    - `install`：body `{ zipBase64, cwd }`；`Buffer.from(zipBase64, 'base64')` → `parseZipMetadata` → 若 `~/.dsh/skills/<name>` 已存在 → 200 `{ conflict: true, existing: {...} }`；body 带 `overwrite: true` 时先 `trashSkillDir` 旧目录再 `installZip`；成功 200 `{ ok: true, name, path }`；`ZipInstallError` → 400。
    - `set-enabled`：body `{ name, path, enabled }` → `resolveMutationSkill` → `setFrontmatterField(skill.path, 'disable-model-invocation', !enabled)`。
    - `uninstall`：body `{ name, path }` → `resolveMutationSkill` → `linked` → 400；否则 `trashSkillDir(dirname(path))`（整个技能目录）。
    - `trash/list`：对每个活跃 session cwd 的项目根？**不**——本插件只管理 `~/.dsh/skills`，`listTrash(join(dshHome, 'skills'))`。
    - `trash/restore` / `trash/purge`：body `{ trashPath }`，解析条目后操作；occupied → 409。
    - `detail`：`?name=` + fresh scan → `{ frontmatter, body }`。
    - `health`：`{ ok: true, plugin: 'skill-center', skills: n }`。
  - `index.ts` `apply`：解析 `config.dshHome ?? process.env.DSH_HOME ?? homedir() + sep + '.dsh'`；`activeSessionCwds` 从 `ctx.sessions.list()`；`ctx.effect` 注册全部路由；`mountOnce('dsh-knj-extension-center', applyImpl)`。

- [ ] **Step 4: 跑测试确认通过**

- [ ] **Step 5: 提交** —— `git commit -m "feat: skill-center REST routes with loopback fence"`

---
