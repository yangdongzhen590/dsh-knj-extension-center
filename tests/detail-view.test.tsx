/** @vitest-environment jsdom */
// Detail view (Task 11): DetailView + markdownLite. DetailView renders with
// react-dom/client + act like list-view.test.tsx; `api.detail` is mocked per
// test. markdownLite is a pure function: escape-first (XSS-safe) then apply
// the supported markers (# heading, - list, `code`, **bold**, pre fences).
// Vitest stubs CSS modules (css: false default), so assertions target roles,
// data attributes and visible text, not hashed class names.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { DetailPayload, SkillApi } from '../src/client/api';
import { DetailView, type DetailViewProps } from '../src/client/views/DetailView';
import { markdownLite } from '../src/client/views/markdown-lite';
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

/** User skill detail (frontmatter arrives raw including the --- fences). */
const USER_DETAIL: DetailPayload = {
  name: 'dsh-doublecheck',
  description: '工程纪律套件：需求盘问 → 规格记录',
  whenToUse: '需要交付物质量把关时',
  level: 'user-dsh',
  path: '~/.dsh/skills/dsh-doublecheck/SKILL.md',
  linked: false,
  modelInvocable: true,
  userInvocable: true,
  frontmatter: '---\nname: dsh-doublecheck\ndescription: 工程纪律套件\n---',
  body: '## 交付纪律\n\n- 测试先行（red → green）\n- `npm test` 通过\n- **交付前复查**',
};

/** Bundled skill: no file path → no switch / copy / uninstall actions. */
const BUNDLED_DETAIL: DetailPayload = {
  name: 'code-review',
  level: 'bundled',
  path: undefined,
  modelInvocable: false,
  userInvocable: false,
  linked: false,
  frontmatter: '---\nname: code-review\n---',
  body: '# 审查变更',
};

/** Host-only payload: the detail route sends { name, frontmatter, body } and
 *  nothing else — every metadata field is undefined and must be null-checked. */
const HOST_ONLY_DETAIL: DetailPayload = {
  name: 'demo',
  frontmatter: '---\nname: demo\n---',
  body: '# Demo\n\nplain body',
};

/** Minimal SkillApi double; `detail` is the only method DetailView calls. */
type ApiMock = {
  detail: ReturnType<typeof vi.fn<SkillApi['detail']>>;
};

function makeApi(): ApiMock {
  return { detail: vi.fn<SkillApi['detail']>() };
}

function renderDetail(
  api: ApiMock,
  overrides: Partial<Omit<DetailViewProps, 'api'>> = {},
): { container: HTMLDivElement; root: Root; props: DetailViewProps } {
  const props: DetailViewProps = {
    api: api as unknown as SkillApi,
    name: 'dsh-doublecheck',
    onBack: vi.fn(),
    onUninstall: vi.fn(),
    onToggle: vi.fn(),
    ...overrides,
  };
  const { container, root } = mount(<DetailView {...props} />);
  return { container, root, props };
}

// ── markdownLite ────────────────────────────────────────────────────────────

