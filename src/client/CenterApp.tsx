// CenterApp (Task 14) — the view controller of the skill-center panel. A
// simple state machine owning the current view ('list' | 'detail' | 'trash' |
// 'install') plus the current skill (the merged list entry the DetailView
// needs for its chrome). Wired as the mounted view slot of mountCenterView:
// its props are exactly CenterViewProps ({ api, onClose }).
//
// Controller rulings this module implements:
// - ListView's five callbacks: onOpenDetail(item) stores the merged list
//   entry + switches to detail (DetailView receives it as `item`);
//   onStartInstall / onOpenTrash switch views; onChanged returns to the list.
//   Returning to the list remounts ListView (it was unmounted by the view
//   switch), so the fresh mount reloads — no refreshKey prop needed.
// - Pathless skills (bundled / runtime) carry no file path; the host detail
//   route 404s them, so onOpenDetail declines them before the view switch.
// - Detail mutations are owned here: onToggle/onUninstall are intent-only
//   callbacks from DetailView, and this module calls the api with the real
//   item.path captured in the closure.
// - Top-level close path: the list header carries a close button calling
//   onClose, and Escape closes the panel from any view while it is active
//   (never while typing in an input).

import { useCallback, useEffect, useState, type ReactElement } from 'react';
import type { SkillApi, SkillItem } from './api';
import { ACTIVE_ATTR, type CenterViewProps } from './center-mount';
import { ListView } from './views/ListView';
import { DetailView } from './views/DetailView';
import { TrashView } from './views/TrashView';
import { InstallFlow } from './views/InstallFlow';

type ViewName = 'list' | 'detail' | 'trash' | 'install';

export function CenterApp({ api, onClose }: CenterViewProps): ReactElement {
  const [view, setView] = useState<ViewName>('list');
  /** The merged list entry backing the detail view (its path drives mutations). */
  const [current, setCurrent] = useState<SkillItem | null>(null);

  /** Open detail for a skill. Pathless skills (bundled/runtime) are declined:
   *  the host detail route 404s them, so the card click is a no-op. */
  const handleOpenDetail = useCallback((item: SkillItem) => {
    if (item.path === undefined) return;
    setCurrent(item);
    setView('detail');
  }, []);

  const handleBackToList = useCallback(() => setView('list'), []);

  const handleStartInstall = useCallback(() => setView('install'), []);
  const handleOpenTrash = useCallback(() => setView('trash'), []);

  /** A mutation succeeded underneath (toggle / uninstall / restore / install):
   *  return to the list. ListView was unmounted by the view switch, so the
   *  fresh mount reloads — list-internal toggles keep ListView's own local
   *  update and are untouched by this no-op. */
  const handleChanged = useCallback(() => setView('list'), []);

  /** Detail toggle: intent-only from DetailView; the path comes from the
   *  captured list entry. On success the stored item is updated so the
   *  controlled switch reflects the new state. */
  const handleDetailToggle = useCallback(
    async (enabled: boolean) => {
      const item = current;
      if (item === null || item.path === undefined) return;
      try {
        await api.setEnabled(item.name, item.path, enabled);
        setCurrent((prev) =>
          prev !== null && prev.name === item.name ? { ...prev, modelInvocable: enabled } : prev,
        );
      } catch (err) {
        // The switch is controlled by `current`, so it snaps back on failure.
        console.warn('skill-center: detail setEnabled failed', err);
      }
    },
    [api, current],
  );

  /** Detail uninstall: same path contract; success returns to the list, whose
   *  fresh mount no longer contains the skill. */
  const handleDetailUninstall = useCallback(async () => {
    const item = current;
    if (item === null || item.path === undefined) return;
    try {
      await api.uninstall(item.name, item.path);
      setCurrent(null);
      setView('list');
    } catch (err) {
      console.warn('skill-center: detail uninstall failed', err);
    }
  }, [api, current]);

  // Top-level close channel: Escape closes the panel while it is active.
  // Typing in the search box must never close the panel, so keydowns from
  // editable targets are ignored.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target !== null && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      if (event.key === 'Escape' && document.documentElement.hasAttribute(ACTIVE_ATTR)) {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  if (view === 'detail' && current !== null) {
    return (
      <DetailView
        api={api}
        name={current.name}
        item={current}
        onBack={handleBackToList}
        onUninstall={() => void handleDetailUninstall()}
        onToggle={(enabled) => void handleDetailToggle(enabled)}
      />
    );
  }

  if (view === 'trash') {
    return <TrashView api={api} onBack={handleBackToList} onChanged={handleChanged} />;
  }

  if (view === 'install') {
    return <InstallFlow api={api} onDone={handleChanged} onCancel={handleBackToList} />;
  }

  return (
    <ListView
      api={api}
      onOpenDetail={handleOpenDetail}
      onStartInstall={handleStartInstall}
      onOpenTrash={handleOpenTrash}
      onChanged={handleChanged}
      onClose={onClose}
    />
  );
}
