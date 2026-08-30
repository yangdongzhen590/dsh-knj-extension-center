// skill-center — client half (Task 14 assembly). Wires every Task 7-13 module
// into one `apply(ctx)` for the DSH web profile:
//
//   1. locale dictionaries → ctx.locale.register('dsh-skill-center', { zh, en })
//   2. view controller + main-area takeover → mountCenterView(controller, api,
//      CenterApp); CenterApp is the list/detail/trash/install state machine
//   3. sidebar entry → registered into the knj.menu.item slot DEFERRED through
//      slots.inject (the dsh-scheduler pattern): knj.menu.item only exists
//      once dsh-knj-menu commits its own declaration, and the slot registry
//      throws on registering into an undeclared slot — a direct register at
//      apply time would race knj-menu and crash the shell. inject runs the
//      callback when (and each time) the declaration is committed and
//      collapses it with the slot.
//
// The whole body rides applyGuard: an unexpected failure degrades to a
// console.warn instead of taking down the host GUI, and apply returns the
// combined disposer (cordis treats a function return as the fiber disposer).

import { SkillApi } from './api';
import { applyGuard } from './apply-guard';
import { mountCenterView, type CenterController } from './center-mount';
import { CenterApp } from './CenterApp';
import { en, zh } from './locales';
import { MENU_SLOT, registerMenuEntry, type SlotsLike } from './menu-entry';

/** Client services this plugin consumes (structural subset of the host ctx). */
export interface SkillCenterClientContext {
  slots?: SlotsLike & {
    /**
     * Deferred registration: runs `callback` when (and each time) the slot's
     * declaration is committed, disposing the effect when the slot collapses.
     * This is the only race-free way to register into knj.menu.item, which is
     * itself declared dynamically by dsh-knj-menu (see the module doc).
     */
    inject?(key: string, callback: () => (() => void) | Iterable<() => void>): () => void;
  };
  locale?: {
    /** Register a namespace's dictionaries for every locale; returns a disposer. */
    register?(ns: string, dicts: Record<string, Record<string, string>>): () => void;
  };
}

export const inject = ['slots', 'locale'];

/** A simple activation-state face consumed by mountCenterView. */
function createCenterController(): CenterController {
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

/**
 * Assemble the skill-center client into the host. Never throws: every failure
 * is contained by applyGuard and logged via console.warn.
 * @param ctx - client root context (injects slots + locale).
 * @returns a disposer undoing the whole assembly, or undefined when the body failed.
 */
export function apply(ctx: SkillCenterClientContext): (() => void) | undefined {
  return applyGuard(() => {
    const disposers: Array<() => void> = [];
    const slots = ctx?.slots;
    const locale = ctx?.locale;

    // 1. locale dictionaries (dsh-skill-center namespace, zh + en).
    if (locale !== undefined && typeof locale.register === 'function') {
      const dispose = locale.register('dsh-skill-center', { zh, en });
      if (typeof dispose === 'function') disposers.push(dispose);
    }

    // 2. view controller + main-area takeover. mountCenterView wraps the
    //    controller's open/close with the DOM side of the activation
    //    protocol; CenterApp is the mounted view (CenterViewProps = api + onClose).
    const controller = createCenterController();
    const mount = mountCenterView(controller, new SkillApi(), CenterApp);
    disposers.push(() => mount.dispose());

    // 3. sidebar entry. The toggle flips the panel; because mountCenterView
    //    already wrapped the controller, the closure sees the wrapped
    //    open/close no matter when the inject callback runs.
    const toggle = () => {
      if (controller.isOpen()) controller.close();
      else controller.open();
    };
    if (slots !== undefined && typeof slots.inject === 'function') {
      // Deferred registration: knj.menu.item is declared by knj-menu at its
      // own pace; a direct register would throw on the undeclared slot.
      const dispose = slots.inject(MENU_SLOT, () => registerMenuEntry(slots, toggle));
      if (typeof dispose === 'function') disposers.push(dispose);
    } else {
      // Degraded hosts without inject: register directly (registerMenuEntry
      // is itself tolerant when `register` is missing).
      const dispose = registerMenuEntry(slots, toggle);
      if (typeof dispose === 'function') disposers.push(dispose);
    }

    return () => {
      // Reverse order: the sidebar entry first, then the mount, then locales.
      for (let i = disposers.length - 1; i >= 0; i--) {
        try {
          disposers[i]();
        } catch (error) {
          console.warn('[dsh-skill-center] client disposer failed:', error);
        }
      }
    };
  });
}
