// Sidebar entry for the skill-center panel: registers a single row into the
// knj-menu host's `knj.menu.item` slot. The row mirrors the UI design doc
// (dsh-extension-center-ui.html) sidebar — book icon + 「技能中心」, 36px,
// hover and active states — and styles itself with the shell's --dsw-alias-*
// theme tokens so it follows the host theme. `slots.register` shape matches
// dsh-knj-menu's client (name/id/order/locale + component factory); the
// caller (index.ts, Task 14) wraps this module in applyGuard.

import { useEffect, useState, type ReactElement } from 'react';
import { zh } from './locales';

export const MENU_SLOT = 'knj.menu.item';
export const MENU_ENTRY_ID = 'skill-center';
export const MENU_ENTRY_ORDER = -20;
export const MENU_ENTRY_LOCALE = 'zh';

/** Options object dsh-knj-menu's `slots.register` expects for a menu item. */
export interface MenuEntryRegisterOptions {
  name: typeof MENU_SLOT;
  id: string;
  order: number;
  locale: string;
}

/** Structural subset of the host `slots` object this module needs. */
export interface SlotsLike {
  register?(options: MenuEntryRegisterOptions, component: () => ReactElement): () => void;
}

const ENTRY_CSS = `
.skill-center-entry{display:flex;align-items:center;gap:6px;box-sizing:border-box;width:100%;height:36px;padding:0 10px 0 8px;border-radius:8px;color:var(--dsw-alias-label-secondary);background:transparent;border:none;font-family:inherit;font-size:13px;line-height:20px;cursor:pointer;text-align:left;transition:background .15s,color .15s}
.skill-center-entry:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.skill-center-entry[data-active]{background:var(--dsw-alias-interactive-bg-active);color:var(--dsw-alias-label-primary);font-weight:600}
.skill-center-entry svg{flex:none;width:16px;height:16px}
`;

let styleInjected = false;
function ensureEntryStyle(): void {
  if (styleInjected || typeof document === 'undefined') return;
  styleInjected = true;
  const style = document.createElement('style');
  style.textContent = ENTRY_CSS;
  document.head.appendChild(style);
}

/** Book icon from the UI design doc sidebar (16x16, currentColor). */
function BookIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M8 3.2C6.6 2 4.5 2 3 2v10.5c1.5 0 3.6 0 5 1.3 1.4-1.3 3.5-1.3 5-1.3V2c-1.5 0-3.6 0-5 1.2z" />
      <path d="M8 3.2v10.6" />
    </svg>
  );
}

export interface SkillCenterEntryProps {
  onClick: () => void;
}

/**
 * One sidebar row: book icon + 「技能中心」. Clicking calls `onClick()` and
 * toggles the row's own `data-active` highlight. The menu host (knj-menu)
 * renders registered entries with no props, so the active state is
 * self-managed here.
 */
export function SkillCenterEntry({ onClick }: SkillCenterEntryProps) {
  const [active, setActive] = useState(false);

  useEffect(() => {
    ensureEntryStyle();
  }, []);

  const handleClick = () => {
    setActive((prev) => !prev);
    onClick();
  };

  return (
    <button
      type="button"
      className="skill-center-entry"
      data-active={active || undefined}
      onClick={handleClick}
    >
      <BookIcon />
      <span>{zh['entry.label']}</span>
    </button>
  );
}

/**
 * Register the skill-center entry into the knj-menu host's `knj.menu.item`
 * slot. Tolerant by design: when `slots` is missing or lacks `register`, a
 * no-op disposer is returned so the caller (applyGuard) stays simple.
 */
export function registerMenuEntry(
  slots: SlotsLike | null | undefined,
  onToggle: () => void,
): () => void {
  if (!slots || typeof slots.register !== 'function') {
    return () => {};
  }
  return slots.register(
    { name: MENU_SLOT, id: MENU_ENTRY_ID, order: MENU_ENTRY_ORDER, locale: MENU_ENTRY_LOCALE },
    () => <SkillCenterEntry onClick={onToggle} />,
  );
}
