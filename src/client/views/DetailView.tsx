// Detail view (Task 11) — full-text preview of one skill. Loads the raw
// detail payload via `api.detail(name)` (host sends { name, frontmatter,
// body }; frontmatter is the raw fenced text, body is verbatim markdown) and
// renders: a back button + actions (copy path / uninstall / model-invocable
// switch) in the header, then a header card (icon, name, invokable/linked
// badges, path line) and the frontmatter code block + markdown-lite body.
//
// Merged-list-entry seam (controller review, Task 11 fix): the host detail
// route returns only name/frontmatter/body, so all UI chrome — path line,
// badges and the manage actions — is keyed on the optional `item?: SkillItem`
// prop (the list entry the Task 14 controller passes in). The path line maps
// `level` per the design doc (user-dsh → ~/.dsh/skills/<name>/SKILL.md,
// bundled → 系统内置, runtime → 运行时注册); the manage actions
// (copy/uninstall/toggle) only appear when the item carries a real file path,
// because setEnabled/uninstall are file-backed — bundled/runtime skills are
// read-only, matching SkillCard. When `item` is absent the view degrades to
// name + frontmatter + body only (no chrome, no crash, nothing undefined).
//
// Mutations are delegated to the parent via `onToggle(enabled)` /
// `onUninstall()` (the Task 14 controller owns the API calls and view
// switching); the switch is a controlled role=switch whose aria-checked
// mirrors the item. Copy is local best-effort with an inline error.

import { useCallback, useEffect, useState } from 'react';
import type { DetailPayload, SkillApi, SkillItem } from '../api';
import { zh } from '../locales';
import { markdownLite } from './markdown-lite';
import styles from './skill-center.module.css';

export interface DetailViewProps {
  api: SkillApi;
  /** Skill name to load; the parent passes the list-entry name. */
  name: string;
  /**
   * The merged list entry supplying the UI chrome the host detail route does
   * not send (level/path/linked/modelInvocable/userInvocable). Optional: when
   * absent, the view shows only name + frontmatter + body.
   */
  item?: SkillItem;
  /** Navigate back to the list. */
  onBack: () => void;
  /** The user confirmed uninstall (mutation owned by the controller). */
  onUninstall: () => void;
  /** The user flipped the model-invocable switch to `enabled`. */
  onToggle: (enabled: boolean) => void;
}

/** Document icon — the design doc's per-skill icon is not in the payload. */
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

/** Copy icon (design doc: copy path button). */
function CopyIcon() {
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
      <rect x="5.5" y="5.5" width="8" height="8" rx="1.2" />
      <path d="M10.5 5.5v-2a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2" />
    </svg>
  );
}

/** Trash icon (design doc: uninstall button). */
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

/**
 * The path line shown under the skill name, mapped from the merged item's
 * `level` per the design doc. Undefined when there is no item.
 */
function pathLineFor(item: SkillItem): string | undefined {
  if (item.level === 'user-dsh') return zh['detail.pathUserSkill'].replace('{name}', item.name);
  if (item.level === 'bundled') return zh['detail.pathBundled'];
  if (item.level === 'runtime') return zh['detail.pathRuntime'];
  return undefined;
}

