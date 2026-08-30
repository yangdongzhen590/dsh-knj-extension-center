// Install flow (Task 13) — 选择文件 → 确认信息 → 完成, with preview/install
// separation: step 1 parses the selected zip LOCALLY with jszip (finds the
// single `<name>/SKILL.md`, reads its frontmatter name/description, lists the
// package files) and uploads nothing; step 2 shows the confirm card (skill
// name / description / fixed target `~/.dsh/skills/<name>/` / file list) and
// only the 安装 button POSTs the whole zip via `api.install(zip, false)`;
// a `{ conflict: true, existing }` answer opens the ConflictDialog overlay,
// whose 覆盖 re-POSTs with overwrite=true; step 3 is the success card (path +
// 旧版本已移入回收站 note when an overwrite happened) and 完成 returns via
// onDone so the parent refreshes the list.
//
// The client bundle must not import host code (it pulls in node builtins), so
// the zip/frontmatter validation here is a self-contained jszip-only mirror of
// src/zip-install.ts: kebab-case name, single top-level dir, `<name>/SKILL.md`
// present, frontmatter name matches the dir, non-empty description, 8MB cap.
// Parse failures surface as a locale message under the dropzone (step 1 stays).

import { useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import JSZip from 'jszip';
import type { InstallConflict, SkillApi } from '../api';
import { zh } from '../locales';
import { ConflictDialog } from './ConflictDialog';
import styles from './skill-center.module.css';

export interface InstallFlowProps {
  api: SkillApi;
  /** Installation finished — the parent refreshes the list and switches back. */
  onDone: () => void;
  /** The user cancelled — the parent switches back without refreshing. */
  onCancel: () => void;
}

/** Metadata of a locally parsed skill zip (no upload involved). */
export interface ZipPreview {
  name: string;
  description: string;
  fileCount: number;
  /** Zip entry paths, absolute within the archive (e.g. `my-skill/SKILL.md`). */
  entries: string[];
}

/** Client-side parse failure, mirroring the host's ZipInstallError codes. */
export class ZipPreviewError extends Error {
  readonly code: 'size' | 'zip' | 'layout' | 'name' | 'skill';

  constructor(code: ZipPreviewError['code'], message: string) {
    super(message);
    this.name = 'ZipPreviewError';
    this.code = code;
  }
}

const NAME_RE = /^[a-z0-9][a-z0-9-]*$/;
const MAX_ZIP_BYTES = 8 * 1024 * 1024; // matches the dropzone copy + host default

/**
 * Minimal SKILL.md frontmatter reader (name / description / when-to-use).
 * Mirrors the host parser for the fields the install preview needs: simple
 * `key: value` lines plus `|` / `>` block scalars, quotes stripped.
 */
function parseFrontmatterLite(content: string): { name?: string; description?: string; whenToUse?: string } {
  const fm: { name?: string; description?: string; whenToUse?: string } = {};
  const rec = fm as Record<string, string | undefined>;
  const lines = content.split(/\r?\n/);
  let i = 0;
  for (; i < lines.length; i++) {
    const line = lines[i];
    const m = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (!m) continue;
    const key = m[1];
    if (key !== 'name' && key !== 'description' && key !== 'when-to-use') continue;
    const field = key === 'when-to-use' ? 'whenToUse' : key;
    const raw = m[2].trim();
    if (raw === '|' || raw === '>') {
      const block: string[] = [];
      let j = i + 1;
      while (j < lines.length && /^[ \t]/.test(lines[j])) {
        block.push(lines[j].replace(/^[ \t]+/, ''));
        j++;
      }
      i = j - 1;
      const value = raw === '|' ? block.join('\n') : block.join(' ');
      if (value !== '') rec[field] = value;
    } else if (raw !== '') {
      const unquoted =
        raw.length >= 2 &&
        ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'")))
          ? raw.slice(1, -1)
          : raw;
      rec[field] = unquoted;
    }
  }
  return fm;
}

/**
 * Validate a skill zip locally (mirror of the host's validateZip for the
 * fields the preview needs). Throws ZipPreviewError on every failure mode.
 */
export async function parseZipPreview(file: File): Promise<ZipPreview> {
  if (file.size > MAX_ZIP_BYTES) {
    throw new ZipPreviewError('size', `zip size exceeds ${MAX_ZIP_BYTES} bytes`);
  }
  let zip: JSZip;
  try {
    // jszip accepts a File/Blob directly (FileReader under the hood); the
    // browser path also covers jsdom, which lacks Blob.prototype.arrayBuffer.
    zip = await JSZip.loadAsync(file);
  } catch (err) {
    throw new ZipPreviewError('zip', err instanceof Error ? err.message : String(err));
  }

  // Layout: one package = one top-level directory; a file at the zip root or
  // multiple top-level directories are invalid.
  const names = Object.keys(zip.files);
  const tops = new Set<string>();
  let rootFile: string | undefined;
  for (const p of names) {
    const idx = p.indexOf('/');
    if (idx === -1) rootFile = rootFile ?? p;
    else tops.add(p.slice(0, idx));
  }
  if (rootFile !== undefined) {
    throw new ZipPreviewError('layout', `file at zip root '${rootFile}'`);
  }
  if (tops.size !== 1) {
    throw new ZipPreviewError('layout', 'expected a single top-level skill directory');
  }
  const skillName = [...tops][0];
  if (!NAME_RE.test(skillName)) {
    throw new ZipPreviewError('name', `invalid skill name '${skillName}'`);
  }

  const skillEntry = zip.file(`${skillName}/SKILL.md`);
  if (!skillEntry) {
    throw new ZipPreviewError('skill', `missing ${skillName}/SKILL.md`);
  }
  const fm = parseFrontmatterLite(await skillEntry.async('string'));
  if (fm.name !== skillName) {
    throw new ZipPreviewError('name', `frontmatter name '${fm.name ?? ''}' does not match '${skillName}'`);
  }
  if (fm.description === undefined || fm.description.trim() === '') {
    throw new ZipPreviewError('skill', `skill '${skillName}' has no description`);
  }

  const entries = names.filter((p) => !p.endsWith('/')).sort();
  return { name: skillName, description: fm.description, fileCount: entries.length, entries };
}

/** Map a ZipPreviewError code to its locale message. */
function localizedZipError(err: unknown): string {
  if (err instanceof ZipPreviewError) {
    switch (err.code) {
      case 'size':
        return zh['install.errorTooLarge'];
      case 'zip':
        return zh['install.errorNotZip'];
      case 'layout':
        return zh['install.errorLayout'];
      case 'name': {
        const m = /invalid skill name '([^']+)'|frontmatter name '([^']*)'/.exec(err.message);
        const name = m ? (m[1] ?? m[2] ?? '') : '';
        return zh['install.errorInvalidName'].replace('{name}', name);
      }
      case 'skill': {
        const m = /missing ([^ ]+)\/SKILL\.md/.exec(err.message);
        return m ? zh['install.errorNoSkillMd'].replace('{name}', m[1]) : zh['install.errorNoDescription'];
      }
    }
  }
  const detail = err instanceof Error && err.message !== '' ? err.message : String(err);
  return zh['install.errorParse'].replace('{error}', detail);
}

/** The host error text (or its string form) for the inline install failure. */
function failureDetail(err: unknown): string {
  return err instanceof Error && err.message !== '' ? err.message : String(err);
}

/** One node of the package-contents tree. */
interface TreeNode {
  name: string;
  children: TreeNode[];
}

/** Build a directory tree from sorted absolute zip entry paths. */
function buildTree(entries: string[]): TreeNode[] {
  const root: TreeNode = { name: '', children: [] };
  for (const entry of entries) {
    let node = root;
    for (const part of entry.split('/')) {
      let child = node.children.find((c) => c.name === part);
      if (!child) {
        child = { name: part, children: [] };
        node.children.push(child);
      }
      node = child;
    }
  }
  return root.children;
}

/** Render the tree with box-drawing connectors (design doc 包内容 file list). */
function treeLines(nodes: TreeNode[], prefix: string, out: string[]): void {
  const sorted = [...nodes].sort(
    (a, b) =>
      (a.children.length > 0 ? 0 : 1) - (b.children.length > 0 ? 0 : 1) ||
      a.name.localeCompare(b.name),
  );
  sorted.forEach((node, i) => {
    const last = i === sorted.length - 1;
    const label = node.children.length > 0 ? `${node.name}/` : node.name;
    out.push(`${prefix}${last ? '└─ ' : '├─ '}${label}`);
    if (node.children.length > 0) {
      treeLines(node.children, prefix + (last ? '　' : '│　'), out);
    }
  });
}

/** Upload/rocket icon (design doc dropzone). */
function RocketIcon() {
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
      <path d="M8 2c3 1 4.5 4 4.5 7L11 10.5l-1 3-2-1.5-2 1.5-1-3L3.5 9C3.5 6 5 3 8 2z" />
      <circle cx="8" cy="6.5" r="1.4" />
    </svg>
  );
}

