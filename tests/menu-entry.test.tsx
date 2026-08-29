/** @vitest-environment jsdom */
// Menu entry registration + entry row. Renders the component with
// react-dom/client + act (dependency-free: react-dom/jsdom are devDeps), so
// this file carries the jsdom environment via docblock while the rest of the
// suite stays on vitest's node environment.
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
  MENU_ENTRY_ID,
  MENU_ENTRY_ORDER,
  MENU_ENTRY_LOCALE,
  MENU_SLOT,
  registerMenuEntry,
  SkillCenterEntry,
  type MenuEntryRegisterOptions,
  type SlotsLike,
} from '../src/client/menu-entry';

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  document.body.innerHTML = '';
});

/** Mount `ui` into a fresh jsdom container; returns container + root. */
function mount(ui: ReactElement): { container: HTMLDivElement; root: Root } {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(ui));
  return { container, root };
}

describe('SkillCenterEntry', () => {
  it('renders a row with the book icon and 「技能中心」 label, inactive by default', () => {
    const { container, root } = mount(<SkillCenterEntry onClick={() => {}} />);
    const button = container.querySelector('button.skill-center-entry');
    expect(button).not.toBeNull();
    expect(button!.querySelector('svg')).not.toBeNull();
    expect(button!.textContent).toContain('技能中心');
    expect(button!.hasAttribute('data-active')).toBe(false);
    act(() => root.unmount());
  });

  it('calls onClick and toggles data-active on click', () => {
    const onClick = vi.fn();
    const { container, root } = mount(<SkillCenterEntry onClick={onClick} />);
    const button = container.querySelector('button.skill-center-entry')!;

    act(() => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(button.hasAttribute('data-active')).toBe(true);

    act(() => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onClick).toHaveBeenCalledTimes(2);
    expect(button.hasAttribute('data-active')).toBe(false);

    act(() => root.unmount());
  });
});

describe('registerMenuEntry', () => {
  it('registers into knj.menu.item with the exact options and returns the disposer', () => {
    const disposer = vi.fn(() => {});
    const register = vi.fn(
      (_options: MenuEntryRegisterOptions, _component: () => ReactElement) => disposer,
    );
    const onToggle = vi.fn();
    const slots: SlotsLike = { register };

    const result = registerMenuEntry(slots, onToggle);

    expect(register).toHaveBeenCalledTimes(1);
    const [options, component] = register.mock.calls[0];
    expect(options).toEqual({
      name: MENU_SLOT,
      id: MENU_ENTRY_ID,
      order: MENU_ENTRY_ORDER,
      locale: MENU_ENTRY_LOCALE,
    });
    expect(options).toEqual({ name: 'knj.menu.item', id: 'skill-center', order: -20, locale: 'zh' });
    expect(result).toBe(disposer);

    // The registered component factory renders the entry row.
    const { container, root } = mount(component());
    expect(container.textContent).toContain('技能中心');
    expect(container.querySelector('svg')).not.toBeNull();
    act(() => root.unmount());
  });

  it('returns a no-op disposer when slots lacks register', () => {
    const onToggle = vi.fn();
    const dispose = registerMenuEntry({} as SlotsLike, onToggle);
    expect(dispose).toBeInstanceOf(Function);
    expect(() => dispose()).not.toThrow();
    expect(() => registerMenuEntry(undefined, onToggle)()).not.toThrow();
  });
});
