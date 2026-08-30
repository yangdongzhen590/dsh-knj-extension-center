/** @vitest-environment jsdom */
// Trash view (Task 12): TrashView renders recoverable trash entries (name /
// original path / deleted time + restore / purge buttons) and the 清空回收站
// header action (purges every entry after window.confirm). Renders with
// react-dom/client + act like list-view.test.tsx; api.trashList /
// trashRestore / trashPurge are mocked per test. Vitest stubs CSS modules
// (css: false default), so assertions target roles, data attributes and
// visible text, not hashed class names.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ApiError, type SkillApi, type TrashItem } from '../src/client/api';
import { TrashView, type TrashViewProps } from '../src/client/views/TrashView';
import { zh } from '../src/client/locales';

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  document.body.innerHTML = '';
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

const ITEM_A: TrashItem = {
  name: 'dsh-knj-prompts',
  trashPath: 'D:\\ws\\.dsh\\skills\\.trash\\dsh-knj-prompts-1700000000000',
  originalPath: '~/.dsh/skills/dsh-knj-prompts',
  deletedAt: '1700000000000',
  legacy: false,
};

/** Legacy single-file entry: original location unknown (originalPath ''). */
const ITEM_B: TrashItem = {
  name: 'my-workflow',
  trashPath: 'D:\\ws\\.dsh\\skills\\.trash\\1699990000000-SKILL.md',
  originalPath: '',
  deletedAt: '1699990000000',
  legacy: true,
};

/** Minimal SkillApi double; only the trash methods TrashView calls. */
type ApiMock = {
  trashList: ReturnType<typeof vi.fn<SkillApi['trashList']>>;
  trashRestore: ReturnType<typeof vi.fn<SkillApi['trashRestore']>>;
  trashPurge: ReturnType<typeof vi.fn<SkillApi['trashPurge']>>;
};

function makeApi(): ApiMock {
  return {
    trashList: vi.fn<SkillApi['trashList']>(),
    trashRestore: vi.fn<SkillApi['trashRestore']>(),
    trashPurge: vi.fn<SkillApi['trashPurge']>(),
  };
}

function renderTrash(
  api: ApiMock,
  overrides: Partial<Omit<TrashViewProps, 'api'>> = {},
): { container: HTMLDivElement; root: Root; props: TrashViewProps } {
  const props: TrashViewProps = {
    api: api as unknown as SkillApi,
    onBack: vi.fn(),
    onChanged: vi.fn(),
    ...overrides,
  };
  const { container, root } = mount(<TrashView {...props} />);
  return { container, root, props };
}

/** The trash row for `name` (data-trash-name). */
function row(container: HTMLElement, name: string): HTMLElement | null {
  return container.querySelector(`[data-trash-name="${name}"]`);
}

/** The first button inside `scope` whose visible text includes `label`. */
function buttonByText(scope: ParentNode, label: string): HTMLButtonElement {
  return [...scope.querySelectorAll('button')].find((b) => b.textContent?.includes(label)) as HTMLButtonElement;
}

// ── TrashView ───────────────────────────────────────────────────────────────

