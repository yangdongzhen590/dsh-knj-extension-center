/** @vitest-environment jsdom */
// Center-view mount: container mounting into the conversation column, the
// html activation attribute, and the cross-plugin `dsh-panel-activate`
// mutual-exclusion protocol. Renders with react-dom/client + act
// (dependency-free, like menu-entry.test.tsx); this file carries the jsdom
// environment via docblock while the rest of the suite stays on vitest's
// node environment.
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { act, type ReactElement } from 'react';
import type { SkillApi } from '../src/client/api';
import {
  ACTIVATE_EVENT,
  ACTIVE_ATTR,
  CENTER_VIEW_SELECTOR,
  CONVERSATION_COLUMN_SELECTOR,
  PANEL_NAME,
  mountCenterView,
  type CenterController,
  type CenterViewComponent,
  type CenterViewProps,
} from '../src/client/center-mount';

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  document.body.innerHTML = '';
  document.documentElement.removeAttribute(ACTIVE_ATTR);
  document.documentElement.removeAttribute('data-dsh-ssh-active');
  document.documentElement.removeAttribute('data-dsh-taskboard-active');
});

/** A conversation column node the mount targets (old-shell selector). */
function makeColumn(): HTMLElement {
  const column = document.createElement('div');
  column.setAttribute('data-pane', 'conversation');
  document.body.appendChild(column);
  return column;
}

/** Minimal real controller: open/close/isOpen backed by a boolean. */
function makeController(): CenterController {
  let open = false;
  return {
    open: () => {
      open = true;
    },
    close: () => {
      open = false;
    },
    isOpen: () => open,
  };
}

describe('mountCenterView', () => {
  it('mounts a view container into the conversation column and renders the placeholder', () => {
    const column = makeColumn();
    let handle: { dispose(): void } | undefined;
    act(() => {
      handle = mountCenterView(makeController(), {} as SkillApi);
    });

    const view = column.querySelector(CENTER_VIEW_SELECTOR);
    expect(view).not.toBeNull();
    expect(view!.textContent).toContain('技能中心');

    act(() => {
      handle!.dispose();
    });
  });

  it('controller.open() sets the html activation attribute and dispatches the own activate event', () => {
    makeColumn();
    const controller = makeController();
    const dispatched: string[] = [];
    const onActivate = (event: Event) => {
      dispatched.push((event as CustomEvent).detail as string);
    };
    document.addEventListener(ACTIVATE_EVENT, onActivate);
    let handle: { dispose(): void } | undefined;
    act(() => {
      handle = mountCenterView(controller, {} as SkillApi);
    });

    controller.open();

    expect(controller.isOpen()).toBe(true);
    expect(document.documentElement.hasAttribute(ACTIVE_ATTR)).toBe(true);
    expect(dispatched).toEqual([PANEL_NAME]);

    act(() => {
      handle!.dispose();
    });
    document.removeEventListener(ACTIVATE_EVENT, onActivate);
  });

  it('open() evicts sibling panel activation attributes (mutual exclusion)', () => {
    makeColumn();
    const controller = makeController();
    let handle: { dispose(): void } | undefined;
    act(() => {
      handle = mountCenterView(controller, {} as SkillApi);
    });
    document.documentElement.setAttribute('data-dsh-ssh-active', '');
    document.documentElement.setAttribute('data-dsh-taskboard-active', '');

    controller.open();

    expect(document.documentElement.hasAttribute('data-dsh-ssh-active')).toBe(false);
    expect(document.documentElement.hasAttribute('data-dsh-taskboard-active')).toBe(false);
    expect(document.documentElement.hasAttribute(ACTIVE_ATTR)).toBe(true);

    act(() => {
      handle!.dispose();
    });
  });

  it('closes when another panel dispatches dsh-panel-activate', () => {
    makeColumn();
    const controller = makeController();
    let handle: { dispose(): void } | undefined;
    act(() => {
      handle = mountCenterView(controller, {} as SkillApi);
    });
    controller.open();
    expect(controller.isOpen()).toBe(true);

    document.dispatchEvent(new CustomEvent(ACTIVATE_EVENT, { detail: 'taskboard' }));

    expect(controller.isOpen()).toBe(false);
    expect(document.documentElement.hasAttribute(ACTIVE_ATTR)).toBe(false);

    act(() => {
      handle!.dispose();
    });
  });

  it('controller.close() removes the html activation attribute', () => {
    makeColumn();
    const controller = makeController();
    let handle: { dispose(): void } | undefined;
    act(() => {
      handle = mountCenterView(controller, {} as SkillApi);
    });
    controller.open();
    expect(document.documentElement.hasAttribute(ACTIVE_ATTR)).toBe(true);

    controller.close();

    expect(controller.isOpen()).toBe(false);
    expect(document.documentElement.hasAttribute(ACTIVE_ATTR)).toBe(false);

    act(() => {
      handle!.dispose();
    });
  });

  it('renders the injected view slot instead of the placeholder', () => {
    const column = makeColumn();
    const CustomView: CenterViewComponent = (_props: CenterViewProps) => (
      <div data-testid="custom-view">custom view</div>
    );
    let handle: { dispose(): void } | undefined;
    act(() => {
      handle = mountCenterView(makeController(), {} as SkillApi, CustomView);
    });

    expect(column.querySelector('[data-testid="custom-view"]')).not.toBeNull();
    expect(column.querySelector(CENTER_VIEW_SELECTOR)!.textContent).toContain('custom view');

    act(() => {
      handle!.dispose();
    });
  });

  it('dispose removes the container and the activation attribute', () => {
    const column = makeColumn();
    const controller = makeController();
    let handle: { dispose(): void } | undefined;
    act(() => {
      handle = mountCenterView(controller, {} as SkillApi);
    });
    controller.open();

    act(() => {
      handle!.dispose();
    });

    expect(column.querySelector(CENTER_VIEW_SELECTOR)).toBeNull();
    expect(document.documentElement.hasAttribute(ACTIVE_ATTR)).toBe(false);
  });

  it('re-mounts into a rebuilt conversation column (MutationObserver self-heal)', async () => {
    const column = makeColumn();
    const controller = makeController();
    let handle: { dispose(): void } | undefined;
    act(() => {
      handle = mountCenterView(controller, {} as SkillApi);
    });
    expect(column.querySelector(CENTER_VIEW_SELECTOR)).not.toBeNull();

    // The host replaces the whole conversation column subtree.
    await act(async () => {
      column.remove();
      const fresh = makeColumn();
      expect(fresh).not.toBeNull();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const rebuilt = document.querySelector(CONVERSATION_COLUMN_SELECTOR);
    expect(rebuilt).not.toBeNull();
    expect(rebuilt!.querySelector(CENTER_VIEW_SELECTOR)).not.toBeNull();

    act(() => {
      handle!.dispose();
    });
  });
});