describe('markdownLite', () => {
  it('escapes raw HTML before applying markers (XSS-safe)', () => {
    const out = markdownLite('<script>alert(1)</script>');
    expect(out).not.toContain('<script>');
    expect(out).toContain('&lt;script&gt;');
    expect(out).toContain('alert(1)');
  });

  it('escapes all five special characters', () => {
    const out = markdownLite('a & b < c > d " e \' f');
    expect(out).toContain('a &amp; b &lt; c &gt; d &quot; e &#39; f');
    expect(out).not.toContain('<p>a & b');
  });

  it('renders # headings as h2 and ## as h2', () => {
    expect(markdownLite('# Title')).toBe('<h2>Title</h2>');
    expect(markdownLite('## Sub')).toContain('<h2>Sub</h2>');
  });

  it('renders - list items', () => {
    expect(markdownLite('- item')).toBe('<ul><li>item</li></ul>');
  });

  it('renders `code` and **bold** inline', () => {
    const out = markdownLite('run `npm test` now');
    expect(out).toContain('<code>npm test</code>');
    expect(out).toContain('<p>run <code>npm test</code> now</p>');
    expect(markdownLite('**bold**')).toContain('<b>bold</b>');
    expect(markdownLite('**a** and `b`')).toContain('<b>a</b> and <code>b</code>');
  });

  it('renders pre blocks verbatim and escaped', () => {
    const out = markdownLite('```\nline one\n<script>\n```');
    expect(out).toContain('<pre>');
    expect(out).toContain('</pre>');
    expect(out).toContain('line one');
    expect(out).toContain('&lt;script&gt;');
    expect(out).not.toContain('<script>');
  });

  it('wraps plain lines in <p> and skips blank lines', () => {
    expect(markdownLite('plain')).toBe('<p>plain</p>');
    expect(markdownLite('a\n\nb')).toBe('<p>a</p>\n<p>b</p>');
  });

  it('renders markers inside headings and list items', () => {
    expect(markdownLite('## **Bold** head')).toContain('<h2><b>Bold</b> head</h2>');
    expect(markdownLite('- `code` item')).toContain('<li><code>code</code> item</li>');
  });

  it('returns empty string for empty input', () => {
    expect(markdownLite('')).toBe('');
  });
});

// ── DetailView ──────────────────────────────────────────────────────────────

