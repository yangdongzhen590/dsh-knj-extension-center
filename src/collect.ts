// Three-tier skill collection: user-dsh (filesystem scan of ~/.dsh/skills)
// merged with the host skill registry snapshot (bundled / runtime levels).
// Port of the skill-explorer plugin's collect logic, simplified: no project
// level, no custom roots; filesystem entries win same-name conflicts and the
// registry supplements whenToUse / invocation the frontmatter did not declare.

import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { parseFrontmatter, type ParsedFrontmatter } from './frontmatter';

export type SkillLevel = 'bundled' | 'user-dsh' | 'runtime';

export interface SkillEntry {
  name: string;
  description: string;
  whenToUse?: string;
  provider: string;
  level: SkillLevel;
  path?: string;
  linked: boolean;
  modelInvocable: boolean;
  userInvocable: boolean;
}

export interface RegistrySkill {
  name: string;
  description?: string;
  whenToUse?: string;
  provider?: string;
  source?: string;
  invocation?: { modelInvocable?: boolean; userInvocable?: boolean };
}

export interface SkillRegistry {
  snapshot(opts: { cwd: string }): Promise<{ complete?: boolean; skills: RegistrySkill[] }>;
}

export interface CollectOptions {
  cwd: string;
  dshHome: string;
  registry: SkillRegistry;
}

/** Public skill-name grammar; anything else is skipped. */
const NAME_RE = /^[a-z0-9][a-z0-9-]*$/;

/** Registry entry carrying optional invocation policy for gap-filling merges. */
interface MergeEntry extends SkillEntry {
  regInvocation?: RegistrySkill['invocation'];
}

/** Only bundled / runtime registry sources are collected; the rest are dropped. */
function levelFromSource(source: string | undefined): SkillLevel | undefined {
  if (source === 'bundled') return 'bundled';
  if (source === 'runtime') return 'runtime';
  return undefined;
}

/**
 * Collect every skill from the host registry snapshot and the user skills
 * root. Returns entries with the merged view plus whether the snapshot was
 * complete (an incomplete snapshot marks the whole result incomplete).
 */
export async function collectSkills(opts: CollectOptions): Promise<{ skills: SkillEntry[]; complete: boolean }> {
  const snap = await opts.registry.snapshot({ cwd: opts.cwd });
  const complete = snap.complete !== false;
  const byName = new Map<string, MergeEntry>();

  for (const rs of snap.skills) {
    const level = levelFromSource(rs.source);
    if (!level) continue;
    byName.set(rs.name, {
      name: rs.name,
      description: rs.description ?? '',
      whenToUse: rs.whenToUse,
      provider: rs.provider ?? level,
      level,
      linked: false,
      modelInvocable: rs.invocation?.modelInvocable ?? true,
      userInvocable: rs.invocation?.userInvocable ?? true,
      regInvocation: rs.invocation,
    });
  }

  await scanSkillRoot(join(opts.dshHome, 'skills'), byName);

  const skills: SkillEntry[] = [];
  for (const e of byName.values()) {
    const { regInvocation: _regInvocation, ...entry } = e;
    skills.push(entry);
  }
  return { skills, complete };
}

/**
 * Scan one skills root for directory skills (`<name>/SKILL.md`) and single-file
 * skills (`<name>.md`), following symlinks (marked linked). Unreadable or
 * invalid entries are skipped, never thrown.
 */
async function scanSkillRoot(root: string, into: Map<string, MergeEntry>): Promise<void> {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return; // missing or unreadable root: nothing to collect
  }
  for (const ent of entries) {
    const full = join(root, ent.name);
    let isDir = ent.isDirectory();
    let isFile = ent.isFile();
    if (ent.isSymbolicLink()) {
      try {
        const st = await stat(full);
        isDir = st.isDirectory();
        isFile = st.isFile();
      } catch {
        continue; // broken link: skip
      }
    }
    if (isDir) {
      await addDirSkill(full, ent.name, ent.isSymbolicLink(), into);
    } else if (isFile && ent.name.endsWith('.md')) {
      await addFileSkill(full, ent.name, ent.isSymbolicLink(), into);
    }
  }
}

async function addDirSkill(dir: string, dirName: string, linked: boolean, into: Map<string, MergeEntry>): Promise<void> {
  const file = join(dir, 'SKILL.md');
  const content = await readMaybe(file);
  if (content === undefined) return; // no SKILL.md or unreadable
  const fm = parseFrontmatter(content);
  addSkill(into, {
    name: parseName(fm, dirName),
    description: fm.description ?? '',
    whenToUse: fm.whenToUse,
    fm,
    path: file,
    linked,
  });
}

async function addFileSkill(file: string, fileName: string, linked: boolean, into: Map<string, MergeEntry>): Promise<void> {
  const content = await readMaybe(file);
  if (content === undefined) return;
  const fm = parseFrontmatter(content);
  const baseName = fileName.replace(/\.md$/, '');
  addSkill(into, {
    name: parseName(fm, baseName),
    description: fm.description ?? '',
    whenToUse: fm.whenToUse,
    fm,
    path: file,
    linked,
  });
}

function parseName(fm: ParsedFrontmatter, pathName: string): string | undefined {
  const name = fm.name ?? pathName;
  return NAME_RE.test(name) ? name : undefined;
}

interface FsSkillInput {
  name: string | undefined;
  description: string;
  whenToUse?: string;
  fm: ParsedFrontmatter;
  path: string;
  linked: boolean;
}

/** Add a filesystem skill; on a name conflict the filesystem entry wins and
 *  the registry fills metadata (whenToUse, invocation) the frontmatter did not
 *  explicitly declare. */
function addSkill(into: Map<string, MergeEntry>, input: FsSkillInput): void {
  if (input.name === undefined) return; // violates kebab-case grammar
  const existing = into.get(input.name);
  const entry: MergeEntry = {
    name: input.name,
    description: input.description,
    whenToUse: input.whenToUse,
    provider: 'user-dsh',
    level: 'user-dsh',
    path: input.path,
    linked: input.linked,
    modelInvocable: input.fm.disableModelInvocation !== true,
    userInvocable: input.fm.userInvocable !== false,
  };
  if (existing) {
    if (entry.whenToUse === undefined) entry.whenToUse = existing.whenToUse;
    const inv = existing.regInvocation;
    if (inv) {
      if (input.fm.disableModelInvocation === undefined && inv.modelInvocable !== undefined) {
        entry.modelInvocable = inv.modelInvocable;
      }
      if (input.fm.userInvocable === undefined && inv.userInvocable !== undefined) {
        entry.userInvocable = inv.userInvocable;
      }
    }
  }
  into.set(input.name, entry);
}

async function readMaybe(file: string): Promise<string | undefined> {
  try {
    return await readFile(file, 'utf8');
  } catch {
    return undefined;
  }
}