export function DetailView({ api, name, item, onBack, onUninstall, onToggle }: DetailViewProps) {
  const [payload, setPayload] = useState<DetailPayload | null>(null);
  const [status, setStatus] = useState<'loading' | 'error' | 'ready'>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      const data = await api.detail(name);
      setPayload(data);
      setStatus('ready');
    } catch (err) {
      setStatus('error');
      const detail = err instanceof Error && err.message !== '' ? err.message : String(err);
      setLoadError(zh['detail.loadError'].replace('{error}', detail));
    }
  }, [api, name]);

  useEffect(() => {
    void load();
  }, [load]);

  // UI chrome comes from the merged list entry; without it nothing derived
  // from metadata is shown (name + frontmatter + body only).
  const actionPath = item?.path;
  const hasActions = actionPath !== undefined;
  const invokableNames: string[] = [];
  if (item?.modelInvocable === true) invokableNames.push(zh['card.model']);
  if (item?.userInvocable === true) invokableNames.push(zh['card.user']);
  const pathLine = item !== undefined ? pathLineFor(item) : undefined;

  const handleCopy = () => {
    if (actionPath === undefined) return;
    setCopyError(null);
    // Best-effort copy; a missing clipboard is ignored, a failing one is
    // surfaced as an inline error (matches SkillCard).
    if (typeof navigator.clipboard?.writeText === 'function') {
      void navigator.clipboard.writeText(actionPath).catch(() => {
        setCopyError(zh['card.copyFail']);
      });
    }
  };

  const handleUninstall = () => {
    const message = zh['uninstall.confirm'].replace('{name}', name);
    if (window.confirm(message)) onUninstall();
  };

  const handleToggle = () => {
    onToggle(item?.modelInvocable !== true);
  };

  return (
    <div className={styles.root}>
      <header className={styles.viewHead}>
        <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={onBack}>
          <BackIcon />
          {zh['detail.backToList']}
        </button>
        <span className={styles.spacer} />
        {hasActions && (
          <div className={styles.detailActions}>
            <button type="button" className={`${styles.btn} ${styles.btnSm}`} onClick={handleCopy}>
              <CopyIcon />
              {zh['detail.copyPath']}
            </button>
            <button type="button" className={`${styles.btn} ${styles.btnSm} ${styles.btnDanger}`} onClick={handleUninstall}>
              <TrashIcon />
              {zh['detail.uninstall']}
            </button>
            <button
              type="button"
              role="switch"
              aria-checked={item?.modelInvocable === true}
              aria-label={zh['card.toggleTitle']}
              title={zh['card.toggleTitle']}
              className={styles.switch}
              onClick={handleToggle}
            >
              <span className={styles.switchTrack} />
              <span className={styles.switchThumb} />
            </button>
          </div>
        )}
      </header>

      <div className={styles.detailScroll}>
        {status === 'loading' && (
          <div className={styles.state}>
            <span className={styles.stateText}>{zh['panel.loading']}</span>
          </div>
        )}

        {status === 'error' && (
          <div className={styles.state}>
            <span className={styles.stateText}>{loadError ?? zh['detail.loadError'].replace('{error}', '')}</span>
            <button type="button" className={styles.btn} onClick={() => void load()}>
              {zh['panel.retry']}
            </button>
          </div>
        )}

        {status === 'ready' && payload !== null && (
          <>
            <div className={styles.detailHeader}>
              <span className={styles.detailIcon}>
                <DocIcon />
              </span>
              <div>
                <div className={styles.detailTitle}>
                  <span>{payload.name}</span>
                  {invokableNames.length > 0 && (
                    <span className={`${styles.badge} ${styles.badgeInvokable}`}>
                      {zh['card.invokable'].replace('{names}', invokableNames.join(' · '))}
                    </span>
                  )}
                  {item?.linked === true && (
                    <span className={`${styles.badge} ${styles.badgeLinked}`}>{zh['card.linked']}</span>
                  )}
                </div>
                {pathLine !== undefined && <div className={styles.detailMeta}>{pathLine}</div>}
              </div>
            </div>

            <div className={styles.detailBody}>
              {payload.frontmatter !== '' && <pre className={styles.frontmatter}>{payload.frontmatter}</pre>}
              {/* Safe: markdownLite escapes the input before emitting markup. */}
              <div className={styles.md} dangerouslySetInnerHTML={{ __html: markdownLite(payload.body) }} />
            </div>
          </>
        )}

        {copyError !== null && (
          <div className={styles.cardError} role="alert">
            {copyError}
          </div>
        )}
      </div>
    </div>
  );
}
