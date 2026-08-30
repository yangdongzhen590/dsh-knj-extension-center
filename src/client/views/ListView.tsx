// List view (Task 10) — the first screen of the skill-center panel. Loads
// the grouped skill list via `api.list`, renders a search box (server-side
// `?q=`, 200ms debounce, paused during IME composition) above the three
// collapsible region groups, each a grid of SkillCards. Header buttons
// (回收站 / 安装技能) only forward their callbacks — view switching lives in
// the Task 14 view controller.
//
// Mutations (toggle / uninstall) update local state after the API call
// succeeds and report via onChanged(); failures surface an inline error on
// the affected card (locale copy + the host error message). Load failures
// show the locale error state with a retry button. Stale search responses
// are dropped by a request id guard.

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type CompositionEvent,
} from 'react';
import type { Group, SkillApi, SkillItem } from '../api';
import { zh } from '../locales';
import { GroupSection } from './GroupSection';
import { SkillCard } from './SkillCard';
import styles from './skill-center.module.css';

export interface ListViewProps {
  api: SkillApi;
  /** Open the detail view for a skill name (view controller callback). */
  onOpenDetail: (name: string) => void;
  /** Switch to the install flow. */
  onStartInstall: () => void;
  /** Switch to the trash view. */
  onOpenTrash: () => void;
  /** A mutation succeeded (toggle / uninstall) — data changed underneath. */
  onChanged: () => void;
}

const SEARCH_DEBOUNCE_MS = 200;

/** Trash icon (design doc header button). */
function TrashIcon() {
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
      <path d="M2.5 4h11M6.5 4V2.8A.8.8 0 0 1 7.3 2h1.4a.8.8 0 0 1 .8.8V4M4 4l.6 9a1 1 0 0 0 1 .9h4.8a1 1 0 0 0 1-.9L12 4" />
    </svg>
  );
}

/** Download icon (design doc primary install button). */
function DownloadIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M8 2v8M4.5 6.5 8 10l3.5-3.5" />
      <path d="M2.5 13.5h11" />
    </svg>
  );
}

/** Search icon (design doc toolbar). */
function SearchIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="7" cy="7" r="4.5" />
      <path d="m10.5 10.5 3 3" />
    </svg>
  );
}

