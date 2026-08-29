// Recoverable trash for user skills under <skillsRoot>/.trash.
// Uninstall moves the whole skill directory into .trash/<name>-<timestamp>/
// (keeping the directory structure and original name), restore renames it
// back, purge deletes it permanently. Legacy single-file entries left by
// skill-explorer (.trash/<timestamp>-SKILL.md) are detected and listed with
// legacy=true; their original location is unknown so restore refuses and asks
// for a manual move.

import { access, mkdir, readdir, readFile, rename, rm, stat } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { parseFrontmatter } from './frontmatter';

export interface TrashItem {
  /** Skill name: for new-format dirs the <name>-<ts> prefix, for legacy the frontmatter name. */
  name: string;
  /** Absolute path of the trashed entry inside .trash. */
  trashPath: string;
  /** Where the entry came from; '' when unknown (legacy single-file items). */
  originalPath: string;
  /** Unix ms timestamp of the deletion, as embedded in the trash entry name. */
  deletedAt: string;
  /** True for skill-explorer leftovers (<ts>-SKILL.md) that cannot be auto-restored. */
  legacy: boolean;
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function isFile(p: string): Promise<boolean> {
  try {
    return (await stat(p)).isFile();
  } catch {
    return false;
  }
}

async function readMaybe(file: string): Promise<string | undefined> {
  try {
    return await readFile(file, 'utf8');
  } catch {
    return undefined;
  }
}

/**
 * Move a skill directory into its sibling `.trash/<name>-<timestamp>/`,
 * preserving the original directory structure and name. Returns the trash
 * path. If the timestamped target already exists (same-millisecond trash),
 * a random suffix is appended.
 */
export async function trashSkillDir(skillDir: string): Promise<string> {
  const trashRoot = join(dirname(skillDir), '.trash');
  await mkdir(trashRoot, { recursive: true });
  const base = `${basename(skillDir)}-${Date.now()}`;
  let target = join(trashRoot, base);
  if (await pathExists(target)) {
    target = join(trashRoot, `${base}-${Math.random().toString(36).slice(2, 8)}`);
  }
  await rename(skillDir, target);
  return target;
}

/**
 * List every recoverable trash entry under `<skillsRoot>/.trash`.
 * New directory format: `<name>-<ts>/` containing SKILL.md (name derived from
 * the directory name, originalPath back at the skills root). New single-file
 * format: `<name>.md-<ts>` (whole-file skills trashed by uninstall; the .md
 * extension is kept on originalPath). Legacy format: single files
 * `<ts>-SKILL.md` (name parsed from frontmatter, originalPath unknown). A
 * missing .trash yields an empty list.
 */
export async function listTrash(skillsRoot: string): Promise<TrashItem[]> {
  const trashRoot = join(skillsRoot, '.trash');
  let entries;
  try {
    entries = await readdir(trashRoot, { withFileTypes: true });
  } catch {
    return [];
  }
  const items: TrashItem[] = [];
  for (const ent of entries) {
    const full = join(trashRoot, ent.name);
    if (ent.isDirectory()) {
      const skillFile = join(full, 'SKILL.md');
      if (await isFile(skillFile)) {
        const name = ent.name.replace(/-\d+$/, '');
        items.push({
          name,
          trashPath: full,
          originalPath: join(skillsRoot, name),
          deletedAt: /-(\d+)$/.exec(ent.name)?.[1] ?? '',
          legacy: false,
        });
      }
    } else if (ent.isFile()) {
      const legacy = /^(\d+)-SKILL\.md$/.exec(ent.name);
      if (legacy) {
        const content = await readMaybe(full);
        const fm = parseFrontmatter(content ?? '');
        items.push({
          name: fm.name ?? ent.name,
          trashPath: full,
          originalPath: '', // legacy original location is unknown
          deletedAt: legacy[1],
          legacy: true,
        });
        continue;
      }
      // New single-file format `<name>.md-<ts>`: the file name minus the
      // `-<ts>` suffix keeps the .md, so originalPath points back at the
      // whole-file skill it came from.
      const single = /^(.*\.md)-(\d+)$/.exec(ent.name);
      if (single) {
        const fileName = single[1];
        items.push({
          name: fileName.replace(/\.md$/, ''),
          trashPath: full,
          originalPath: join(skillsRoot, fileName),
          deletedAt: single[2],
          legacy: false,
        });
      }
    }
  }
  return items;
}

/**
 * Rename a trash entry back to its original path. Throws when the original
 * path is already occupied (the caller decides overwrite vs cancel) and for
 * legacy single-file entries whose original location is unknown (move them
 * back manually).
 */
export async function restoreTrashItem(item: TrashItem): Promise<string> {
  if (item.legacy) {
    throw new Error(
      `cannot restore legacy trash item automatically (${item.trashPath}); move the file back to your skills root manually`,
    );
  }
  if (!item.originalPath) throw new Error('original path unknown');
  if (await pathExists(item.originalPath)) throw new Error('original path occupied');
  await rename(item.trashPath, item.originalPath);
  return item.originalPath;
}

/** Permanently delete a trash entry (recursive, missing entries tolerated). */
export async function purgeTrashItem(item: TrashItem): Promise<void> {
  await rm(item.trashPath, { recursive: true, force: true });
}
