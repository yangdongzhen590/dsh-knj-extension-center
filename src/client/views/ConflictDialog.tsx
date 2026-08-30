// Conflict dialog (Task 13) — the view-level overlay shown when the host
// answers `{ conflict: true, existing }` to an install POST. Rendered inside
// the install flow (absolutely positioned over the panel, NOT window.confirm),
// mirroring the design doc's 冲突对话框: warning title, the existing version's
// source (level → group title) and path, and the 覆盖（旧版入回收站）/ 取消
// actions. The dialog is purely presentational — InstallFlow owns the retry
// install call and closes it via onCancel.

import type { InstallConflict, SkillLevel } from '../api';
import { zh } from '../locales';
import styles from './skill-center.module.css';

export interface ConflictDialogProps {
  /** The existing install the host reported (name always present). */
  existing: NonNullable<InstallConflict['existing']>;
  /** The user chose 覆盖 — install again with overwrite=true. */
  onOverwrite: () => void;
  /** The user chose 取消 — close the dialog, stay on the confirm card. */
  onCancel: () => void;
}

/** Map a skill level to the human 来源 label (same titles as the list groups). */
function levelTitle(level: SkillLevel | undefined): string {
  if (level === 'bundled') return zh['group.bundled.title'];
  if (level === 'runtime') return zh['group.runtime.title'];
  return zh['group.user-dsh.title'];
}

/** Warning triangle (design doc dialog title icon). */
function WarnIcon() {
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
      <path d="M8 1.8 14.5 13.5h-13L8 1.8z" />
      <path d="M8 6.2v3M8 11.4v.1" />
    </svg>
  );
}

export function ConflictDialog({ existing, onOverwrite, onCancel }: ConflictDialogProps) {
  return (
    <div className={styles.dialogMask} role="presentation">
      <div className={styles.dialog} role="alertdialog" aria-label={zh['conflict.title']}>
        <div className={styles.dialogTitle}>
          <span className={styles.dialogTitleIcon}>
            <WarnIcon />
          </span>
          {zh['conflict.title']}
        </div>
        <div className={styles.dialogBody}>
          <p className={styles.dialogBodyText}>
            {zh['conflict.bodyPrefix'].replace('{name}', existing.name)}
          </p>
          <div className={styles.dialogExisting}>
            <span className={styles.dialogFieldLabel}>{zh['conflict.existingLabel']}</span>
            <span>{levelTitle(existing.level)}</span>
          </div>
          {existing.path !== undefined && existing.path !== '' && (
            <div className={styles.dialogMono}>{existing.path}</div>
          )}
          <p className={styles.dialogBodyText}>{zh['conflict.explain']}</p>
        </div>
        <div className={styles.dialogActions}>
          <button type="button" className={styles.btn} onClick={onCancel}>
            {zh['conflict.cancel']}
          </button>
          <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={onOverwrite}>
            {zh['conflict.overwrite']}
          </button>
        </div>
      </div>
    </div>
  );
}