describe('DetailView', () => {
  it('loads on mount and renders name, badges, frontmatter and markdown body', async () => {
    const api = makeApi();
    api.detail.mockResolvedValue(USER_DETAIL);
    const { container, root } = renderDetail(api);
    expect(api.detail).toHaveBeenCalledWith('dsh-doublecheck');

    // loading state before the promise settles
    expect(container.textContent).toContain(zh['panel.loading']);

    await flush();

    expect(container.textContent).toContain('dsh-doublecheck');
    // invokable badge: 模型 · 用户
    expect(container.textContent).toContain(
      zh['card.invokable'].replace('{names}', `${zh['card.model']} · ${zh['card.user']}`),
    );
    // frontmatter block renders the raw fenced text
    expect(container.textContent).toContain('---\nname: dsh-doublecheck');
    // markdown body: heading / list / code / bold
    expect(container.textContent).toContain('交付纪律');
    expect(container.textContent).toContain('测试先行（red → green）');
    expect(container.textContent).toContain('npm test');
    expect(container.textContent).toContain('交付前复查');
    act(() => root.unmount());
  });

  it('shows the user-skill path line and renders actions (switch/copy/uninstall)', async () => {
    const api = makeApi();
    api.detail.mockResolvedValue(USER_DETAIL);
    const { container, root } = renderDetail(api);
    await flush();
    expect(container.textContent).toContain('~/.dsh/skills/dsh-doublecheck/SKILL.md');

    const sw = container.querySelector('button[role="switch"]')!;
    expect(sw).not.toBeNull();
    expect(sw.getAttribute('aria-checked')).toBe('true');
    expect(container.querySelector(`button[title="${zh['card.toggleTitle']}"]`)).not.toBeNull();
    expect([...container.querySelectorAll('button')].some((b) => b.textContent?.includes(zh['detail.copyPath']))).toBe(true);
    expect([...container.querySelectorAll('button')].some((b) => b.textContent?.includes(zh['detail.uninstall']))).toBe(true);
    act(() => root.unmount());
  });

  it('calls onBack when the back button is clicked', async () => {
    const api = makeApi();
    api.detail.mockResolvedValue(USER_DETAIL);
    const { container, root, props } = renderDetail(api);
    await flush();
    const back = [...container.querySelectorAll('button')].find((b) => b.textContent?.includes(zh['detail.backToList']))!;
    expect(back).toBeDefined();
    click(back);
    expect(props.onBack).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
  });

  it('copies the path via navigator.clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const api = makeApi();
    api.detail.mockResolvedValue(USER_DETAIL);
    const { container, root } = renderDetail(api);
    await flush();
    const copy = [...container.querySelectorAll('button')].find((b) => b.textContent?.includes(zh['detail.copyPath']))!;
    click(copy);
    expect(writeText).toHaveBeenCalledWith(USER_DETAIL.path);
    act(() => root.unmount());
    // @ts-expect-error cleanup: delete the stubbed clipboard
    delete navigator.clipboard;
  });

  it('asks window.confirm before uninstalling; cancel does not call onUninstall', async () => {
    const confirmMock = vi.fn(() => true);
    vi.stubGlobal('confirm', confirmMock);
    const api = makeApi();
    api.detail.mockResolvedValue(USER_DETAIL);
    const { container, root, props } = renderDetail(api);
    await flush();
    const uninstall = [...container.querySelectorAll('button')].find((b) => b.textContent?.includes(zh['detail.uninstall']))!;
    click(uninstall);
    expect(confirmMock).toHaveBeenCalledWith(zh['uninstall.confirm'].replace('{name}', USER_DETAIL.name));
    expect(props.onUninstall).toHaveBeenCalledTimes(1);

    // Cancel path: no callback.
    confirmMock.mockReturnValue(false);
    click(uninstall);
    expect(props.onUninstall).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
  });

  it('flips the switch intent through onToggle with the target state', async () => {
    const api = makeApi();
    api.detail.mockResolvedValue(USER_DETAIL);
    const { container, root, props } = renderDetail(api);
    await flush();
    const sw = container.querySelector('button[role="switch"]')!;
    expect(sw.getAttribute('aria-checked')).toBe('true');
    click(sw);
    // current state is on → target is off
    expect(props.onToggle).toHaveBeenCalledWith(false);
    act(() => root.unmount());
  });

  it('shows bundled path line and hides actions when path is undefined', async () => {
    const api = makeApi();
    api.detail.mockResolvedValue(BUNDLED_DETAIL);
    const { container, root } = renderDetail(api, { name: 'code-review' });
    await flush();
    expect(container.textContent).toContain(zh['detail.pathBundled']);
    expect(container.querySelector('button[role="switch"]')).toBeNull();
    expect([...container.querySelectorAll('button')].some((b) => b.textContent?.includes(zh['detail.copyPath']))).toBe(false);
    expect([...container.querySelectorAll('button')].some((b) => b.textContent?.includes(zh['detail.uninstall']))).toBe(false);
    act(() => root.unmount());
  });

  it('null-checks a host-only payload: renders name/frontmatter/body, no path line, no actions', async () => {
    const api = makeApi();
    api.detail.mockResolvedValue(HOST_ONLY_DETAIL);
    const { container, root } = renderDetail(api, { name: 'demo' });
    await flush();
    expect(container.textContent).toContain('demo');
    expect(container.textContent).toContain('name: demo'); // frontmatter
    expect(container.textContent).toContain('Demo'); // body heading
    expect(container.textContent).not.toContain('~/.dsh/skills/demo/SKILL.md');
    expect(container.querySelector('button[role="switch"]')).toBeNull();
    act(() => root.unmount());
  });

  it('shows a load error state and recovers on retry', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const api = makeApi();
    api.detail.mockRejectedValueOnce(new Error('boom')).mockResolvedValue(USER_DETAIL);
    const { container, root } = renderDetail(api);
    await flush();
    expect(container.textContent).toContain(zh['panel.loadError']);

    const retry = [...container.querySelectorAll('button')].find((b) => b.textContent?.includes(zh['panel.retry']))!;
    expect(retry).toBeDefined();
    click(retry);
    await flush();
    expect(api.detail).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain('dsh-doublecheck');
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
    act(() => root.unmount());
  });

  it('never injects a <script> element from hostile body content', async () => {
    const api = makeApi();
    api.detail.mockResolvedValue({
      ...HOST_ONLY_DETAIL,
      body: '<script>window.pwned = 1</script>\n\n## safe heading',
    });
    const { container, root } = renderDetail(api, { name: 'demo' });
    await flush();
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('h2')).not.toBeNull();
    expect(container.textContent).toContain('safe heading');
    act(() => root.unmount());
  });
});
