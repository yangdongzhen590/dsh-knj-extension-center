/** @vitest-environment jsdom */
// Task 14 — client assembly + view controller. Two layers:
//
// 1. `apply(ctx)` assembly (src/client/index.ts): with a mock client ctx
//    (slots/locale stubs) the apply must register the locale dictionaries,
//    defer the knj.menu.item registration through `slots.inject` (the host
//    throws on registering into an undeclared slot — knj.menu.item only
//    exists once knj-menu commits its declaration), mount the center view,
//    and return a combined disposer. Every step rides applyGuard: a failing
//    body must console.warn and return undefined, never throw.
//
// 2. CenterApp view controller (src/client/CenterApp.tsx): component-level
//    flow coverage — 列表 → 详情 → 返回 → 回收站 → 安装, the pathless
//    (bundled/runtime) no-detail guard, the top-level close paths (header
//    close button + Escape), and detail mutations using the real item.path.
//
// The suite carries the jsdom environment via docblock (like the other
// view tests); vitest stubs CSS modules, so assertions target roles, data
// attributes and visible text.
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { DetailPayload, ListPayload, SkillApi, SkillItem, TrashItem } from '../src/client/api';
import { apply } from '../src/client/index';
import { CenterApp } from '../src/client/CenterApp';
import { ACTIVE_ATTR } from '../src/client/center-mount';
import { MENU_SLOT, MENU_ENTRY_ID, MENU_ENTRY_ORDER, MENU_ENTRY_LOCALE } from '../src/client/menu-entry';
import { en, zh } from '../src/client/locales';

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  document.body.innerHTML = '';
  document.documentElement.removeAttribute(ACTIVE_ATTR);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Mount `ui` into a fresh jsdom container; returns container + root. */
function mount(ui: ReactElement): { container: HTMLDivElement; root: Root } {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(ui));
  return { container, root };
}

/** Flush pending microtasks (resolved api promises) inside act. */
async function flush(): Promise<void> {
  await act(async () => {});
}

