// Trash view (Task 12) — recoverable trash for uninstalled skills. Loads via
// `api.trashList`, renders one row per entry (name / original path / deleted
// time + 恢复 / 彻底删除 buttons) and a 清空回收站 header action that purges
// every entry after a `window.confirm`. Layout mirrors the design doc
// dsh-extension-center-ui.html 回收站视图, restyled with DSH shell tokens.
//
// Mutation contract (matches ListView): restore / purge / clear-all call the
// api first and only update local state after success, then report via
// onChanged() so the parent refreshes the list underneath (restored skills
// return to the main list). Failures — the restore 409 "original path
// occupied" case included — surface the host message inline and keep the row;
// clear-all keeps the entries whose purge failed. Load failures show the
// locale error state with a retry button.
//
// In-flight guard (Task 12 review fix): every mutation marks its row pending
// for the duration of the api call and disables the row buttons, so a fast
// double-click cannot fire the request twice (the second call would fail
// against a row that is already gone, and its error would land on a removed
// row). Row ops are also blocked while a clear-all batch is in flight — that
// closes the snapshot race where a restore landing mid-clear would be
// resurrected by the clear result's `kept` list. A synchronous ref mirrors
// each pending flag because React's re-render lands after the click handler
// returns, and the second click of a double-click can be dispatched before
// the button is actually disabled.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { SkillApi, TrashItem } from '../api';
import { zh } from '../locales';
import styles from './skill-center.module.css';

export interface TrashViewProps {
  api: SkillApi;
  /** Navigate back to the list view. */
  onBack: () => void;
  /** A restore / purge / clear-all succeeded — data changed underneath. */
  onChanged: () => void;
}

/** Document icon (design doc trash row + empty state). */
function DocIcon() {
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
      <path d="M3 2.5h6.5L13 6v7.5H3z" />
      <path d="M9.5 2.5V6H13M5.5 9.5h5M5.5 11.5h4" />
    </svg>
  );
}

/** Back chevron (design doc back button). */
function BackIcon() {
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
      <path d="M10 3 5 8l5 5" />
    </svg>
  );
}

/**
 * Format the Unix-ms `deletedAt` timestamp as local `YYYY-MM-DD HH:mm`.
 * Falls back to the raw string when the value is not a valid timestamp
 * (legacy entries carry one, but the host contract does not guarantee it).
 */
