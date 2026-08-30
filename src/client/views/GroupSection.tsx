// Region group for the list view: one collapsible section per skill level
// (系统内置 / 用户技能（~/.dsh/skills）/ 运行时注册). The header shows the
// chevron, a level icon, the locale title, a count badge and the hint; the
// body is the card grid (children rendered by the parent). Titles and hints
// come from locales (group.<key>.*), falling back to the host payload for
// unknown group keys. Collapse state is local and survives re-fetches
// because the parent keys sections by group key.

import { useState, type ReactNode } from 'react';
import type { Group } from '../api';
import { zh } from '../locales';
import styles from './skill-center.module.css';

export interface GroupSectionProps {
  group: Group;
  children: ReactNode;
}

/** Look up a locale string by key; undefined for unknown keys. */
function locale(key: string): string | undefined {
  return (zh as Record<string, string>)[key];
}

/** Level icon from the design doc (box / user / bolt). */
function GroupIcon({ level }: { level: Group['key'] }) {
  const common = {
    viewBox: '0 0 16 16',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.4,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
  } as const;
  if (level === 'user-dsh') {
    return (
      <svg {...common}>
        <circle cx="8" cy="6" r="2.6" />
        <path d="M3 13.5c.6-3 2.6-4.7 5-4.7s4.4 1.7 5 4.7" />
      </svg>
    );
  }
  if (level === 'runtime') {
    return (
      <svg {...common}>
        <path d="M9 1.5 3 9h4l-1 5.5L12 7H8z" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M2.5 4.5 8 2l5.5 2.5v7L8 14l-5.5-2.5z" />
      <path d="M2.5 4.5 8 7l5.5-2.5M8 7v7" />
    </svg>
  );
}

export function GroupSection({ group, children }: GroupSectionProps) {
  const [collapsed, setCollapsed] = useState(false);
  const title = locale(`group.${group.key}.title`) ?? group.title;
  const hint = locale(`group.${group.key}.hint`) ?? group.hint;
  const sectionClass = collapsed ? `${styles.group} ${styles.collapsed}` : styles.group;

  return (
    <section className={sectionClass} data-group-key={group.key}>
      <button
        type="button"
        className={styles.groupTitle}
        aria-expanded={!collapsed}
        onClick={() => setCollapsed((prev) => !prev)}
      >
        <span className={styles.chev} aria-hidden="true">
          ▾
        </span>
        <span className={styles.groupIcon}>
          <GroupIcon level={group.key} />
        </span>
        <span>{title}</span>
        <span className={styles.count}>{group.skills.length}</span>
        <span className={styles.hint}>{hint}</span>
      </button>
      <div className={styles.grid}>{children}</div>
    </section>
  );
}
