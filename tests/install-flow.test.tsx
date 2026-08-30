/** @vitest-environment jsdom */
// Install flow (Task 13): InstallFlow + ConflictDialog. Renders with
// react-dom/client + act like menu-entry.test.tsx. The zip preview is parsed
// LOCALLY with real jszip: each test builds an actual zip Buffer with JSZip
// and wraps it in a jsdom File, then drives the hidden file input's change
// event — `api.install` must NOT be called until the confirm card's 安装
// button is pressed (preview/install separation). Vitest stubs CSS modules,
// so assertions target roles, data attributes and visible text.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import JSZip from 'jszip';
import type { InstallConflict, SkillApi } from '../src/client/api';
import { ConflictDialog, type ConflictDialogProps } from '../src/client/views/ConflictDialog';
import { InstallFlow, type InstallFlowProps } from '../src/client/views/InstallFlow';
import { zh } from '../src/client/locales';

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  document.body.innerHTML = '';
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

/**
 * Flush pending async work inside act. jszip's FileReader-backed parse and
 * the resolved api promises settle across several macrotask ticks, so drain
 * the timer queue a few times instead of betting on a single tick.
 */
async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

function click(el: Element): void {
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

/** Find a button by its visible text (locale copy). */
function buttonByText(container: Element, text: string): HTMLButtonElement {
  const btn = [...container.querySelectorAll('button')].find((b) => b.textContent?.includes(text));
  if (btn === undefined) throw new Error(`no button with text: ${text}`);
  return btn as HTMLButtonElement;
}

/** Drive the hidden file input's change event with `file`. */
function selectFile(container: Element, file: File): void {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  act(() => {
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

/** Real zip → jsdom File (jszip runs in the test, not the component). */
async function zipFile(entries: Record<string, string>): Promise<File> {
  const zip = new JSZip();
  for (const [p, c] of Object.entries(entries)) zip.file(p, c);
  const bytes = await zip.generateAsync({ type: 'uint8array' });
  return new File([bytes], 'skill-package.zip', { type: 'application/zip' });
}

const VALID_SKILL: Record<string, string> = {
  'my-skill/SKILL.md': '---\nname: my-skill\ndescription: 我的测试技能描述\n---\nbody text',
  'my-skill/references/checklist.md': 'x',
  'my-skill/README.md': 'readme',
};

const VALID_CONFLICT: InstallConflict = {
  conflict: true,
  existing: {
    name: 'my-skill',
    description: '已安装的旧版本',
    level: 'user-dsh',
    path: '~/.dsh/skills/my-skill/SKILL.md',
  },
};

function makeApi(): { install: ReturnType<typeof vi.fn<SkillApi['install']>> } {
  return { install: vi.fn<SkillApi['install']>() };
}

function renderFlow(api: { install: ReturnType<typeof vi.fn<SkillApi['install']>> }, overrides: Partial<Omit<InstallFlowProps, 'api'>> = {}) {
  const props: InstallFlowProps = {
    api: api as unknown as SkillApi,
    onDone: vi.fn(),
    onCancel: vi.fn(),
    ...overrides,
  };
  const { container, root } = mount(<InstallFlow {...props} />);
  return { container, root, props };
}

// ── ConflictDialog (standalone) ─────────────────────────────────────────────

describe('ConflictDialog', () => {
  const existing: InstallConflict['existing'] = {
    name: 'my-skill',
    description: '旧版描述',
    level: 'user-dsh',
    path: '~/.dsh/skills/my-skill/SKILL.md',
  };

  it('shows the existing version source + path and wires overwrite/cancel', () => {
    const onOverwrite = vi.fn();
    const onCancel = vi.fn();
    const { container, root } = mount(
      <ConflictDialog existing={existing} onOverwrite={onOverwrite} onCancel={onCancel} />,
    );
    expect(container.textContent).toContain(zh['conflict.title']);
    expect(container.textContent).toContain(zh['conflict.bodyPrefix'].replace('{name}', 'my-skill'));
    expect(container.textContent).toContain(zh['conflict.existingLabel']);
    expect(container.textContent).toContain(zh['group.user-dsh.title']);
    expect(container.textContent).toContain('~/.dsh/skills/my-skill/SKILL.md');

    click(buttonByText(container, zh['conflict.cancel']));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onOverwrite).not.toHaveBeenCalled();

    click(buttonByText(container, zh['conflict.overwrite']));
    expect(onOverwrite).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
  });

  it('falls back to the user-dsh source label when level is unknown', () => {
    const { container, root } = mount(
      <ConflictDialog existing={{ name: 'x' }} onOverwrite={() => {}} onCancel={() => {}} />,
    );
    expect(container.textContent).toContain(zh['group.user-dsh.title']);
    act(() => root.unmount());
  });
});

// ── InstallFlow ─────────────────────────────────────────────────────────────

describe('InstallFlow', () => {
  it('renders the header, the 3-step bar and the dropzone on mount', () => {
    const api = makeApi();
    const { container, root } = renderFlow(api);
    expect(container.textContent).toContain(zh['install.title']);
    expect(container.textContent).toContain(zh['install.subtitle']);
    expect(container.textContent).toContain(zh['install.step1']);
    expect(container.textContent).toContain(zh['install.step2']);
    expect(container.textContent).toContain(zh['install.step3']);
    expect(container.textContent).toContain(zh['install.dropzoneMain']);
    expect(container.textContent).toContain(zh['install.dropzoneSub']);
    expect(container.textContent).toContain(zh['install.format']);
    const input = container.querySelector('input[type="file"]')!;
    expect(input.getAttribute('accept')).toBe('.zip');
    act(() => root.unmount());
  });

  it('parses a valid zip locally and shows the confirm card WITHOUT uploading', async () => {
    const api = makeApi();
    const { container, root } = renderFlow(api);
    selectFile(container, await zipFile(VALID_SKILL));
    await flush();

    // preview/install separation: nothing uploaded yet
    expect(api.install).not.toHaveBeenCalled();

    // step 2 current, step 1 done
    expect(container.querySelector('[data-step="1"]')?.getAttribute('aria-current')).toBeNull();
    expect(container.querySelector('[data-step="2"]')?.getAttribute('aria-current')).toBe('step');

    // confirm card: file name, skill name, description, target, contents
    expect(container.textContent).toContain('skill-package.zip');
    expect(container.textContent).toContain(zh['install.fieldName']);
    expect(container.textContent).toContain('my-skill');
    expect(container.textContent).toContain(zh['install.fieldDescription']);
    expect(container.textContent).toContain('我的测试技能描述');
    expect(container.textContent).toContain(zh['install.fieldTarget']);
    expect(container.textContent).toContain('~/.dsh/skills/my-skill/');
    expect(container.textContent).toContain(zh['install.fieldContents'].replace('{count}', '3'));
    expect(container.textContent).toContain('SKILL.md');
    expect(container.textContent).toContain('references/');
    expect(container.textContent).toContain('checklist.md');

    // reselect + install buttons present
    expect(buttonByText(container, zh['install.reselect'])).toBeDefined();
    expect(buttonByText(container, zh['install.confirmInstall'])).toBeDefined();
    act(() => root.unmount());
  });

  it('rejects a zip without <name>/SKILL.md and stays on step 1', async () => {
    const api = makeApi();
    const { container, root } = renderFlow(api);
    selectFile(container, await zipFile({ 'my-skill/README.md': 'no skill' }));
    await flush();
    expect(container.textContent).toContain(zh['install.errorNoSkillMd'].replace('{name}', 'my-skill'));
    expect(container.querySelector('[data-step="1"]')?.getAttribute('aria-current')).toBe('step');
    expect(api.install).not.toHaveBeenCalled();
    act(() => root.unmount());
  });

  it('rejects an invalid (non-kebab-case) skill name', async () => {
    const api = makeApi();
    const { container, root } = renderFlow(api);
    selectFile(container, await zipFile({ 'Bad Name/SKILL.md': '---\nname: Bad Name\ndescription: d\n---\n' }));
    await flush();
    expect(container.textContent).toContain(zh['install.errorInvalidName'].replace('{name}', 'Bad Name'));
    expect(api.install).not.toHaveBeenCalled();
    act(() => root.unmount());
  });

  it('rejects a SKILL.md without description', async () => {
    const api = makeApi();
    const { container, root } = renderFlow(api);
    selectFile(container, await zipFile({ 'my-skill/SKILL.md': '---\nname: my-skill\n---\n' }));
    await flush();
    expect(container.textContent).toContain(zh['install.errorNoDescription']);
    expect(api.install).not.toHaveBeenCalled();
    act(() => root.unmount());
  });

  it('rejects a non-zip file with the generic parse error', async () => {
    const api = makeApi();
    const { container, root } = renderFlow(api);
    selectFile(container, new File(['this is not a zip archive'], 'broken.zip', { type: 'application/zip' }));
    await flush();
    expect(container.textContent).toContain(zh['install.errorNotZip']);
    expect(api.install).not.toHaveBeenCalled();
    act(() => root.unmount());
  });

  it('rejects a zip with files at the root (not a single skill dir)', async () => {
    const api = makeApi();
    const { container, root } = renderFlow(api);
    selectFile(container, await zipFile({ 'README.md': 'root file', 'my-skill/SKILL.md': '---\nname: my-skill\ndescription: d\n---\n' }));
    await flush();
    expect(container.textContent).toContain(zh['install.errorLayout']);
    act(() => root.unmount());
  });

  it('installs the zip, then shows the success card and finishes via onDone', async () => {
    const api = makeApi();
    api.install.mockResolvedValue({ ok: true, name: 'my-skill', path: '~/.dsh/skills/my-skill/SKILL.md' });
    const file = await zipFile(VALID_SKILL);
    const { container, root, props } = renderFlow(api);
    selectFile(container, file);
    await flush();

    click(buttonByText(container, zh['install.confirmInstall']));
    await flush();

    // uploaded with overwrite=false
    expect(api.install).toHaveBeenCalledTimes(1);
    expect(api.install).toHaveBeenCalledWith(file, false);

    // step 3 success card: path shown, NO trash note (no overwrite happened)
    expect(container.querySelector('[data-step="3"]')?.getAttribute('aria-current')).toBe('step');
    expect(container.textContent).toContain(zh['install.successTitle']);
    expect(container.textContent).toContain('~/.dsh/skills/my-skill/SKILL.md');
    expect(container.textContent).not.toContain(zh['install.successOldInTrash']);

    click(buttonByText(container, zh['install.finish']));
    expect(props.onDone).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
  });

  it('shows the conflict dialog on { conflict: true } and overwrite calls install(zip, true)', async () => {
    const api = makeApi();
    api.install.mockResolvedValueOnce(VALID_CONFLICT).mockResolvedValueOnce({
      ok: true,
      name: 'my-skill',
      path: '~/.dsh/skills/my-skill/SKILL.md',
    });
    const file = await zipFile(VALID_SKILL);
    const { container, root, props } = renderFlow(api);
    selectFile(container, file);
    await flush();

    click(buttonByText(container, zh['install.confirmInstall']));
    await flush();

    // first call: overwrite=false
    expect(api.install).toHaveBeenCalledTimes(1);
    expect(api.install).toHaveBeenCalledWith(file, false);

    // the conflict dialog is a view-level overlay rendered into the DOM
    // (not window.confirm — jsdom always provides a confirm stub, so the
    // dialog's presence in the tree is the evidence)
    expect(container.querySelector('[role="alertdialog"]')).not.toBeNull();
    expect(container.textContent).toContain(zh['conflict.title']);
    expect(container.textContent).toContain(zh['conflict.existingLabel']);
    expect(container.textContent).toContain(zh['group.user-dsh.title']);
    expect(container.textContent).toContain('~/.dsh/skills/my-skill/SKILL.md');

    click(buttonByText(container, zh['conflict.overwrite']));
    await flush();

    // overwrite call carries overwrite=true; success card shows the trash note
    expect(api.install).toHaveBeenCalledTimes(2);
    expect(api.install).toHaveBeenLastCalledWith(file, true);
    expect(container.textContent).toContain(zh['install.successTitle']);
    expect(container.textContent).toContain(zh['install.successOldInTrash']);
    expect(props.onDone).not.toHaveBeenCalled();
    act(() => root.unmount());
  });

  it('cancelling the conflict dialog keeps the confirm card and uploads nothing more', async () => {
    const api = makeApi();
    api.install.mockResolvedValue(VALID_CONFLICT);
    const { container, root } = renderFlow(api);
    selectFile(container, await zipFile(VALID_SKILL));
    await flush();

    click(buttonByText(container, zh['install.confirmInstall']));
    await flush();
    expect(container.textContent).toContain(zh['conflict.title']);

    // scope to the dialog: the header 取消 button also matches conflict.cancel
    const dialog = container.querySelector('[role="alertdialog"]')!;
    click(buttonByText(dialog, zh['conflict.cancel']));
    await flush();
    expect(container.textContent).not.toContain(zh['conflict.title']);
    expect(container.textContent).toContain(zh['install.confirmInstall']); // still on the confirm card
    expect(api.install).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
  });

  it('reselect returns to step 1 and allows a different file', async () => {
    const api = makeApi();
    const { container, root } = renderFlow(api);
    selectFile(container, await zipFile(VALID_SKILL));
    await flush();
    expect(container.querySelector('[data-step="2"]')?.getAttribute('aria-current')).toBe('step');

    click(buttonByText(container, zh['install.reselect']));
    await flush();
    expect(container.querySelector('[data-step="1"]')?.getAttribute('aria-current')).toBe('step');
    expect(container.textContent).toContain(zh['install.dropzoneMain']);
    expect(api.install).not.toHaveBeenCalled();
    act(() => root.unmount());
  });

  it('shows an inline error when the install POST fails', async () => {
    const api = makeApi();
    api.install.mockRejectedValue(new Error('host rejected'));
    const { container, root } = renderFlow(api);
    selectFile(container, await zipFile(VALID_SKILL));
    await flush();

    click(buttonByText(container, zh['install.confirmInstall']));
    await flush();
    expect(container.textContent).toContain('host rejected');
    expect(container.textContent).toContain(zh['install.confirmInstall']); // stays on confirm
    act(() => root.unmount());
  });

  it('calls onCancel from the header cancel button', () => {
    const api = makeApi();
    const { container, root, props } = renderFlow(api);
    click(buttonByText(container, zh['install.cancel']));
    expect(props.onCancel).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
  });
});
