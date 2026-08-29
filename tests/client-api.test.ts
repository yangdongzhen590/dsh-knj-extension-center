// Client support modules: SkillApi fetch wrapper, zh/en locale dictionaries,
// and the apply guard. Fetch is stubbed per test (no real network).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, SkillApi } from '../src/client/api';
import { applyGuard } from '../src/client/apply-guard';
import { en, zh, type SkillCenterKey } from '../src/client/locales';

const LIST_PATH = '/api/dsh-skill-center/list';
const DETAIL_PATH = '/api/dsh-skill-center/detail';
const INSTALL_PATH = '/api/dsh-skill-center/install';
const SET_ENABLED_PATH = '/api/dsh-skill-center/set-enabled';
const UNINSTALL_PATH = '/api/dsh-skill-center/uninstall';
const TRASH_LIST_PATH = '/api/dsh-skill-center/trash/list';
const TRASH_RESTORE_PATH = '/api/dsh-skill-center/trash/restore';
const TRASH_PURGE_PATH = '/api/dsh-skill-center/trash/purge';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Minimal fetch mock shaped like a Response subset the client reads. */
function okJson(json: unknown, status = 200) {
  return vi.fn().mockResolvedValue({ ok: status >= 200 && status < 300, status, json: async () => json });
}

describe('SkillApi', () => {
  it('list sends q and level query params', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ cwd: '/x', groups: [], complete: true }) });
    vi.stubGlobal('fetch', fetchMock);
    const api = new SkillApi();
    await api.list({ q: 'test', level: 'user' });
    expect(fetchMock.mock.calls[0][0]).toContain('q=test');
    expect(fetchMock.mock.calls[0][0]).toContain('level=user');
    vi.unstubAllGlobals();
  });

  it('throws ApiError with host message on failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: 'forbidden' }) }));
    const api = new SkillApi();
    await expect(api.list({})).rejects.toMatchObject({ message: 'forbidden' });
    vi.unstubAllGlobals();
  });

  it('list omits empty query params and tolerates zero groups', async () => {
    const fetchMock = okJson({ cwd: '/ws', groups: [], complete: false });
    vi.stubGlobal('fetch', fetchMock);
    const api = new SkillApi();
    const payload = await api.list({});
    expect(fetchMock.mock.calls[0][0]).toBe(LIST_PATH);
    expect(payload.groups).toHaveLength(0);
    expect(payload.complete).toBe(false);
  });

  it('detail sends the name query param', async () => {
    const fetchMock = okJson({ name: 'demo', frontmatter: '---\nname: demo\n---', body: '# demo\n' });
    vi.stubGlobal('fetch', fetchMock);
    const api = new SkillApi();
    const detail = await api.detail('demo');
    expect(fetchMock.mock.calls[0][0]).toContain(DETAIL_PATH);
    expect(fetchMock.mock.calls[0][0]).toContain('name=demo');
    // frontmatter/body arrive verbatim (not parsed by the client)
    expect(detail.frontmatter).toBe('---\nname: demo\n---');
    expect(detail.body).toBe('# demo\n');
  });

  it('setEnabled POSTs a JSON body with name, path and enabled', async () => {
    const fetchMock = okJson({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    const api = new SkillApi();
    await api.setEnabled('demo', '/x/demo/SKILL.md', false);
    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe('POST');
    expect(init.headers['content-type']).toBe('application/json');
    expect(JSON.parse(init.body)).toEqual({ name: 'demo', path: '/x/demo/SKILL.md', enabled: false });
    expect(fetchMock.mock.calls[0][0]).toBe(SET_ENABLED_PATH);
  });

  it('uninstall POSTs a JSON body with name and path', async () => {
    const fetchMock = okJson({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    const api = new SkillApi();
    await api.uninstall('demo', '/x/demo/SKILL.md');
    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ name: 'demo', path: '/x/demo/SKILL.md' });
  });

  it('install base64-encodes the File and sends overwrite + cwd', async () => {
    const fetchMock = okJson({ ok: true, name: 'demo', path: '/x/demo/SKILL.md' });
    vi.stubGlobal('fetch', fetchMock);
    const api = new SkillApi();
    const file = new File(['hello zip'], 'demo.zip', { type: 'application/zip' });
    const result = await api.install(file, true, '/ws');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(INSTALL_PATH);
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body);
    expect(body.zipBase64).toBe(Buffer.from('hello zip').toString('base64'));
    expect(body.overwrite).toBe(true);
    expect(body.cwd).toBe('/ws');
    expect(result).toMatchObject({ ok: true, name: 'demo' });
  });

  it('install passes a conflict response through to the caller', async () => {
    const fetchMock = okJson({ conflict: true, existing: { name: 'demo', level: 'user-dsh' } });
    vi.stubGlobal('fetch', fetchMock);
    const api = new SkillApi();
    const file = new File(['zip'], 'demo.zip');
    const result = await api.install(file, false);
    expect(result).toMatchObject({ conflict: true, existing: { name: 'demo' } });
  });

  it('trashList returns the trash payload', async () => {
    const items = [{ name: 'demo', trashPath: '/x/.trash/demo-1', originalPath: '/x/demo', deletedAt: '1', legacy: false }];
    const fetchMock = okJson({ items });
    vi.stubGlobal('fetch', fetchMock);
    const api = new SkillApi();
    const payload = await api.trashList();
    expect(fetchMock.mock.calls[0][0]).toBe(TRASH_LIST_PATH);
    expect(payload.items).toHaveLength(1);
    expect(payload.items[0].name).toBe('demo');
  });

  it('trashRestore and trashPurge POST the trashPath', async () => {
    const restoreMock = okJson({ ok: true, path: '/x/demo' });
    const purgeMock = okJson({ ok: true });
    const api = new SkillApi();
    vi.stubGlobal('fetch', restoreMock);
    await api.trashRestore('/x/.trash/demo-1');
    const [url1, init1] = restoreMock.mock.calls[0];
    expect(url1).toBe(TRASH_RESTORE_PATH);
    expect(JSON.parse(init1.body)).toEqual({ trashPath: '/x/.trash/demo-1' });
    vi.stubGlobal('fetch', purgeMock);
    await api.trashPurge('/x/.trash/demo-1');
    const [url2, init2] = purgeMock.mock.calls[0];
    expect(url2).toBe(TRASH_PURGE_PATH);
    expect(JSON.parse(init2.body)).toEqual({ trashPath: '/x/.trash/demo-1' });
  });

  it('ApiError carries the host status code', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 409, json: async () => ({ error: 'occupied' }) }));
    const api = new SkillApi();
    const err = await api.list({}).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ message: 'occupied', status: 409 });
  });
});

