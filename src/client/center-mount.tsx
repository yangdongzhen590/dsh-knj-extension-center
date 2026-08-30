// Main-area takeover mount for the skill-center panel (主区域替换). The
// conversation slot is single-occupant and external plugins cannot declare
// slots, so the panel takes over the center column at the DOM level: a
// container is appended inside the center column as an extra trailing child
// React never manages, and an injected stylesheet hides the conversation
// content while the panel is active. Toggling is a data attribute on <html>
// — no React involvement, so the conversation subtree underneath stays
// mounted and stateful.
//
// Ported from the task-board plugin's board-mount.tsx: same column selector
// (`[data-pane="conversation"]` on older shells, `[class*="centerCol"]` on
// the dsh 0.1.0-rc.6 AppFrame layout), absolute container with z-index 60,
// MutationObserver self-heal when the host re-renders the column, and the
// cross-plugin `dsh-panel-activate` mutual-exclusion protocol — renamed to
// the skill-center activation attribute and panel name. The sibling panels'
// activation attributes (ssh / taskboard) are respected both in the CSS
// (`:not()` guards, mirroring the task-board rule) and on open (evicted, so
// the single-occupant column never shows two panels at once).
//
// The mounted view is a slot: `mountCenterView(controller, api, view)`. Task
// 9 renders the placeholder; Tasks 10-13 swap in the real views. Every view
// receives `api` + `onClose`.

import { createElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { SkillApi } from './api';
import { zh } from './locales';

/** The injected view container (kept in the DOM, hidden when inactive). */
export const CENTER_VIEW_SELECTOR = '[data-dsh-skill-center-view]';
/** Old/new shell selectors for the single-occupant center column. */
export const CONVERSATION_COLUMN_SELECTOR = '[data-pane="conversation"], [class*="centerCol"]';
/** Activation attribute on <html>: shows the view, hides the chat below. */
export const ACTIVE_ATTR = 'data-dsh-skill-center-active';
/** Sibling panels' activation attributes, evicted when this panel opens. */
export const OTHER_ACTIVE_ATTRS = ['data-dsh-ssh-active', 'data-dsh-taskboard-active'] as const;
/** Cross-plugin activation event; detail is the activating panel name. */
export const ACTIVATE_EVENT = 'dsh-panel-activate';
/** This panel's name in the cross-plugin activation protocol. */
export const PANEL_NAME = 'skill-center';

/** The activation state face Task 14's assembly passes in. */
export interface CenterController {
  open(): void;
  close(): void;
  isOpen(): boolean;
}

/** Props every mounted skill-center view receives. */
export interface CenterViewProps {
  api: SkillApi;
  onClose: () => void;
}

/** A mounted skill-center view (Tasks 10-13 implement the real ones). */
export type CenterViewComponent = (props: CenterViewProps) => ReactElement;

/** Task 9 placeholder: panel title/subtitle from locales. */
export function PlaceholderCenterView(_props: CenterViewProps): ReactElement {
  return (
    <div className="skill-center-placeholder">
      <h2 className="skill-center-placeholder-title">{zh['panel.title']}</h2>
      <p className="skill-center-placeholder-subtitle">{zh['panel.subtitle']}</p>
    </div>
  );
}

/** The `:not([data-dsh-ssh-active]):not([data-dsh-taskboard-active])` guard. */
const OTHER_GUARD = OTHER_ACTIVE_ATTRS.map((attr) => `:not([${attr}])`).join('');

/**
 * Center-column takeover rules, scoped by the plugin's own data attributes.
 * The container rides inside the conversation grid item as an extra trailing
 * child; hidden unless the panel is active. While active, the conversation
 * content underneath is hidden (it stays mounted and stateful); `!important`
 * is required because the dsh shell wraps the conversation view in a node
 * with an inline `display: contents` that would otherwise beat this rule and
 * paint the composer over the panel (issue #76 in the task-board plugin).
 * The `:not()` guards keep the sibling panels (ssh / taskboard) from fighting
 * over visibility if two activation attributes ever coexist.
 */
const MOUNT_CSS = `
[data-pane='conversation'],
[class*='centerCol'] { position: relative; }
${CENTER_VIEW_SELECTOR} {
  position: absolute;
  inset: 0;
  display: none;
  z-index: 60;
  background: var(--dsw-alias-bg-base);
}
html[${ACTIVE_ATTR}]${OTHER_GUARD} ${CENTER_VIEW_SELECTOR} { display: block; }
html[${ACTIVE_ATTR}]${OTHER_GUARD} [data-pane='conversation'] > :not([data-dsh-skill-center-view]),
html[${ACTIVE_ATTR}]${OTHER_GUARD} [class*='centerCol'] > :not([data-dsh-skill-center-view]) {
  display: none !important;
}
.skill-center-placeholder {
  box-sizing: border-box;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  color: var(--dsw-alias-label-secondary);
  font-family: inherit;
}
.skill-center-placeholder-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary);
}
.skill-center-placeholder-subtitle { margin: 0; font-size: 13px; }
`;

let styleInjected = false;
function ensureCenterStyle(): void {
  if (styleInjected || typeof document === 'undefined') return;
  styleInjected = true;
  const style = document.createElement('style');
  style.textContent = MOUNT_CSS;
  document.head.appendChild(style);
}

/**
 * Mount the skill-center view into the center column and bind its visibility
 * to the controller's open/close state: `open()` sets the html activation
 * attribute (evicting sibling panels) and dispatches the cross-plugin
 * `dsh-panel-activate` event; a `dsh-panel-activate` event from another panel
 * closes this one. The container self-heals via MutationObserver when the
 * host re-renders the conversation column.
 *
 * The controller's open/close are wrapped (originals keep their state
 * semantics; `isOpen` stays the caller's view of the world) and restored on
 * dispose.
 *
 * @param controller - the activation state face driving the panel.
 * @param api - skill-center REST client, passed to the mounted view.
 * @param view - the view to mount; defaults to the Task 9 placeholder.
 * @returns a disposer unmounting the tree and restoring the column.
 */
export function mountCenterView(
  controller: CenterController,
  api: SkillApi,
  view: CenterViewComponent = PlaceholderCenterView,
): { dispose(): void } {
  if (typeof document === 'undefined') return { dispose() {} };

  ensureCenterStyle();

  let root: Root | undefined;
  let container: HTMLDivElement | undefined;

  const ensure = (): void => {
    if (container !== undefined) {
      if (container.isConnected) return;
      root?.unmount();
      root = undefined;
      container.remove();
      container = undefined;
    }
    const column = document.querySelector<HTMLElement>(CONVERSATION_COLUMN_SELECTOR);
    if (column === null) return;
    container = document.createElement('div');
    container.setAttribute('data-dsh-skill-center-view', '');
    container.setAttribute('data-dsh-plugin', 'knj-extension-center');
    column.appendChild(container);
    root = createRoot(container);
    root.render(createElement(view, { api, onClose: () => controller.close() }));
  };

  // The frame mounts after boot settlement; watch for the column's arrival.
  const waitObserver = new MutationObserver(() => {
    ensure();
  });
  waitObserver.observe(document.body, { childList: true, subtree: true });

  const applyOpen = (): void => {
    // Single-occupant center column: opening this panel must evict the
    // sibling panels (ssh / taskboard), both their html attributes and their
    // controller state, otherwise the panels' visibility rules fight and the
    // second click appears dead.
    for (const attr of OTHER_ACTIVE_ATTRS) document.documentElement.removeAttribute(attr);
    document.documentElement.setAttribute(ACTIVE_ATTR, '');
    document.dispatchEvent(new CustomEvent(ACTIVATE_EVENT, { detail: PANEL_NAME }));
  };
  const applyClose = (): void => {
    document.documentElement.removeAttribute(ACTIVE_ATTR);
  };

  // Bind the DOM side of the activation protocol onto the controller: open()
  // shows the view + broadcasts activation; close() clears the attribute.
  const originalOpen = controller.open;
  const originalClose = controller.close;
  controller.open = () => {
    originalOpen.call(controller);
    applyOpen();
  };
  controller.close = () => {
    originalClose.call(controller);
    applyClose();
  };

  // Cross-plugin mutual exclusion: any other panel activating closes this one.
  const onOtherActivate = (event: Event): void => {
    if ((event as CustomEvent).detail !== PANEL_NAME && controller.isOpen()) {
      controller.close();
    }
  };
  document.addEventListener(ACTIVATE_EVENT, onOtherActivate);

  // Reflect the controller's current state (e.g. re-apply while already open).
  if (controller.isOpen()) applyOpen();
  else applyClose();
  ensure();

  return {
    dispose() {
      document.removeEventListener(ACTIVATE_EVENT, onOtherActivate);
      waitObserver.disconnect();
      controller.open = originalOpen;
      controller.close = originalClose;
      document.documentElement.removeAttribute(ACTIVE_ATTR);
      root?.unmount();
      root = undefined;
      container?.remove();
      container = undefined;
    },
  };
}
