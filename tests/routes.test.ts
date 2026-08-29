import { createServer, request as httpRequest, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, afterEach } from 'vitest';
import JSZip from 'jszip';
import { makeRoutes, ROUTES, type Route } from '../src/routes';

const dirs: string[] = [];
function tmpDir() { const d = mkdtempSync(join(tmpdir(), 'rt-')); dirs.push(d); return d; }
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

// mock ctx：webServer.register 收集路由；skills/sessions 用最小 stub
function makeCtx(handlers: Route[]) {
  return {
    webServer: { register: (r: Route) => { handlers.push(r); return () => {}; } },
    logger: { warn: () => {} },
    get: () => undefined,
  };
}

function makeDeps(dshHome: string, registry: { skills?: Array<Record<string, unknown>> } = {}) {
  return {
    dshHome,
    registry: {
      snapshot: async () => ({ skills: registry.skills ?? [], complete: true }),
    },
    activeSessionCwds: () => [] as string[],
    logger: { warn: () => {} },
  };
}

function makeSkill(dsh: string, name: string, body = '---\nname: ' + name + '\ndescription: ' + name + ' skill\n---\n# ' + name + '\ncontent') {
  const dir = join(dsh, 'skills', name);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, 'SKILL.md');
  writeFileSync(file, body);
  return file;
}

async function makeZip(entries: Record<string, string>): Promise<Buffer> {
  const zip = new JSZip();
  for (const [p, c] of Object.entries(entries)) zip.file(p, c);
  return Buffer.from(await zip.generateAsync({ type: 'nodebuffer' }));
}

// 用真实 http 请求打到路由 handler 的辅助：构造 req/res 双端
function request(handler: (req: IncomingMessage, res: ServerResponse) => Promise<void> | void, method: string, url: string, body?: unknown, headers: Record<string, string> = {}) {
  return new Promise<{ status: number; json: any }>((resolve, reject) => {
    const server: Server = createServer((req, res) => { handler(req as any, res as any); });
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as { port: number };
      const payload = body === undefined ? undefined : JSON.stringify(body);
      const r = httpRequest(
        { host: '127.0.0.1', port: addr.port, method, path: url, headers: { host: '127.0.0.1:3080', 'sec-fetch-site': 'same-origin', ...(payload ? { 'content-type': 'application/json' } : {}), ...headers } },
        (res) => {
          let data = ''; res.on('data', (c) => (data += c)); res.on('end', () => { server.close(); resolve({ status: res.statusCode!, json: JSON.parse(data) }); });
        },
      );
      r.on('error', (err) => { server.close(); reject(err); });
      if (payload) r.write(payload);
      r.end();
    });
  });
}

