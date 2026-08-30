/** @vitest-environment jsdom */
// List view (Task 10): SkillCard + GroupSection + ListView. Renders with
// react-dom/client + act like menu-entry.test.tsx; `api.list` is mocked per
// test. Vitest stubs CSS modules (css: false default), so assertions target
// roles, data attributes and visible text, not hashed class names.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Group, ListPayload, SkillApi, SkillItem } from '../src/client/api';
import { ListView, type ListViewProps } from '../src/client/views/ListView';
import { SkillCard } from '../src/client/views/SkillCard';
import { zh } from '../src/client/locales';

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.useRealTimers();
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

/** Type into a controlled React input (native setter + input event). */
function typeInput(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
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

const LINKED_USER_SKILL: SkillItem = {
  ...USER_SKILL,
  name: 'session-brain',
  linked: true,
  modelInvocable: false,
};

const BUNDLED_SKILL: SkillItem = {
  name: 'code-review',
  description: '沿两个轴审查变更：Standards 与 Spec',
  whenToUse: '审查分支 / PR / 变更时',
  provider: 'bundled',
  level: 'bundled',
  path: undefined,
  linked: false,
  modelInvocable: true,
  userInvocable: false,
};

function group(key: Group['key'], title: string, hint: string, skills: SkillItem[]): Group {
  return { key, title, hint, skills };
}

/** Two-region payload: bundled (pathless) + user-dsh (with path). */
function twoGroupPayload(): ListPayload {
  return {
    cwd: '/ws',
    complete: true,
    groups: [
      group('bundled', '系统内置', 'DSH 与插件随附的全局技能', [BUNDLED_SKILL]),
      group('user-dsh', '用户技能（~/.dsh/skills）', '本机安装的技能，所有项目共享', [USER_SKILL, LINKED_USER_SKILL]),
    ],
  };
}

/** Minimal SkillApi double; every method is a vi.fn() with mock helpers. */
type ApiMock = {
  list: ReturnType<typeof vi.fn<SkillApi['list']>>;
  setEnabled: ReturnType<typeof vi.fn<SkillApi['setEnabled']>>;
  uninstall: ReturnType<typeof vi.fn<SkillApi['uninstall']>>;
};

function makeApi(): ApiMock {
  return {
    list: vi.fn<SkillApi['list']>(),
    setEnabled: vi.fn<SkillApi['setEnabled']>(),
    uninstall: vi.fn<SkillApi['uninstall']>(),
  };
}

/** Manually-resolvable promise for out-of-order response tests. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

// ── SkillCard ───────────────────────────────────────────────────────────────

describe('SkillCard', () => {
  it('renders name, description, invokable badge and linked badge', () => {
    const { container, root } = mount(
      <SkillCard skill={LINKED_USER_SKILL} onOpen={() => {}} onToggle={() => {}} onUninstall={() => {}} />,
    );
    expect(container.textContent).toContain('session-brain');
    expect(container.textContent).toContain('工程纪律套件');
    // invokable badge: 用户 only (modelInvocable=false)
    expect(container.textContent).toContain(zh['card.invokable'].replace('{names}', zh['card.user']));
    expect(container.textContent).not.toContain(zh['card.model']);
    expect(container.textContent).toContain(zh['card.linked']);
    act(() => root.unmount());
  });

  it('calls onOpen with the skill when the card body is clicked', () => {
    const onOpen = vi.fn();
    const { container, root } = mount(
      <SkillCard skill={USER_SKILL} onOpen={onOpen} onToggle={() => {}} onUninstall={() => {}} />,
    );
    const card = container.querySelector('[data-skill-name]')!;
    click(card);
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith(USER_SKILL);
    act(() => root.unmount());
  });

  it('shows switch + copy + uninstall when path exists; switch toggles and does not open the card', () => {
    const onOpen = vi.fn();
    const onToggle = vi.fn();
    const onUninstall = vi.fn();
    const { container, root } = mount(
      <SkillCard skill={USER_SKILL} onOpen={onOpen} onToggle={onToggle} onUninstall={onUninstall} />,
    );
    const sw = container.querySelector('button[role="switch"]')!;
    expect(sw).not.toBeNull();
    expect(sw.getAttribute('aria-checked')).toBe('true');
    expect(container.querySelector(`button[title="${zh['card.copyPathTitle']}"]`)).not.toBeNull();
    expect(container.querySelector(`button[title="${zh['card.uninstallTitle']}"]`)).not.toBeNull();

    click(sw);
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledWith(USER_SKILL, false);
    expect(onOpen).not.toHaveBeenCalled();
    act(() => root.unmount());
  });

  it('hides switch, copy and uninstall when path is undefined (bundled/runtime)', () => {
    const { container, root } = mount(
      <SkillCard skill={BUNDLED_SKILL} onOpen={() => {}} onToggle={() => {}} onUninstall={() => {}} />,
    );
    expect(container.querySelector('button[role="switch"]')).toBeNull();
    expect(container.querySelector(`button[title="${zh['card.copyPathTitle']}"]`)).toBeNull();
    expect(container.querySelector(`button[title="${zh['card.uninstallTitle']}"]`)).toBeNull();
    act(() => root.unmount());
  });

  it('copies the path via navigator.clipboard without opening the card', () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    const onOpen = vi.fn();
    const { container, root } = mount(
      <SkillCard skill={USER_SKILL} onOpen={onOpen} onToggle={() => {}} onUninstall={() => {}} />,
    );
    click(container.querySelector(`button[title="${zh['card.copyPathTitle']}"]`)!);
    expect(writeText).toHaveBeenCalledWith(USER_SKILL.path);
    expect(onOpen).not.toHaveBeenCalled();
    act(() => root.unmount());
    // @ts-expect-error cleanup: delete the stubbed clipboard
    delete navigator.clipboard;
  });

  it('asks window.confirm before uninstalling; cancel does not uninstall', () => {
    const confirmMock = vi.fn(() => true);
    vi.stubGlobal('confirm', confirmMock);
    const onUninstall = vi.fn();
    const onOpen = vi.fn();
    const { container, root } = mount(
      <SkillCard skill={USER_SKILL} onOpen={onOpen} onToggle={() => {}} onUninstall={onUninstall} />,
    );
    const uninstallBtn = container.querySelector(`button[title="${zh['card.uninstallTitle']}"]`)!;
    click(uninstallBtn);
    expect(confirmMock).toHaveBeenCalledWith(zh['uninstall.confirm'].replace('{name}', USER_SKILL.name));
    expect(onUninstall).toHaveBeenCalledWith(USER_SKILL);
    expect(onOpen).not.toHaveBeenCalled();

    // Cancel path: no uninstall callback.
    confirmMock.mockReturnValue(false);
    click(uninstallBtn);
    expect(onUninstall).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
  });

  it('shows an inline error when copying to the clipboard fails', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
      configurable: true,
    });
    const { container, root } = mount(
      <SkillCard skill={USER_SKILL} onOpen={() => {}} onToggle={() => {}} onUninstall={() => {}} />,
    );
    click(container.querySelector(`button[title="${zh['card.copyPathTitle']}"]`)!);
    await flush();
    expect(container.textContent).toContain(zh['card.copyFail']);
    act(() => root.unmount());
    // @ts-expect-error cleanup: delete the stubbed clipboard
    delete navigator.clipboard;
  });

  it('is keyboard-reachable: Enter/Space open the card, nested control keydown does not', () => {
    const onOpen = vi.fn();
    const { container, root } = mount(
      <SkillCard skill={USER_SKILL} onOpen={onOpen} onToggle={() => {}} onUninstall={() => {}} />,
    );
    const card = container.querySelector('[data-skill-name]')!;
    expect(card.getAttribute('role')).toBe('button');
    expect(card.getAttribute('tabindex')).toBe('0');

    act(() => {
      card.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(onOpen).toHaveBeenCalledTimes(1);
    act(() => {
      card.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    });
    expect(onOpen).toHaveBeenCalledTimes(2);

    // A keydown that originates inside a nested control must not open the card.
    const sw = container.querySelector('button[role="switch"]')!;
    act(() => {
      sw.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(onOpen).toHaveBeenCalledTimes(2);
    act(() => root.unmount());
  });

  it('labels switch, copy and uninstall buttons with aria-label', () => {
    const { container, root } = mount(
      <SkillCard skill={USER_SKILL} onOpen={() => {}} onToggle={() => {}} onUninstall={() => {}} />,
    );
    const sw = container.querySelector('button[role="switch"]')!;
    expect(sw.getAttribute('aria-label')).toBe(zh['card.toggleTitle']);
    const copy = container.querySelector(`button[title="${zh['card.copyPathTitle']}"]`)!;
    expect(copy.getAttribute('aria-label')).toBe(zh['card.copyPathTitle']);
    const uninstall = container.querySelector(`button[title="${zh['card.uninstallTitle']}"]`)!;
    expect(uninstall.getAttribute('aria-label')).toBe(zh['card.uninstallTitle']);
    act(() => root.unmount());
  });
});

// ── ListView ────────────────────────────────────────────────────────────────

function renderList(api: ApiMock, overrides: Partial<Omit<ListViewProps, 'api'>> = {}) {
  const props: ListViewProps = {
    api: api as unknown as SkillApi,
    onOpenDetail: vi.fn(),
    onStartInstall: vi.fn(),
    onOpenTrash: vi.fn(),
    onChanged: vi.fn(),
    ...overrides,
  };
  const { container, root } = mount(<ListView {...props} />);
  return { container, root, props };
}

describe('ListView', () => {
  it('loads on mount, renders header buttons and both region groups with counts, hints and cards', async () => {
    const api = makeApi();
    api.list.mockResolvedValue(twoGroupPayload());
    const { container, root, props } = renderList(api);
    expect(api.list).toHaveBeenCalledWith({}); // initial load, no q

    // loading state before the promise settles
    expect(container.textContent).toContain(zh['panel.loading']);

    await flush();

    // header: title / subtitle / trash / install
    expect(container.textContent).toContain(zh['panel.title']);
    expect(container.textContent).toContain(zh['panel.subtitle']);
    const trashBtn = [...container.querySelectorAll('button')].find((b) => b.textContent?.includes(zh['panel.trashButton']));
    const installBtn = [...container.querySelectorAll('button')].find((b) => b.textContent?.includes(zh['panel.installButton']));
    expect(trashBtn).toBeDefined();
    expect(installBtn).toBeDefined();

    // group titles + hints + counts
    expect(container.textContent).toContain(zh['group.bundled.title']);
    expect(container.textContent).toContain(zh['group.bundled.hint']);
    expect(container.textContent).toContain(zh['group.user-dsh.title']);
    expect(container.textContent).toContain(zh['group.user-dsh.hint']);
    const bundledGroup = container.querySelector('[data-group-key="bundled"]')!;
    expect(bundledGroup.textContent).toContain('1');
    const userGroup = container.querySelector('[data-group-key="user-dsh"]')!;
    expect(userGroup.textContent).toContain('2');

    // cards with names + descriptions
    expect(container.textContent).toContain(BUNDLED_SKILL.name);
    expect(container.textContent).toContain(BUNDLED_SKILL.description);
    expect(container.textContent).toContain(USER_SKILL.name);
    expect(container.textContent).toContain(USER_SKILL.description);

    // header buttons wire their callbacks
    click(trashBtn!);
    expect(props.onOpenTrash).toHaveBeenCalledTimes(1);
    click(installBtn!);
    expect(props.onStartInstall).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
  });

  it('collapses a region when its header is clicked', async () => {
    const api = makeApi();
    api.list.mockResolvedValue(twoGroupPayload());
    const { container, root } = renderList(api);
    await flush();
    const userGroup = container.querySelector('[data-group-key="user-dsh"]')!;
    const header = userGroup.querySelector('button')!;
    expect(userGroup.querySelector('[data-skill-name]')).not.toBeNull();
    expect(header.getAttribute('aria-expanded')).toBe('true');
    click(header);
    expect(header.getAttribute('aria-expanded')).toBe('false');
    click(header);
    expect(header.getAttribute('aria-expanded')).toBe('true');
    act(() => root.unmount());
  });

  it('opens the detail view when a card is clicked', async () => {
    const api = makeApi();
    api.list.mockResolvedValue(twoGroupPayload());
    const { container, root, props } = renderList(api);
    await flush();
    const card = container.querySelector('[data-skill-name="dsh-doublecheck"]')!;
    click(card);
    expect(props.onOpenDetail).toHaveBeenCalledWith('dsh-doublecheck');
    act(() => root.unmount());
  });

  it('debounces search input and calls api.list with the latest q after 200ms', async () => {
    vi.useFakeTimers();
    const api = makeApi();
    api.list.mockResolvedValue(twoGroupPayload());
    const { container, root } = renderList(api);
    await flush();
    const input = container.querySelector('input')!;

    typeInput(input, 'git');
    await act(async () => {
      vi.advanceTimersByTime(199);
    });
    expect(api.list).toHaveBeenCalledTimes(1); // debounce not elapsed yet

    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    await flush();
    expect(api.list).toHaveBeenCalledTimes(2);
    expect(api.list).toHaveBeenLastCalledWith({ q: 'git' });

    // Rapid typing collapses into one call with the newest q.
    typeInput(input, 'gith');
    typeInput(input, 'github');
    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    await flush();
    expect(api.list).toHaveBeenCalledTimes(3);
    expect(api.list).toHaveBeenLastCalledWith({ q: 'github' });
    act(() => root.unmount());
  });

  it('toggles the switch through api.setEnabled and flips aria-checked', async () => {
    const api = makeApi();
    api.list.mockResolvedValue(twoGroupPayload());
    api.setEnabled.mockResolvedValue(undefined);
    const { container, root, props } = renderList(api);
    await flush();

    const sw = container.querySelector('button[role="switch"]')!;
    expect(sw.getAttribute('aria-checked')).toBe('true');
    click(sw);
    await flush();
    expect(api.setEnabled).toHaveBeenCalledWith(USER_SKILL.name, USER_SKILL.path, false);
    expect(sw.getAttribute('aria-checked')).toBe('false');
    expect(props.onChanged).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
  });

  it('uninstalls through api.uninstall after confirm and removes the card', async () => {
    vi.stubGlobal('confirm', vi.fn(() => true));
    const api = makeApi();
    api.list.mockResolvedValue(twoGroupPayload());
    api.uninstall.mockResolvedValue(undefined);
    const { container, root, props } = renderList(api);
    await flush();

    click(container.querySelector(`button[title="${zh['card.uninstallTitle']}"]`)!);
    await flush();
    expect(api.uninstall).toHaveBeenCalledWith(USER_SKILL.name, USER_SKILL.path);
    expect(container.querySelector('[data-skill-name="dsh-doublecheck"]')).toBeNull();
    expect(container.querySelector('[data-skill-name="session-brain"]')).not.toBeNull();
    expect(props.onChanged).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
  });

  it('shows the no-skills empty state when the payload has no groups', async () => {
    const api = makeApi();
    api.list.mockResolvedValue({ cwd: '/ws', groups: [], complete: true });
    const { container, root } = renderList(api);
    await flush();
    expect(container.textContent).toContain(zh['panel.emptyNoSkills']);
    act(() => root.unmount());
  });

  it('shows the no-match empty state while searching', async () => {
    vi.useFakeTimers();
    const api = makeApi();
    api.list.mockResolvedValue({ cwd: '/ws', groups: [], complete: true });
    const { container, root } = renderList(api);
    await flush();
    typeInput(container.querySelector('input')!, 'zzz');
    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    await flush();
    expect(container.textContent).toContain(zh['panel.emptyNoMatch'].replace('{q}', 'zzz'));
    act(() => root.unmount());
  });

  it('shows the load error state and recovers on retry', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const api = makeApi();
    api.list.mockRejectedValueOnce(new Error('boom')).mockResolvedValue(twoGroupPayload());
    const { container, root } = renderList(api);
    await flush();
    expect(container.textContent).toContain(zh['panel.loadError']);

    const retry = [...container.querySelectorAll('button')].find((b) => b.textContent?.includes(zh['panel.retry']));
    expect(retry).toBeDefined();
    click(retry!);
    await flush();
    expect(api.list).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain(USER_SKILL.name);
    expect(warn).not.toHaveBeenCalled(); // no stray console noise on the happy path
    warn.mockRestore();
    act(() => root.unmount());
  });

  it('shows an inline error when the toggle fails and recovers on the next success', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const api = makeApi();
    api.list.mockResolvedValue(twoGroupPayload());
    api.setEnabled.mockRejectedValueOnce(new Error('boom')).mockResolvedValue(undefined);
    const { container, root, props } = renderList(api);
    await flush();

    const sw = container.querySelector('button[role="switch"]')!;
    click(sw);
    await flush();
    expect(api.setEnabled).toHaveBeenCalledWith(USER_SKILL.name, USER_SKILL.path, false);
    expect(container.textContent).toContain(zh['toggle.fail'].replace('{error}', 'boom'));
    expect(sw.getAttribute('aria-checked')).toBe('true'); // unchanged on failure
    expect(props.onChanged).not.toHaveBeenCalled();

    // Retry succeeds: error clears and the switch flips.
    click(sw);
    await flush();
    expect(container.textContent).not.toContain(zh['toggle.fail'].replace('{error}', 'boom'));
    expect(sw.getAttribute('aria-checked')).toBe('false');
    expect(props.onChanged).toHaveBeenCalledTimes(1);
    warn.mockRestore();
    act(() => root.unmount());
  });

  it('shows an inline error when uninstall fails and keeps the card', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('confirm', vi.fn(() => true));
    const api = makeApi();
    api.list.mockResolvedValue(twoGroupPayload());
    api.uninstall.mockRejectedValueOnce(new Error('locked'));
    const { container, root } = renderList(api);
    await flush();

    click(container.querySelector(`button[title="${zh['card.uninstallTitle']}"]`)!);
    await flush();
    expect(api.uninstall).toHaveBeenCalledWith(USER_SKILL.name, USER_SKILL.path);
    expect(container.textContent).toContain(zh['uninstall.fail'].replace('{error}', 'locked'));
    expect(container.querySelector('[data-skill-name="dsh-doublecheck"]')).not.toBeNull();
    warn.mockRestore();
    act(() => root.unmount());
  });

  it('skips search while IME-composing and queries once after compositionend', async () => {
    vi.useFakeTimers();
    const api = makeApi();
    api.list.mockResolvedValue(twoGroupPayload());
    const { container, root } = renderList(api);
    await flush();
    const input = container.querySelector('input')!;

    act(() => {
      input.dispatchEvent(new Event('compositionstart', { bubbles: true }));
    });
    typeInput(input, 'nǐ'); // intermediate composition value
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    expect(api.list).toHaveBeenCalledTimes(1); // no search fired while composing

    act(() => {
      input.dispatchEvent(new Event('compositionend', { bubbles: true }));
    });
    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    await flush();
    expect(api.list).toHaveBeenCalledTimes(2);
    expect(api.list).toHaveBeenLastCalledWith({ q: 'nǐ' });
    act(() => root.unmount());
  });

  it('drops a stale list response that resolves after a newer search', async () => {
    vi.useFakeTimers();
    const api = makeApi();
    const first = deferred<ListPayload>();
    const second = deferred<ListPayload>();
    api.list.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { container, root } = renderList(api);
    await flush();
    expect(container.textContent).toContain(zh['panel.loading']); // initial request still pending

    typeInput(container.querySelector('input')!, 'git');
    await act(async () => {
      vi.advanceTimersByTime(200);
    });

    // The newer request resolves first and wins.
    await act(async () => {
      second.resolve({ cwd: '/ws', complete: true, groups: [group('user-dsh', 'x', 'h', [USER_SKILL])] });
    });
    await flush();
    expect(container.textContent).toContain(USER_SKILL.name);

    // The stale initial request resolves later and must be ignored.
    await act(async () => {
      first.resolve({ cwd: '/ws', complete: true, groups: [group('bundled', 'x', 'h', [BUNDLED_SKILL])] });
    });
    await flush();
    expect(container.textContent).not.toContain(BUNDLED_SKILL.name);
    expect(container.textContent).toContain(USER_SKILL.name);
    act(() => root.unmount());
  });

  it('keeps region collapse state across re-fetches', async () => {
    vi.useFakeTimers();
    const api = makeApi();
    api.list.mockResolvedValue(twoGroupPayload());
    const { container, root } = renderList(api);
    await flush();

    const header = () => container.querySelector('[data-group-key="user-dsh"] button')!;
    click(header());
    expect(header().getAttribute('aria-expanded')).toBe('false');

    typeInput(container.querySelector('input')!, 'git');
    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    await flush();
    expect(api.list).toHaveBeenCalledTimes(2);
    expect(header().getAttribute('aria-expanded')).toBe('false');
    act(() => root.unmount());
  });
});