function formatDeletedAt(deletedAt: string): string {
  const ms = Number(deletedAt);
  if (!Number.isFinite(ms) || ms <= 0) return deletedAt;
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** The host error text (or its string form) for inline failure copy. */
function failureDetail(err: unknown): string {
  return err instanceof Error && err.message !== '' ? err.message : String(err);
}

export function TrashView({ api, onBack, onChanged }: TrashViewProps) {
  const [items, setItems] = useState<TrashItem[]>([]);
  const [status, setStatus] = useState<'loading' | 'error' | 'ready'>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  // Per-entry mutation errors (trashPath → locale message with host detail).
  const [errors, setErrors] = useState<Record<string, string>>({});
  // Clear-all banner: set when at least one purge in the batch failed.
  const [clearError, setClearError] = useState<string | null>(null);
  // In-flight flags: per-row op (trashPath → true) and the clear-all batch.
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [clearing, setClearing] = useState(false);
  // Synchronous mirrors of the pending flags (see the header comment).
  const pendingRef = useRef<Set<string>>(new Set());
  const clearingRef = useRef(false);

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      const payload = await api.trashList();
      setItems(payload.items);
      setStatus('ready');
    } catch (err) {
      setStatus('error');
      setLoadError(zh['trash.loadError'].replace('{error}', failureDetail(err)));
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  const clearErrorFor = (trashPath: string) => {
    setErrors((prev) => {
      if (!(trashPath in prev)) return prev;
      const next = { ...prev };
      delete next[trashPath];
      return next;
    });
  };

  const handleRestore = async (item: TrashItem) => {
    if (clearingRef.current || pendingRef.current.has(item.trashPath)) return;
    pendingRef.current.add(item.trashPath);
    setPending((prev) => ({ ...prev, [item.trashPath]: true }));
    try {
      await api.trashRestore(item.trashPath);
      clearErrorFor(item.trashPath);
      setItems((prev) => prev.filter((t) => t.trashPath !== item.trashPath));
      onChanged();
    } catch (err) {
      console.warn('skill-center: trashRestore failed', err);
      setErrors((prev) => ({
        ...prev,
        [item.trashPath]: zh['trash.restoreFail'].replace('{error}', failureDetail(err)),
      }));
    } finally {
      pendingRef.current.delete(item.trashPath);
      setPending((prev) => {
        const next = { ...prev };
        delete next[item.trashPath];
        return next;
      });
    }
  };

  const handlePurge = async (item: TrashItem) => {
    if (clearingRef.current || pendingRef.current.has(item.trashPath)) return;
    const message = zh['trash.purgeConfirm'].replace('{name}', item.name);
    if (!window.confirm(message)) return;
    pendingRef.current.add(item.trashPath);
    setPending((prev) => ({ ...prev, [item.trashPath]: true }));
    try {
      await api.trashPurge(item.trashPath);
      clearErrorFor(item.trashPath);
      setItems((prev) => prev.filter((t) => t.trashPath !== item.trashPath));
      onChanged();
    } catch (err) {
      console.warn('skill-center: trashPurge failed', err);
      setErrors((prev) => ({
        ...prev,
        [item.trashPath]: zh['trash.purgeFail'].replace('{error}', failureDetail(err)),
      }));
    } finally {
      pendingRef.current.delete(item.trashPath);
      setPending((prev) => {
        const next = { ...prev };
        delete next[item.trashPath];
        return next;
      });
    }
  };

  /**
   * Empty the trash: purge every entry (parallel), keep the failed ones.
   * While the batch is in flight the clear button and every row action are
   * disabled, so the captured snapshot is still current when the results
   * land — a row cannot be restored/removed mid-clear and then resurrected
   * by the `kept` computation.
   */
  const handleClearAll = async () => {
    if (clearingRef.current) return;
    // A row restore/purge in flight would race the snapshot: its outcome
    // could land mid-batch and the stale `kept` computation resurrect it.
    if (pendingRef.current.size > 0) return;
    if (items.length === 0) return;
    if (!window.confirm(zh['trash.clearAllConfirm'])) return;
    clearingRef.current = true;
    setClearing(true);
    setClearError(null);
    setErrors({});
    const snapshot = items;
    try {
      const results = await Promise.allSettled(snapshot.map((item) => api.trashPurge(item.trashPath)));
      const firstFailure = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
      if (firstFailure !== undefined) {
        const kept = snapshot.filter((_, i) => results[i]?.status === 'rejected');
        setItems(kept);
        setClearError(zh['trash.clearFail'].replace('{error}', failureDetail(firstFailure.reason)));
      } else {
        setItems([]);
      }
      onChanged(); // some (or all) entries were purged — the list changed
    } finally {
      clearingRef.current = false;
      setClearing(false);
    }
  };

  return (
    <div className={styles.root}>
      <header className={styles.viewHead}>
        <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={onBack}>
          <BackIcon />
          {zh['trash.back']}
        </button>
        <div>
          <div className={styles.title}>{zh['trash.title']}</div>
          <div className={styles.subtitle}>{zh['trash.subtitle']}</div>
        </div>
        <span className={styles.spacer} />
        <button
          type="button"
          className={styles.btn}
          onClick={() => void handleClearAll()}
          disabled={clearing}
        >
          {zh['trash.clearAll']}
        </button>
      </header>

      <div className={styles.trashList}>
        {status === 'loading' && (
          <div className={styles.state}>
            <span className={styles.stateText}>{zh['panel.loading']}</span>
          </div>
        )}

        {status === 'error' && (
          <div className={styles.state}>
            <span className={styles.stateText}>{loadError ?? zh['trash.loadError'].replace('{error}', '')}</span>
            <button type="button" className={styles.btn} onClick={() => void load()}>
              {zh['panel.retry']}
            </button>
          </div>
        )}

        {status === 'ready' && items.length === 0 && (
          <div className={styles.trashEmpty}>
            <span className={styles.trashEmptyIcon}>
              <DocIcon />
            </span>
            <span>{zh['trash.empty']}</span>
          </div>
        )}

        {status === 'ready' && items.length > 0 && (
          <>
            {clearError !== null && (
              <div className={styles.cardError} role="alert">
                {clearError}
              </div>
            )}
            {items.map((item) => (
              <div key={item.trashPath} className={styles.trashRow} data-trash-name={item.name}>
                <span className={styles.trashIcon}>
                  <DocIcon />
                </span>
                <div className={styles.trashInfo}>
                  <div className={styles.trashName}>{item.name}</div>
                  <div className={styles.trashMeta}>
                    {item.originalPath !== ''
                      ? `${item.originalPath} · ${formatDeletedAt(item.deletedAt)}`
                      : formatDeletedAt(item.deletedAt)}
                  </div>
                  {errors[item.trashPath] !== undefined && (
                    <div className={styles.cardError} role="alert">
                      {errors[item.trashPath]}
                    </div>
                  )}
                </div>
                <span className={styles.trashSpacer} />
                <button
                  type="button"
                  className={`${styles.btn} ${styles.btnSm}`}
                  onClick={() => void handleRestore(item)}
                  disabled={clearing || pending[item.trashPath] === true}
                >
                  {zh['trash.restore']}
                </button>
                <button
                  type="button"
                  className={`${styles.btn} ${styles.btnSm} ${styles.btnDanger}`}
                  onClick={() => void handlePurge(item)}
                  disabled={clearing || pending[item.trashPath] === true}
                >
                  {zh['trash.purge']}
                </button>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