describe('skill-center routes', () => {
  it('list returns grouped skills with correct cwd', async () => {
    const dsh = tmpDir();
    makeSkill(dsh, 'demo');
    const handlers: Route[] = [];
    const ctx = makeCtx(handlers);
    const routes = makeRoutes(ctx as any, makeDeps(dsh) as any);
    const listHandler = routes.find(r => r.path === ROUTES.list)!.handler;
    const res = await request(listHandler, 'GET', ROUTES.list + '?cwd=' + encodeURIComponent(tmpdir()));
    expect(res.status).toBe(200);
    expect(res.json.cwd).toBe(tmpdir());
    expect(res.json.groups.some((g: any) => g.skills.some((s: any) => s.name === 'demo'))).toBe(true);
  });

  it('list filters by q (case-insensitive) and level', async () => {
    const dsh = tmpDir();
    makeSkill(dsh, 'demo');
    makeSkill(dsh, 'alpha-skill');
    const handlers: Route[] = [];
    const routes = makeRoutes(makeCtx(handlers) as any, makeDeps(dsh) as any);
    const listHandler = routes.find(r => r.path === ROUTES.list)!.handler;
    const all = await request(listHandler, 'GET', ROUTES.list + '?cwd=' + encodeURIComponent(tmpdir()));
    expect(all.json.groups.some((g: any) => g.skills.some((s: any) => s.name === 'alpha-skill'))).toBe(true);
    const filtered = await request(listHandler, 'GET', ROUTES.list + '?q=DEMO&level=user-dsh&cwd=' + encodeURIComponent(tmpdir()));
    expect(filtered.status).toBe(200);
    const names = filtered.json.groups.flatMap((g: any) => g.skills.map((s: any) => s.name));
    expect(names).toEqual(['demo']);
    const levelOnly = await request(listHandler, 'GET', ROUTES.list + '?level=bundled&cwd=' + encodeURIComponent(tmpdir()));
    expect(levelOnly.json.groups).toEqual([]);
  });

  it('set-enabled rewrites frontmatter', async () => {
    const dsh = tmpDir();
    const file = makeSkill(dsh, 'demo');
    const handlers: Route[] = [];
    const routes = makeRoutes(makeCtx(handlers) as any, makeDeps(dsh) as any);
    const handler = routes.find(r => r.path === ROUTES.setEnabled)!.handler;
    const res = await request(handler, 'POST', ROUTES.setEnabled, { name: 'demo', path: file, enabled: false });
    expect(res.status).toBe(200);
    expect(res.json.enabled).toBe(false);
    expect(res.json.modelInvocable).toBe(false);
    expect(readFileSync(file, 'utf8')).toContain('disable-model-invocation: true');
    const re = await request(handler, 'POST', ROUTES.setEnabled, { name: 'demo', path: file, enabled: true });
    expect(re.json.enabled).toBe(true);
    expect(readFileSync(file, 'utf8')).toContain('disable-model-invocation: false');
  });

  it('set-enabled rejects a stale path with 409', async () => {
    const dsh = tmpDir();
    makeSkill(dsh, 'demo');
    const handlers: Route[] = [];
    const routes = makeRoutes(makeCtx(handlers) as any, makeDeps(dsh) as any);
    const handler = routes.find(r => r.path === ROUTES.setEnabled)!.handler;
    const res = await request(handler, 'POST', ROUTES.setEnabled, { name: 'demo', path: join(dsh, 'skills', 'demo', 'stale.md'), enabled: false });
    expect(res.status).toBe(409);
  });

  it('uninstall moves into trash', async () => {
    const dsh = tmpDir();
    makeSkill(dsh, 'demo');
    const handlers: Route[] = [];
    const routes = makeRoutes(makeCtx(handlers) as any, makeDeps(dsh) as any);
    const handler = routes.find(r => r.path === ROUTES.uninstall)!.handler;
    const res = await request(handler, 'POST', ROUTES.uninstall, { name: 'demo', path: join(dsh, 'skills', 'demo', 'SKILL.md') });
    expect(res.status).toBe(200);
    expect(existsSync(join(dsh, 'skills', 'demo'))).toBe(false);
    const listHandler = routes.find(r => r.path === ROUTES.trashList)!.handler;
    const trash = await request(listHandler, 'GET', ROUTES.trashList);
    expect(trash.status).toBe(200);
    expect(trash.json.items.some((i: any) => i.name === 'demo')).toBe(true);
    const restoreHandler = routes.find(r => r.path === ROUTES.trashRestore)!.handler;
    const restore = await request(restoreHandler, 'POST', ROUTES.trashRestore, { trashPath: trash.json.items[0].trashPath });
    expect(restore.status).toBe(200);
    expect(existsSync(join(dsh, 'skills', 'demo', 'SKILL.md'))).toBe(true);
  });

  it('uninstall of a single-file skill stays recoverable through trash', async () => {
    const dsh = tmpDir();
    const file = join(dsh, 'skills', 'demo.md');
    mkdirSync(join(dsh, 'skills'), { recursive: true });
    writeFileSync(file, '---\nname: demo\ndescription: demo skill\n---\n# Demo\nbody text');
    const handlers: Route[] = [];
    const routes = makeRoutes(makeCtx(handlers) as any, makeDeps(dsh) as any);
    const uninstall = routes.find(r => r.path === ROUTES.uninstall)!.handler;
    const res = await request(uninstall, 'POST', ROUTES.uninstall, { name: 'demo', path: file });
    expect(res.status).toBe(200);
    expect(existsSync(file)).toBe(false);
    const list = routes.find(r => r.path === ROUTES.trashList)!.handler;
    const trash = await request(list, 'GET', ROUTES.trashList);
    expect(trash.status).toBe(200);
    const item = trash.json.items.find((i: any) => i.name === 'demo');
    expect(item).toBeTruthy();
    const restore = routes.find(r => r.path === ROUTES.trashRestore)!.handler;
    const restored = await request(restore, 'POST', ROUTES.trashRestore, { trashPath: item.trashPath });
    expect(restored.status).toBe(200);
    expect(readFileSync(file, 'utf8')).toBe('---\nname: demo\ndescription: demo skill\n---\n# Demo\nbody text');
  });

  it('trash restore returns 409 when the original path is occupied', async () => {
    const dsh = tmpDir();
    const file = join(dsh, 'skills', 'demo.md');
    mkdirSync(join(dsh, 'skills'), { recursive: true });
    writeFileSync(file, '---\nname: demo\ndescription: demo skill\n---\nold');
    const handlers: Route[] = [];
    const routes = makeRoutes(makeCtx(handlers) as any, makeDeps(dsh) as any);
    const uninstall = routes.find(r => r.path === ROUTES.uninstall)!.handler;
    const res = await request(uninstall, 'POST', ROUTES.uninstall, { name: 'demo', path: file });
    expect(res.status).toBe(200);
    const list = routes.find(r => r.path === ROUTES.trashList)!.handler;
    const trash = await request(list, 'GET', ROUTES.trashList);
    const item = trash.json.items.find((i: any) => i.name === 'demo');
    // 原位被新技能占据
    writeFileSync(file, '---\nname: demo\ndescription: newer\n---\nnew');
    const restore = routes.find(r => r.path === ROUTES.trashRestore)!.handler;
    const occupied = await request(restore, 'POST', ROUTES.trashRestore, { trashPath: item.trashPath });
    expect(occupied.status).toBe(409);
  });

  it('install rejects invalid zip with 400 and leaves no files', async () => {
    const dsh = tmpDir();
    mkdirSync(join(dsh, 'skills'));
    const handlers: Route[] = [];
    const routes = makeRoutes(makeCtx(handlers) as any, makeDeps(dsh) as any);
    const handler = routes.find(r => r.path === ROUTES.install)!.handler;
    const res = await request(handler, 'POST', ROUTES.install, { zipBase64: Buffer.from('not a zip').toString('base64'), cwd: tmpdir() });
    expect(res.status).toBe(400);
    expect(res.json.error).toBeTruthy();
    expect(readdirSync(join(dsh, 'skills'))).toEqual([]);
  });

  it('install succeeds and extracts the skill package', async () => {
    const dsh = tmpDir();
    const zip = await makeZip({ 'my-skill/SKILL.md': '---\nname: my-skill\ndescription: hello\n---\nbody', 'my-skill/refs/a.md': 'x' });
    const handlers: Route[] = [];
    const routes = makeRoutes(makeCtx(handlers) as any, makeDeps(dsh) as any);
    const handler = routes.find(r => r.path === ROUTES.install)!.handler;
    const res = await request(handler, 'POST', ROUTES.install, { zipBase64: zip.toString('base64'), cwd: tmpdir() });
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({ ok: true, name: 'my-skill' });
    expect(existsSync(res.json.path)).toBe(true);
    expect(existsSync(join(dsh, 'skills', 'my-skill', 'refs', 'a.md'))).toBe(true);
  });

  it('install reports conflict when the skill dir already exists', async () => {
    const dsh = tmpDir();
    makeSkill(dsh, 'my-skill');
    const zip = await makeZip({ 'my-skill/SKILL.md': '---\nname: my-skill\ndescription: hello\n---\nbody' });
    const handlers: Route[] = [];
    const routes = makeRoutes(makeCtx(handlers) as any, makeDeps(dsh) as any);
    const handler = routes.find(r => r.path === ROUTES.install)!.handler;
    const res = await request(handler, 'POST', ROUTES.install, { zipBase64: zip.toString('base64'), cwd: tmpdir() });
    expect(res.status).toBe(200);
    expect(res.json.conflict).toBe(true);
    expect(res.json.existing.name).toBe('my-skill');
    // 原位未被覆盖
    expect(readFileSync(join(dsh, 'skills', 'my-skill', 'SKILL.md'), 'utf8')).not.toContain('hello');
  });

  it('install with overwrite trashes the old dir first', async () => {
    const dsh = tmpDir();
    makeSkill(dsh, 'my-skill');
    const zip = await makeZip({ 'my-skill/SKILL.md': '---\nname: my-skill\ndescription: hello\n---\nbody' });
    const handlers: Route[] = [];
    const routes = makeRoutes(makeCtx(handlers) as any, makeDeps(dsh) as any);
    const handler = routes.find(r => r.path === ROUTES.install)!.handler;
    const res = await request(handler, 'POST', ROUTES.install, { zipBase64: zip.toString('base64'), cwd: tmpdir(), overwrite: true });
    expect(res.status).toBe(200);
    expect(res.json.ok).toBe(true);
    expect(readFileSync(join(dsh, 'skills', 'my-skill', 'SKILL.md'), 'utf8')).toContain('hello');
    const listHandler = routes.find(r => r.path === ROUTES.trashList)!.handler;
    const trash = await request(listHandler, 'GET', ROUTES.trashList);
    expect(trash.json.items.some((i: any) => i.name === 'my-skill')).toBe(true);
  });

  it('detail returns frontmatter text and body for a user skill', async () => {
    const dsh = tmpDir();
    makeSkill(dsh, 'demo', '---\nname: demo\ndescription: demo skill\n---\n# Demo\nSome body text');
    const handlers: Route[] = [];
    const routes = makeRoutes(makeCtx(handlers) as any, makeDeps(dsh) as any);
    const handler = routes.find(r => r.path === ROUTES.detail)!.handler;
    const res = await request(handler, 'GET', ROUTES.detail + '?name=demo&cwd=' + encodeURIComponent(tmpdir()));
    expect(res.status).toBe(200);
    expect(res.json.frontmatter).toContain('name: demo');
    expect(res.json.body).toContain('Some body text');
    const missing = await request(handler, 'GET', ROUTES.detail + '?name=nope&cwd=' + encodeURIComponent(tmpdir()));
    expect(missing.status).toBe(404);
  });

  it('health reports ok with skill count', async () => {
    const dsh = tmpDir();
    makeSkill(dsh, 'demo');
    const handlers: Route[] = [];
    const routes = makeRoutes(makeCtx(handlers) as any, makeDeps(dsh) as any);
    const handler = routes.find(r => r.path === ROUTES.health)!.handler;
    const res = await request(handler, 'GET', ROUTES.health);
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({ ok: true, plugin: 'skill-center', skills: 1 });
  });

  it('rejects non-loopback requests with 403', async () => {
    const dsh = tmpDir();
    const handlers: Route[] = [];
    const routes = makeRoutes(makeCtx(handlers) as any, makeDeps(dsh) as any);
    const listHandler = routes.find(r => r.path === ROUTES.list)!.handler;
    const res = await request(listHandler, 'GET', ROUTES.list, undefined, { 'sec-fetch-site': 'cross-site' });
    expect(res.status).toBe(403);
    expect(res.json.error).toContain('loopback');
  });

  it('rejects wrong method with 405', async () => {
    const dsh = tmpDir();
    const handlers: Route[] = [];
    const routes = makeRoutes(makeCtx(handlers) as any, makeDeps(dsh) as any);
    const listHandler = routes.find(r => r.path === ROUTES.list)!.handler;
    const res = await request(listHandler, 'POST', ROUTES.list, {});
    expect(res.status).toBe(405);
  });

  it('exports all nine route paths', () => {
    expect(ROUTES).toMatchObject({
      list: '/api/dsh-skill-center/list',
      install: '/api/dsh-skill-center/install',
      setEnabled: '/api/dsh-skill-center/set-enabled',
      uninstall: '/api/dsh-skill-center/uninstall',
      trashList: '/api/dsh-skill-center/trash/list',
      trashRestore: '/api/dsh-skill-center/trash/restore',
      trashPurge: '/api/dsh-skill-center/trash/purge',
      detail: '/api/dsh-skill-center/detail',
      health: '/api/dsh-skill-center/health',
    });
  });
});