function click(el: Element): void {
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

// ── fixtures ────────────────────────────────────────────────────────────────

const USER_SKILL: SkillItem = {
  name: 'dsh-doublecheck',
  description: '工程纪律套件：需求盘问 → 规格记录',
  whenToUse: '需要交付物质量把关时',
  provider: 'user-dsh',
  level: 'user-dsh',
  path: '~/.dsh/skills/dsh-doublecheck/SKILL.md',
  linked: false,
  modelInvocable: true,
  userInvocable: true,
};

const BUNDLED_SKILL: SkillItem = {
  name: 'code-review',
  description: '沿两个轴审查变更',
  whenToUse: '审查分支时',
  provider: 'bundled',
  level: 'bundled',
  path: undefined,
  linked: false,
  modelInvocable: true,
  userInvocable: false,
};

const USER_DETAIL: DetailPayload = {
  name: 'dsh-doublecheck',
  frontmatter: '---\nname: dsh-doublecheck\ndescription: 工程纪律套件\n---',
  body: '## 交付纪律\n\n- 测试先行（red → green）',
};

const TRASH_ITEM: TrashItem = {
  name: 'old-skill',
  trashPath: '/.dsh/trash/old-skill',
  originalPath: '~/.dsh/skills/old-skill/SKILL.md',
  deletedAt: '1700000000000',
  legacy: false,
};

function listPayload(): ListPayload {
  return {
    cwd: '/ws',
    complete: true,
    groups: [
      { key: 'bundled', title: '系统内置', hint: 'h', skills: [BUNDLED_SKILL] },
      { key: 'user-dsh', title: '用户技能', hint: 'h', skills: [USER_SKILL] },
    ],
  };
}

/** Full SkillApi double for the CenterApp flow tests. */
function makeApi() {
  return {
    list: vi.fn<SkillApi['list']>(),
    detail: vi.fn<SkillApi['detail']>(),
    setEnabled: vi.fn<SkillApi['setEnabled']>(),
    uninstall: vi.fn<SkillApi['uninstall']>(),
    install: vi.fn<SkillApi['install']>(),
    trashList: vi.fn<SkillApi['trashList']>(),
    trashRestore: vi.fn<SkillApi['trashRestore']>(),
    trashPurge: vi.fn<SkillApi['trashPurge']>(),
  };
}

// ── apply(ctx) assembly ─────────────────────────────────────────────────────

/** The menu registration options shape (mirrors MenuEntryRegisterOptions). */
interface MenuOptions {
  name: string;
  id: string;
  order: number;
  locale: string;
}

describe('apply(ctx) assembly', () => {
  it('registers the locale dictionaries and defers the menu entry through slots.inject', () => {
    const localeDispose = vi.fn();
    const registerLocale = vi.fn(() => localeDispose);
    const menuDispose = vi.fn(); // what slots.register returns
    const registerSlot = vi.fn((_options: MenuOptions, _component: unknown) => menuDispose);
    const injectDispose = vi.fn(); // what slots.inject returns (the apply disposer tracks this)
    const injectSlot = vi.fn((_key: string, _callback: () => unknown) => injectDispose);
    const ctx = {
      slots: { register: registerSlot, inject: injectSlot },
      locale: { register: registerLocale },
    };

    const dispose = apply(ctx);

    expect(dispose).toBeInstanceOf(Function);
    // 1) locale dictionaries registered for the dsh-skill-center namespace
    expect(registerLocale).toHaveBeenCalledTimes(1);
    expect(registerLocale).toHaveBeenCalledWith('dsh-skill-center', { zh, en });
    // 2) the menu entry is registered through inject — never a direct
    //    register into knj.menu.item (the host throws on undeclared slots)
    expect(injectSlot).toHaveBeenCalledTimes(1);
    expect(injectSlot.mock.calls[0][0]).toBe(MENU_SLOT);
    expect(registerSlot).not.toHaveBeenCalled();

    // 3) running the inject callback registers the menu item with exact options
    const injectCb = injectSlot.mock.calls[0][1];
    const inner = injectCb();
    expect(registerSlot).toHaveBeenCalledTimes(1);
    const options = registerSlot.mock.calls[0][0];
    expect(options).toEqual({
      name: MENU_SLOT,
      id: MENU_ENTRY_ID,
      order: MENU_ENTRY_ORDER,
      locale: MENU_ENTRY_LOCALE,
    });
    expect(inner).toBe(menuDispose);

    // 4) the apply disposer runs every tracked sub-disposer (the inject
    //    disposer; the inner registration disposer is owned by the inject
    //    lifecycle and collapses with the slot)
    dispose!();
    expect(localeDispose).toHaveBeenCalledTimes(1);
    expect(injectDispose).toHaveBeenCalledTimes(1);
  });

  it('falls back to a direct registerMenuEntry when slots lacks inject', () => {
    const registerSlot = vi.fn((_options: MenuOptions, _component: unknown) => vi.fn());
    const registerLocale = vi.fn(() => vi.fn());
    const ctx = {
      slots: { register: registerSlot }, // no inject
      locale: { register: registerLocale },
    };

    const dispose = apply(ctx);
    expect(dispose).toBeInstanceOf(Function);
    expect(registerSlot).toHaveBeenCalledTimes(1);
    expect(registerSlot.mock.calls[0][0]).toEqual({
      name: MENU_SLOT,
      id: MENU_ENTRY_ID,
      order: MENU_ENTRY_ORDER,
      locale: MENU_ENTRY_LOCALE,
    });
    dispose!();
  });

  it('degrades through applyGuard: a throwing body warns and returns undefined', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const ctx = {
      slots: { inject: vi.fn(() => vi.fn()) },
      locale: {
        register: vi.fn(() => {
          throw new Error('duplicate namespace');
        }),
      },
    };

    const result = apply(ctx);
    expect(result).toBeUndefined();
    expect(warn).toHaveBeenCalled();
    expect(warn.mock.calls[0][0]).toContain('[dsh-skill-center]');
    warn.mockRestore();
  });

  it('degrades to a no-op disposer when ctx services are missing entirely', () => {
    const dispose = apply({} as never);
    expect(dispose).toBeInstanceOf(Function);
    expect(() => dispose!()).not.toThrow();
    // Even a missing ctx must not throw — the whole body rides applyGuard.
    const dispose2 = apply(undefined as never);
    expect(dispose2).toBeInstanceOf(Function);
    expect(() => dispose2!()).not.toThrow();
  });
});

