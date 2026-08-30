// One skill card in the list view grid. Presentational: renders name,
// description, invocation/linked badges and — only when the skill has a real
// file path (user-dsh) — the model-invocable switch, copy-path and uninstall
// buttons. Bundled / runtime skills carry no path, so their cards are
// read-only (no switch / copy / uninstall). Clicking the card body opens the
// detail view; foot controls stop propagation so they never open it.

import type { MouseEvent } from 'react';
import type { SkillItem } from '../api';
import { zh } from '../locales';
import styles from './skill-center.module.css';

export interface SkillCardProps {
  skill: SkillItem;
  onOpen: (skill: SkillItem) => void;
  onToggle: (skill: SkillItem, enabled: boolean) => void;
  onUninstall: (skill: SkillItem) => void;
}

/** Document icon — the design doc's per-card icon is not in the payload. */
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

export function SkillCard({ skill, onOpen, onToggle, onUninstall }: SkillCardProps) {
  // Bundled / runtime skills have no filesystem path: nothing to toggle,
  // copy or uninstall.
  const hasPath = skill.path !== undefined;

  const invokableNames: string[] = [];
  if (skill.modelInvocable) invokableNames.push(zh['card.model']);
  if (skill.userInvocable) invokableNames.push(zh['card.user']);

  const handleToggle = (event: MouseEvent) => {
    event.stopPropagation();
    onToggle(skill, !skill.modelInvocable);
  };

  const handleCopy = (event: MouseEvent) => {
    event.stopPropagation();
    if (skill.path === undefined) return;
    // Best-effort copy; a missing/failing clipboard is silently ignored.
    if (typeof navigator.clipboard?.writeText === 'function') {
      void navigator.clipboard.writeText(skill.path).catch(() => {});
    }
  };

  const handleUninstall = (event: MouseEvent) => {
    event.stopPropagation();
    const message = zh['uninstall.confirm'].replace('{name}', skill.name);
    if (window.confirm(message)) onUninstall(skill);
  };

  return (
    <article
      className={styles.card}
      data-skill-name={skill.name}
      onClick={() => onOpen(skill)}
    >
      <div className={styles.cardTop}>
        <span className={styles.cardIcon}>
          <DocIcon />
        </span>
        <span className={styles.cardName} title={skill.name}>
          {skill.name}
        </span>
      </div>
      <p className={styles.cardDesc}>{skill.description}</p>
      <div className={styles.cardBadges}>
        {invokableNames.length > 0 && (
          <span className={`${styles.badge} ${styles.badgeInvokable}`}>
            {zh['card.invokable'].replace('{names}', invokableNames.join(' · '))}
          </span>
        )}
        {skill.linked && (
          <span className={`${styles.badge} ${styles.badgeLinked}`}>{zh['card.linked']}</span>
        )}
      </div>
      {hasPath && (
        <div className={styles.cardFoot}>
          <button
            type="button"
            role="switch"
            aria-checked={skill.modelInvocable}
            title={zh['card.toggleTitle']}
            className={styles.switch}
            onClick={handleToggle}
          >
            <span className={styles.switchTrack} />
            <span className={styles.switchThumb} />
          </button>
          <span className={styles.footSpacer} />
          <button
            type="button"
            className={styles.iconBtn}
            title={zh['card.copyPathTitle']}
            onClick={handleCopy}
          >
            <CopyIcon />
          </button>
          <button
            type="button"
            className={styles.iconBtn}
            title={zh['card.uninstallTitle']}
            onClick={handleUninstall}
          >
            <TrashIcon />
          </button>
        </div>
      )}
    </article>
  );
}