describe('TrashView', () => {
  it('loads on mount and renders header, per-item name/path/time and restore/purge buttons', async () => {
    const api = makeApi();
    api.trashList.mockResolvedValue({ items: [ITEM_A, ITEM_B] });
    const { container, root } = renderTrash(api);
    expect(api.trashList).toHaveBeenCalledTimes(1);

    // loading state before the promise settles
    expect(container.textContent).toContain(zh['panel.loading']);

    await flush();

    // header: back / title / subtitle / clear-all
    expect(container.textContent).toContain(zh['trash.back']);
    expect(container.textContent).toContain(zh['trash.title']);
    expect(container.textContent).toContain(zh['trash.subtitle']);
    expect(buttonByText(container, zh['trash.clearAll'])).toBeDefined();

    // row: name + path · formatted deleted time (raw timestamp not shown)
    const rowA = row(container, 'dsh-knj-prompts')!;
    expect(rowA).not.toBeNull();
    expect(rowA.textContent).toContain(ITEM_A.originalPath);
    expect(rowA.textContent).toMatch(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}/);
    expect(rowA.textContent).not.toContain(ITEM_A.deletedAt);

    // legacy entry (no original path) still shows name + formatted time
    const rowB = row(container, 'my-workflow')!;
    expect(rowB.textContent).toContain('my-workflow');
    expect(rowB.textContent).toMatch(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}/);

    // per-row actions
    expect(buttonByText(rowA, zh['trash.restore'])).toBeDefined();
    expect(buttonByText(rowA, zh['trash.purge'])).toBeDefined();
    act(() => root.unmount());
  });

  it('calls onBack when the back button is clicked', async () => {
    const api = makeApi();
    api.trashList.mockResolvedValue({ items: [] });
    const { container, root, props } = renderTrash(api);
    await flush();
    click(buttonByText(container, zh['trash.back']));
    expect(props.onBack).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
  });

  it('restores through api.trashRestore, drops the row and reports onChanged', async () => {
    const api = makeApi();
    api.trashList.mockResolvedValue({ items: [ITEM_A, ITEM_B] });
    api.trashRestore.mockResolvedValue(undefined);
    const { container, root, props } = renderTrash(api);
    await flush();

    click(buttonByText(row(container, 'dsh-knj-prompts')!, zh['trash.restore']));
    await flush();
    expect(api.trashRestore).toHaveBeenCalledWith(ITEM_A.trashPath);
    expect(row(container, 'dsh-knj-prompts')).toBeNull();
    expect(row(container, 'my-workflow')).not.toBeNull();
    expect(props.onChanged).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
  });

  it('shows the host 409 message when restore fails and keeps the row', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const api = makeApi();
    api.trashList.mockResolvedValue({ items: [ITEM_A] });
    api.trashRestore.mockRejectedValue(new ApiError('original path occupied', 409));
    const { container, root, props } = renderTrash(api);
    await flush();

    click(buttonByText(row(container, 'dsh-knj-prompts')!, zh['trash.restore']));
    await flush();
    expect(api.trashRestore).toHaveBeenCalledWith(ITEM_A.trashPath);
    expect(container.textContent).toContain(zh['trash.restoreFail'].replace('{error}', 'original path occupied'));
    expect(row(container, 'dsh-knj-prompts')).not.toBeNull();
    expect(props.onChanged).not.toHaveBeenCalled();
    warn.mockRestore();
    act(() => root.unmount());
  });

  it('purges after window.confirm and reports onChanged; cancel calls no api', async () => {
    const confirmMock = vi.fn(() => true);
    vi.stubGlobal('confirm', confirmMock);
    const api = makeApi();
    api.trashList.mockResolvedValue({ items: [ITEM_A, ITEM_B] });
    api.trashPurge.mockResolvedValue(undefined);
    const { container, root, props } = renderTrash(api);
    await flush();

    click(buttonByText(row(container, 'dsh-knj-prompts')!, zh['trash.purge']));
    expect(confirmMock).toHaveBeenCalledWith(zh['trash.purgeConfirm'].replace('{name}', ITEM_A.name));
    await flush();
    expect(api.trashPurge).toHaveBeenCalledTimes(1);
    expect(api.trashPurge).toHaveBeenCalledWith(ITEM_A.trashPath);
    expect(row(container, 'dsh-knj-prompts')).toBeNull();
    expect(props.onChanged).toHaveBeenCalledTimes(1);

    // cancel path: confirm() = false → no api call, row stays
    confirmMock.mockReturnValue(false);
    click(buttonByText(row(container, 'my-workflow')!, zh['trash.purge']));
    await flush();
    expect(api.trashPurge).toHaveBeenCalledTimes(1);
    expect(row(container, 'my-workflow')).not.toBeNull();
    expect(props.onChanged).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
  });

  it('clears the trash after confirm by purging every entry and shows the empty state', async () => {
    const confirmMock = vi.fn(() => true);
    vi.stubGlobal('confirm', confirmMock);
    const api = makeApi();
    api.trashList.mockResolvedValue({ items: [ITEM_A, ITEM_B] });
    api.trashPurge.mockResolvedValue(undefined);
    const { container, root, props } = renderTrash(api);
    await flush();

    click(buttonByText(container, zh['trash.clearAll']));
    expect(confirmMock).toHaveBeenCalledWith(zh['trash.clearAllConfirm']);
    await flush();
    expect(api.trashPurge).toHaveBeenCalledTimes(2);
    expect(api.trashPurge).toHaveBeenCalledWith(ITEM_A.trashPath);
    expect(api.trashPurge).toHaveBeenCalledWith(ITEM_B.trashPath);
    expect(container.textContent).toContain(zh['trash.empty']);
    expect(props.onChanged).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
  });

  it('keeps failed entries when clearing all and shows an error banner', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('confirm', vi.fn(() => true));
    const api = makeApi();
    api.trashList.mockResolvedValue({ items: [ITEM_A, ITEM_B] });
    api.trashPurge.mockRejectedValueOnce(new ApiError('boom', 500)).mockResolvedValueOnce(undefined);
    const { container, root, props } = renderTrash(api);
    await flush();

    click(buttonByText(container, zh['trash.clearAll']));
    await flush();
    expect(container.textContent).toContain(zh['trash.clearFail'].replace('{error}', 'boom'));
    expect(row(container, 'dsh-knj-prompts')).not.toBeNull(); // failed entry stays
    expect(row(container, 'my-workflow')).toBeNull(); // purged entry gone
    expect(props.onChanged).toHaveBeenCalledTimes(1); // trash changed underneath
    warn.mockRestore();
    act(() => root.unmount());
  });

  it('shows the empty state when trashList has no items', async () => {
    const api = makeApi();
    api.trashList.mockResolvedValue({ items: [] });
    const { container, root } = renderTrash(api);
    await flush();
    expect(container.textContent).toContain(zh['trash.empty']);
    act(() => root.unmount());
  });

  it('shows the load error state and recovers on retry', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const api = makeApi();
    api.trashList.mockRejectedValueOnce(new Error('boom')).mockResolvedValue({ items: [ITEM_A] });
    const { container, root } = renderTrash(api);
    await flush();
    expect(container.textContent).toContain(zh['trash.loadError'].replace('{error}', 'boom'));

    const retry = buttonByText(container, zh['panel.retry']);
    expect(retry).toBeDefined();
    click(retry);
    await flush();
    expect(api.trashList).toHaveBeenCalledTimes(2);
    expect(row(container, 'dsh-knj-prompts')).not.toBeNull();
    expect(warn).not.toHaveBeenCalled(); // no stray console noise on the happy path
    warn.mockRestore();
    act(() => root.unmount());
  });

  it('shows an inline error when a single purge fails and keeps the row', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('confirm', vi.fn(() => true));
    const api = makeApi();
    api.trashList.mockResolvedValue({ items: [ITEM_A] });
    api.trashPurge.mockRejectedValueOnce(new ApiError('trash item not found', 404));
    const { container, root, props } = renderTrash(api);
    await flush();

    click(buttonByText(row(container, 'dsh-knj-prompts')!, zh['trash.purge']));
    await flush();
    expect(container.textContent).toContain(zh['trash.purgeFail'].replace('{error}', 'trash item not found'));
    expect(row(container, 'dsh-knj-prompts')).not.toBeNull();
    expect(props.onChanged).not.toHaveBeenCalled();
    warn.mockRestore();
    act(() => root.unmount());
  });
});