describe('locales', () => {
  it('en mirrors the zh key set exactly', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort());
  });

  it('zh copy matches the UI design doc', () => {
    expect(zh['panel.title']).toBe('技能中心');
    expect(zh['panel.subtitle']).toBe('浏览 · 安装 · 管理已加载的 skill');
    expect(zh['group.bundled.title']).toBe('系统内置');
    expect(zh['group.user-dsh.title']).toBe('用户技能（~/.dsh/skills）');
    expect(zh['conflict.title']).toBe('技能名已存在');
    expect(zh['install.dropzoneMain']).toBe('点击选择，或将 zip 拖到这里');
    expect(zh['trash.empty']).toBe('回收站是空的');
  });

  it('SkillCenterKey resolves to the zh key union', () => {
    const key: SkillCenterKey = 'panel.title';
    expect(zh[key]).toBe('技能中心');
  });
});

describe('applyGuard', () => {
  it('returns the wrapped function result on success', () => {
    const disposer = () => 'disposed';
    expect(applyGuard(() => disposer)).toBe(disposer);
  });

  it('swallows thrown errors, warns to console and returns undefined', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const boom = () => {
      throw new Error('boom');
    };
    expect(applyGuard(boom)).toBeUndefined();
    expect(warn).toHaveBeenCalledOnce();
  });
});