// ── CenterApp view controller ───────────────────────────────────────────────

describe('CenterApp view controller', () => {
  it('renders the list view on mount and loads the grouped skills', async () => {
    const api = makeApi();
    api.list.mockResolvedValue(listPayload());
    const { container, root } = mount(<CenterApp api={api as unknown as SkillApi} onClose={vi.fn()} />);
    await flush();

    expect(api.list).toHaveBeenCalledWith({});
    expect(container.textContent).toContain(zh['panel.title']);
    expect(container.querySelector('[data-skill-name="dsh-doublecheck"]')).not.toBeNull();
    expect(container.querySelector('[data-skill-name="code-review"]')).not.toBeNull();
    act(() => root.unmount());
  });

  it('opens the detail view from a user card and returns to the list via back', async () => {
    const api = makeApi();
    api.list.mockResolvedValue(listPayload());
    api.detail.mockResolvedValue(USER_DETAIL);
    const { container, root } = mount(<CenterApp api={api as unknown as SkillApi} onClose={vi.fn()} />);
    await flush();

    click(container.querySelector('[data-skill-name="dsh-doublecheck"]')!);
    await flush();
    expect(api.detail).toHaveBeenCalledWith('dsh-doublecheck');
    // detail chrome comes from the merged list entry passed as `item`
    expect(container.textContent).toContain(zh['detail.backToList']);
    expect(container.textContent).toContain(zh['detail.pathUserSkill'].replace('{name}', 'dsh-doublecheck'));
    expect(container.textContent).toContain('交付纪律');

    // back → list (fresh mount reloads)
    const back = [...container.querySelectorAll('button')].find((b) => b.textContent?.includes(zh['detail.backToList']))!;
    click(back);
    await flush();
    expect(api.list).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain(zh['panel.title']);
    act(() => root.unmount());
  });

  it('does NOT open the detail view for pathless (bundled/runtime) skills', async () => {
    const api = makeApi();
    api.list.mockResolvedValue(listPayload());
    api.detail.mockResolvedValue(USER_DETAIL);
    const { container, root } = mount(<CenterApp api={api as unknown as SkillApi} onClose={vi.fn()} />);
    await flush();

    click(container.querySelector('[data-skill-name="code-review"]')!);
    await flush();

    expect(api.detail).not.toHaveBeenCalled();
    expect(container.textContent).toContain(zh['panel.title']); // still on the list
    act(() => root.unmount());
  });

  it('switches to the trash view and back', async () => {
    const api = makeApi();
    api.list.mockResolvedValue(listPayload());
    api.trashList.mockResolvedValue({ items: [TRASH_ITEM] });
    const { container, root } = mount(<CenterApp api={api as unknown as SkillApi} onClose={vi.fn()} />);
    await flush();

    const trashBtn = [...container.querySelectorAll('button')].find((b) => b.textContent?.includes(zh['panel.trashButton']))!;
    click(trashBtn);
    await flush();
    expect(api.trashList).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain(zh['trash.title']);
    expect(container.textContent).toContain(TRASH_ITEM.name);

    const back = [...container.querySelectorAll('button')].find((b) => b.textContent?.includes(zh['trash.back']))!;
    click(back);
    await flush();
    expect(container.textContent).toContain(zh['panel.title']);
    act(() => root.unmount());
  });

  it('switches to the install flow and cancels back to the list', async () => {
    const api = makeApi();
    api.list.mockResolvedValue(listPayload());
    const { container, root } = mount(<CenterApp api={api as unknown as SkillApi} onClose={vi.fn()} />);
    await flush();

    const installBtn = [...container.querySelectorAll('button')].find((b) => b.textContent?.includes(zh['panel.installButton']))!;
    click(installBtn);
    await flush();
    expect(container.textContent).toContain(zh['install.title']);
    expect(container.textContent).toContain(zh['install.dropzoneMain']);

    const cancel = [...container.querySelectorAll('button')].find((b) => b.textContent?.includes(zh['install.cancel']))!;
    click(cancel);
    await flush();
    expect(container.textContent).toContain(zh['panel.title']);
    act(() => root.unmount());
  });

  it('restores a trash entry: mutation succeeds → back to a refreshed list', async () => {
    vi.stubGlobal('confirm', vi.fn(() => true));
    const api = makeApi();
    api.list.mockResolvedValue(listPayload());
    api.trashList.mockResolvedValue({ items: [TRASH_ITEM] });
    api.trashRestore.mockResolvedValue(undefined);
    const { container, root } = mount(<CenterApp api={api as unknown as SkillApi} onClose={vi.fn()} />);
    await flush();

    const trashBtn = [...container.querySelectorAll('button')].find((b) => b.textContent?.includes(zh['panel.trashButton']))!;
    click(trashBtn);
    await flush();

    const restore = [...container.querySelectorAll('button')].find((b) => b.textContent?.includes(zh['trash.restore']))!;
    click(restore);
    await flush();
    expect(api.trashRestore).toHaveBeenCalledWith(TRASH_ITEM.trashPath);
    // onChanged → back to list, which remounts and reloads
    expect(container.textContent).toContain(zh['panel.title']);
    expect(api.list).toHaveBeenCalledTimes(2);
    act(() => root.unmount());
  });

  it('detail toggle and uninstall use the real item.path', async () => {
    vi.stubGlobal('confirm', vi.fn(() => true));
    const api = makeApi();
    api.list.mockResolvedValue(listPayload());
    api.detail.mockResolvedValue(USER_DETAIL);
    api.setEnabled.mockResolvedValue(undefined);
    api.uninstall.mockResolvedValue(undefined);
    const { container, root } = mount(<CenterApp api={api as unknown as SkillApi} onClose={vi.fn()} />);
    await flush();

    click(container.querySelector('[data-skill-name="dsh-doublecheck"]')!);
    await flush();

    // toggle: controller supplies the path from the captured list item
    const sw = container.querySelector('button[role="switch"]')!;
    expect(sw.getAttribute('aria-checked')).toBe('true');
    click(sw);
    await flush();
    expect(api.setEnabled).toHaveBeenCalledWith(USER_SKILL.name, USER_SKILL.path, false);
    expect(sw.getAttribute('aria-checked')).toBe('false');

    // uninstall: controller supplies the path; success returns to the list
    const uninstallBtn = [...container.querySelectorAll('button')].find((b) => b.textContent?.includes(zh['detail.uninstall']))!;
    click(uninstallBtn);
    await flush();
    expect(api.uninstall).toHaveBeenCalledWith(USER_SKILL.name, USER_SKILL.path);
    expect(container.textContent).toContain(zh['panel.title']);
    expect(api.list).toHaveBeenCalledTimes(2);
    act(() => root.unmount());
  });

  it('exposes a top-level close path: header close button calls onClose', async () => {
    const api = makeApi();
    api.list.mockResolvedValue(listPayload());
    const onClose = vi.fn();
    const { container, root } = mount(<CenterApp api={api as unknown as SkillApi} onClose={onClose} />);
    await flush();

    const closeBtn = container.querySelector(`button[aria-label="${zh['panel.close']}"]`);
    expect(closeBtn).not.toBeNull();
    click(closeBtn!);
    expect(onClose).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
  });

  it('closes the panel on Escape while it is active (not while typing)', async () => {
    const api = makeApi();
    api.list.mockResolvedValue(listPayload());
    const onClose = vi.fn();
    const { container, root } = mount(<CenterApp api={api as unknown as SkillApi} onClose={onClose} />);
    await flush();

    // panel not active → Escape must not close
    act(() => {
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(onClose).not.toHaveBeenCalled();

    document.documentElement.setAttribute(ACTIVE_ATTR, '');
    act(() => {
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);

    // typing in the search box → Escape must NOT close the panel
    act(() => {
      const input = container.querySelector('input')!;
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
  });
});