export function ListView({ api, onOpenDetail, onStartInstall, onOpenTrash, onChanged }: ListViewProps) {
  const [query, setQuery] = useState('');
  const [groups, setGroups] = useState<Group[]>([]);
  const [status, setStatus] = useState<'loading' | 'error' | 'ready'>('loading');
  // Per-skill inline mutation errors (skill name → locale message).
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Guards against out-of-order responses (a stale list landing after a
  // newer search request), leaks the debounce timer on unmount, and pauses
  // search while an IME composition is in flight.
  const requestId = useRef(0);
  const debounceTimer = useRef<number | undefined>(undefined);
  const composing = useRef(false);

  const load = useCallback(
    async (q: string) => {
      const id = ++requestId.current;
      setStatus('loading');
      try {
        const payload = await api.list(q === '' ? {} : { q });
        if (id !== requestId.current) return; // stale response
        setGroups(payload.groups);
        setStatus('ready');
      } catch {
        if (id !== requestId.current) return; // stale failure
        setStatus('error');
      }
    },
    [api],
  );

  useEffect(() => {
    void load('');
    return () => {
      if (debounceTimer.current !== undefined) window.clearTimeout(debounceTimer.current);
    };
  }, [load]);

  /** (Re)schedule a debounced search; cancels any pending timer. */
  const scheduleSearch = (value: string) => {
    if (debounceTimer.current !== undefined) window.clearTimeout(debounceTimer.current);
    debounceTimer.current = window.setTimeout(() => void load(value), SEARCH_DEBOUNCE_MS);
  };

  const handleSearchChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setQuery(value);
    if (composing.current) return; // IME in progress: wait for compositionend
    scheduleSearch(value);
  };

  const handleCompositionStart = () => {
    composing.current = true;
  };

  const handleCompositionEnd = (event: CompositionEvent<HTMLInputElement>) => {
    composing.current = false;
    // onChange during composition was skipped; run the final query now.
    scheduleSearch(event.currentTarget.value);
  };

  /** Clear any inline error for a skill after a successful mutation. */
  const clearError = (name: string) => {
    setErrors((prev) => {
      if (!(name in prev)) return prev;
      const next = { ...prev };
      delete next[name];
      return next;
    });
  };

  /** Locale failure message with the host error text appended. */
  const failureMessage = (key: 'toggle.fail' | 'uninstall.fail', err: unknown): string => {
    const detail = err instanceof Error && err.message !== '' ? err.message : String(err);
    return zh[key].replace('{error}', detail);
  };

  const handleToggle = async (skill: SkillItem, enabled: boolean) => {
    if (skill.path === undefined) return;
    try {
      await api.setEnabled(skill.name, skill.path, enabled);
      clearError(skill.name);
      setGroups((prev) =>
        prev.map((g) => ({
          ...g,
          skills: g.skills.map((s) => (s.name === skill.name ? { ...s, modelInvocable: enabled } : s)),
        })),
      );
      onChanged();
    } catch (err) {
      // Keep the previous state (the switch snaps back) and explain why.
      console.warn('skill-center: setEnabled failed', err);
      setErrors((prev) => ({ ...prev, [skill.name]: failureMessage('toggle.fail', err) }));
    }
  };

  const handleUninstall = async (skill: SkillItem) => {
    if (skill.path === undefined) return;
    try {
      await api.uninstall(skill.name, skill.path);
      setGroups((prev) =>
        prev.map((g) => ({ ...g, skills: g.skills.filter((s) => s.name !== skill.name) })),
      );
      onChanged();
    } catch (err) {
      console.warn('skill-center: uninstall failed', err);
      setErrors((prev) => ({ ...prev, [skill.name]: failureMessage('uninstall.fail', err) }));
    }
  };

  const visibleGroups = groups.filter((g) => g.skills.length > 0);
  const hasResults = visibleGroups.length > 0;

  return (
    <div className={styles.root}>
      <header className={styles.viewHead}>
        <div>
          <div className={styles.title}>{zh['panel.title']}</div>
          <div className={styles.subtitle}>{zh['panel.subtitle']}</div>
        </div>
        <span className={styles.spacer} />
        <button type="button" className={styles.btn} onClick={onOpenTrash}>
          <TrashIcon />
          {zh['panel.trashButton']}
        </button>
        <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={onStartInstall}>
          <DownloadIcon />
          {zh['panel.installButton']}
        </button>
      </header>

      <div className={styles.toolbar}>
        <div className={styles.search}>
          <span className={styles.searchIcon}>
            <SearchIcon />
          </span>
          <input
            className={styles.searchInput}
            type="text"
            placeholder={zh['panel.searchPlaceholder']}
            aria-label={zh['panel.searchPlaceholder']}
            value={query}
            onChange={handleSearchChange}
            onCompositionStart={handleCompositionStart}
            onCompositionEnd={handleCompositionEnd}
          />
        </div>
      </div>

      <div className={styles.groups}>
        {status === 'loading' && (
          <div className={styles.state}>
            <span className={styles.stateText}>{zh['panel.loading']}</span>
          </div>
        )}

        {status === 'error' && (
          <div className={styles.state}>
            <span className={styles.stateText}>{zh['panel.loadError']}</span>
            <button type="button" className={styles.btn} onClick={() => void load(query)}>
              {zh['panel.retry']}
            </button>
          </div>
        )}

        {status === 'ready' && hasResults && (
          <>
            {visibleGroups.map((g) => (
              <GroupSection key={g.key} group={g}>
                {g.skills.map((skill) => (
                  <SkillCard
                    key={skill.name}
                    skill={skill}
                    error={errors[skill.name]}
                    onOpen={(s) => onOpenDetail(s.name)}
                    onToggle={handleToggle}
                    onUninstall={handleUninstall}
                  />
                ))}
              </GroupSection>
            ))}
          </>
        )}

        {status === 'ready' && !hasResults && (
          <div className={styles.state}>
            <span className={styles.stateText}>
              {query === ''
                ? zh['panel.emptyNoSkills']
                : zh['panel.emptyNoMatch'].replace('{q}', query)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
