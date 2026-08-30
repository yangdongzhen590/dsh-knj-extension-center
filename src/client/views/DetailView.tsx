// Detail view (Task 11) — full-text preview of one skill. Loads the raw
// detail payload via `api.detail(name)` (host sends { name, frontmatter,
// body }; frontmatter is the raw fenced text, body is verbatim markdown) and
// renders: a back button + actions (copy path / uninstall / model-invocable
// switch) in the header, then a header card (icon, name, invokable/linked
// badges, path line) and the frontmatter code block + markdown-lite body.
//
// Metadata null-checking (Task 7 forward note): the host detail route only
// returns name/frontmatter/body, so level/path/linked/modelInvocable/… may be
// undefined. The view derives what it can: the path line from `level`
// (user-dsh → ~/.dsh/skills/<name>/SKILL.md, bundled → 系统内置, runtime →
// 运行时注册), falling back to the raw `path` when level is missing. The
// manage actions (copy/uninstall/toggle) only appear when a real file path is
// available (user-dsh skills; derived path), because setEnabled/uninstall are
// file-backed — bundled/runtime skills are read-only, matching SkillCard.
//
// Mutations are delegated to the parent via `onToggle(enabled)` /
// `onUninstall()` (the Task 14 controller owns the API calls and view
// switching); the switch is a controlled role=switch whose aria-checked
// mirrors the payload. Copy is local best-effort with an inline error.

import { useCallback, useEffect, useState } from 'react';
import type { DetailPayload, SkillApi } from '../api';
import { zh } from '../locales';
import { markdownLite } from './markdown-lite';
import styles from './skill-center.module.css';

export interface DetailViewProps {
  api: SkillApi;
  /** Skill name to load; the parent passes the list-entry name. */
  name: string;
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
 * The path line shown under the skill name. Derived from `level` per the
 * design doc; when the level is unknown (host-only payload) the raw `path`
 * is shown verbatim, and with neither the line is omitted.
 */
function pathLineFor(payload: DetailPayload): string | undefined {
  if (payload.level === 'user-dsh') return zh['detail.pathUserSkill'].replace('{name}', payload.name);
  if (payload.level === 'bundled') return zh['detail.pathBundled'];
  if (payload.level === 'runtime') return zh['detail.pathRuntime'];
  return payload.path;
}

/**
 * The real file path the manage actions operate on: the payload's own path,
 * or the canonical user-skill path when the level says user-dsh (the host
 * omits `path` from the detail route). Undefined for bundled/runtime → the
 * actions are hidden.
 */
function actionPathFor(payload: DetailPayload): string | undefined {
  if (payload.path !== undefined) return payload.path;
  if (payload.level === 'user-dsh') return zh['detail.pathUserSkill'].replace('{name}', payload.name);
  return undefined;
}

export function DetailView({ api, name, onBack, onUninstall, onToggle }: DetailViewProps) {
  const [payload, setPayload] = useState<DetailPayload | null>(null);
  const [status, setStatus] = useState<'loading' | 'error' | 'ready'>('loading');
  const [copyError, setCopyError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      const data = await api.detail(name);
      setPayload(data);
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, [api, name]);

  useEffect(() => {
    void load();
  }, [load]);

  const actionPath = payload !== null ? actionPathFor(payload) : undefined;
  const hasActions = actionPath !== undefined;
  const invokableNames: string[] = [];
  if (payload?.modelInvocable === true) invokableNames.push(zh['card.model']);
  if (payload?.userInvocable === true) invokableNames.push(zh['card.user']);

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
    onToggle(payload?.modelInvocable !== true);
  };

  const pathLine = payload !== null ? pathLineFor(payload) : undefined;

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
              aria-checked={payload?.modelInvocable === true}
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
            <span className={styles.stateText}>{zh['panel.loadError']}</span>
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
                  {payload.linked === true && (
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