/** Document icon (design doc confirm card head). */
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

/** Back chevron (design doc header cancel button). */
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

/** Check icon (design doc success box). */
function CheckIcon() {
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
      <path d="M3 8.5 6.5 12 13 4.5" />
    </svg>
  );
}

type Step = 1 | 2 | 3;

export function InstallFlow({ api, onDone, onCancel }: InstallFlowProps) {
  const [step, setStep] = useState<Step>(1);
  const [preview, setPreview] = useState<ZipPreview | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [installError, setInstallError] = useState<string | null>(null);
  const [installing, setInstalling] = useState(false);
  // The existing install the host reported, or null when no dialog is open.
  const [conflict, setConflict] = useState<NonNullable<InstallConflict['existing']> | null>(null);
  const [result, setResult] = useState<{ name: string; path: string; overwritten: boolean } | null>(null);
  // Drag highlight for the dropzone visual state.
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // Guards against an out-of-order parse when the user reselects mid-parse.
  const parseToken = useRef(0);

  /** Parse the zip locally; on success move to step 2 (nothing uploaded). */
  const handleFile = async (f: File) => {
    const token = ++parseToken.current;
    setParseError(null);
    setInstallError(null);
    try {
      const p = await parseZipPreview(f);
      if (token !== parseToken.current) return; // stale selection
      setPreview(p);
      setFile(f);
      setStep(2);
    } catch (err) {
      if (token !== parseToken.current) return;
      setPreview(null);
      setFile(null);
      setStep(1);
      setParseError(localizedZipError(err));
    }
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const f = event.target.files?.[0];
    // Reset so selecting the same file again re-fires change.
    event.target.value = '';
    if (f !== undefined) void handleFile(f);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    const f = event.dataTransfer?.files?.[0];
    if (f !== undefined) void handleFile(f);
  };

  /** Back to step 1, dropping the current preview (re-selection). */
  const handleReselect = () => {
    parseToken.current++;
    setPreview(null);
    setFile(null);
    setParseError(null);
    setInstallError(null);
    setStep(1);
  };

  /** First install attempt with overwrite=false; conflict opens the dialog. */
  const handleInstall = async () => {
    if (file === null || preview === null || installing) return;
    setInstalling(true);
    setInstallError(null);
    try {
      const res = await api.install(file, false);
      if ('conflict' in res) {
        setConflict(res.existing ?? { name: preview.name });
        return;
      }
      setResult({ name: res.name, path: res.path, overwritten: false });
      setStep(3);
    } catch (err) {
      console.warn('skill-center: install failed', err);
      setInstallError(failureDetail(err));
    } finally {
      setInstalling(false);
    }
  };

  /** Overwrite retry after the user confirmed in the conflict dialog. */
  const handleOverwrite = async () => {
    if (file === null || installing) return;
    setConflict(null);
    setInstalling(true);
    setInstallError(null);
    try {
      const res = await api.install(file, true);
      if ('conflict' in res) {
        setConflict(res.existing ?? null);
        return;
      }
      setResult({ name: res.name, path: res.path, overwritten: true });
      setStep(3);
    } catch (err) {
      console.warn('skill-center: overwrite install failed', err);
      setInstallError(failureDetail(err));
    } finally {
      setInstalling(false);
    }
  };

  const targetDir = preview !== null ? `~/.dsh/skills/${preview.name}/` : '';
  const contentsLines: string[] = [];
  if (preview !== null) {
    contentsLines.push(`${preview.name}/`);
    // build the tree from paths relative to the skill dir, so the root
    // directory line is emitted exactly once (the design doc's file list)
    const relative = preview.entries.map((e) => e.slice(preview.name.length + 1));
    treeLines(buildTree(relative), '', contentsLines);
  }

  return (
    <div className={styles.root}>
      <header className={styles.viewHead}>
        <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={onCancel}>
          <BackIcon />
          {zh['install.cancel']}
        </button>
        <div>
          <div className={styles.title}>{zh['install.title']}</div>
          <div className={styles.subtitle}>{zh['install.subtitle']}</div>
        </div>
        <span className={styles.spacer} />
      </header>

      <div className={styles.installBody}>
        <div className={styles.steps} aria-label={zh['install.title']}>
          <div className={`${styles.step} ${step >= 2 ? styles.stepDone : ''} ${step === 1 ? styles.stepCurrent : ''}`} data-step="1" aria-current={step === 1 ? 'step' : undefined}>
            <span className={styles.stepDot}>1</span>
            <span className={styles.stepLabel}>{zh['install.step1']}</span>
          </div>
          <span className={styles.stepLine} />
          <div className={`${styles.step} ${step >= 3 ? styles.stepDone : ''} ${step === 2 ? styles.stepCurrent : ''}`} data-step="2" aria-current={step === 2 ? 'step' : undefined}>
            <span className={styles.stepDot}>2</span>
            <span className={styles.stepLabel}>{zh['install.step2']}</span>
          </div>
          <span className={styles.stepLine} />
          <div className={`${styles.step} ${step === 3 ? styles.stepCurrent : ''}`} data-step="3" aria-current={step === 3 ? 'step' : undefined}>
            <span className={styles.stepDot}>3</span>
            <span className={styles.stepLabel}>{zh['install.step3']}</span>
          </div>
        </div>

        {step === 1 && (
          <div className={styles.dropzoneWrap}>
            <div
              className={`${styles.dropzone} ${dragging ? styles.dropzoneDrag : ''}`}
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              role="button"
              tabIndex={0}
              aria-label={zh['install.dropzoneMain']}
            >
              <span className={styles.dropzoneIcon}>
                <RocketIcon />
              </span>
              <div className={styles.dropzoneMain}>{zh['install.dropzoneMain']}</div>
              <div className={styles.dropzoneSub}>{zh['install.dropzoneSub']}</div>
              <span className={styles.dropzoneFmt}>{zh['install.format']}</span>
            </div>
            <input
              ref={inputRef}
              className={styles.fileInput}
              type="file"
              accept=".zip"
              onChange={handleFileChange}
            />
            {parseError !== null && (
              <div className={styles.cardError} role="alert">
                {parseError}
              </div>
            )}
          </div>
        )}

        {step === 2 && preview !== null && file !== null && (
          <div className={styles.confirmCard}>
            <div className={styles.confirmHead}>
              <span className={styles.cardIcon}>
                <DocIcon />
              </span>
              <span className={styles.confirmTitle}>{file.name}</span>
            </div>
            <div className={styles.field}>
              <div className={styles.fieldLabel}>{zh['install.fieldName']}</div>
              <div className={`${styles.fieldVal} ${styles.mono}`}>{preview.name}</div>
            </div>
            <div className={styles.field}>
              <div className={styles.fieldLabel}>{zh['install.fieldDescription']}</div>
              <div className={styles.fieldVal}>{preview.description}</div>
            </div>
            <div className={styles.field}>
              <div className={styles.fieldLabel}>{zh['install.fieldTarget']}</div>
              <div className={`${styles.fieldVal} ${styles.mono}`}>{targetDir}</div>
            </div>
            <div className={styles.field}>
              <div className={styles.fieldLabel}>{zh['install.fieldContents'].replace('{count}', String(preview.fileCount))}</div>
              <ul className={styles.fileList}>
                {contentsLines.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            </div>
            {installError !== null && (
              <div className={styles.cardError} role="alert">
                {installError}
              </div>
            )}
            <div className={styles.confirmActions}>
              <button type="button" className={styles.btn} onClick={handleReselect} disabled={installing}>
                {zh['install.reselect']}
              </button>
              <span className={styles.spacer} />
              <button
                type="button"
                className={`${styles.btn} ${styles.btnPrimary}`}
                onClick={() => void handleInstall()}
                disabled={installing}
              >
                {zh['install.confirmInstall']}
              </button>
            </div>
          </div>
        )}

        {step === 3 && result !== null && (
          <>
            <div className={styles.successBox}>
              <span className={styles.successIcon}>
                <CheckIcon />
              </span>
              <div className={styles.successTitle}>{zh['install.successTitle']}</div>
              <div className={styles.successPath}>
                {result.path}
                {result.overwritten && (
                  <>
                    <br />
                    {zh['install.successOldInTrash']}
                  </>
                )}
              </div>
            </div>
            <div className={styles.successActions}>
              <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={onDone}>
                {zh['install.finish']}
              </button>
            </div>
          </>
        )}
      </div>

      {conflict !== null && (
        <ConflictDialog existing={conflict} onOverwrite={() => void handleOverwrite()} onCancel={() => setConflict(null)} />
      )}
    </div>
  );
}
