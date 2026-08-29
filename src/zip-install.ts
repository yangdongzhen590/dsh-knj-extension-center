// Zip-based skill package install with zip-slip protection.
// Package layout: a single-dir skill `<name>/SKILL.md` (plus optional
// reference files such as references/*). All entries are validated (path
// safety, layout, frontmatter, size/file limits) before anything is written;
// an extraction failure removes the target dir so nothing is left on disk.

import { mkdirSync, renameSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import yauzl from 'yauzl';
import { parseFrontmatter } from './frontmatter';

const DEFAULT_MAX_ZIP_BYTES = 8 * 1024 * 1024; // 8 MB
const DEFAULT_MAX_TOTAL_BYTES = 16 * 1024 * 1024; // 16 MB
const DEFAULT_MAX_FILES = 200;

/** Public skill-name grammar (kebab-case), matching the collect scan. */
const NAME_RE = /^[a-z0-9][a-z0-9-]*$/;

/** Install/validation failure with a machine-readable `code` and a human reason. */
export class ZipInstallError extends Error {
  readonly code: string;

  constructor(code: string, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'ZipInstallError';
    this.code = code;
  }
}

export interface ZipMetadata {
  name: string;
  description: string;
  whenToUse?: string;
  fileCount: number;
  entries: string[];
}

export interface InstallZipOptions {
  zipBuffer: Buffer;
  /** User skills root (`~/.dsh/skills`); the package extracts to `join(baseDir, name)`. */
  baseDir: string;
  maxZipBytes?: number;
  maxTotalBytes?: number;
  maxFiles?: number;
}

/** One validated zip file entry, fully read into memory. */
interface ZipEntryData {
  fileName: string;
  uncompressedSize: number;
  content: Buffer;
}

interface ValidatedZip {
  skillName: string;
  skillContent: string;
  entries: ZipEntryData[];
}

/** Re-wrap a raw error as ZipInstallError unless it already is one. */
function toZipError(err: unknown): ZipInstallError {
  if (err instanceof ZipInstallError) return err;
  return new ZipInstallError('zip', err instanceof Error ? err.message : String(err), { cause: err });
}

/**
 * Structural path-safety check. Rejects absolute paths (leading `/`, `\\`,
 * drive letters), `..` segments, backslashes (a Windows separator that could
 * traverse on win32) and empty-segment anomalies. A single trailing slash is
 * allowed: it is the standard zip way to mark a directory entry.
 */
function assertSafeEntryPath(entryPath: string): void {
  if (/^[A-Za-z]:/.test(entryPath)) {
    throw new ZipInstallError('path', `invalid zip entry path: absolute drive path '${entryPath}'`);
  }
  if (entryPath.startsWith('/') || entryPath.startsWith('\\')) {
    throw new ZipInstallError('path', `invalid zip entry path: absolute path '${entryPath}'`);
  }
  if (entryPath.includes('\\')) {
    throw new ZipInstallError('path', `invalid zip entry path: backslash '${entryPath}'`);
  }
  const segments = entryPath.split('/');
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (seg === '..') {
      throw new ZipInstallError('path', `invalid zip entry path: '..' segment in '${entryPath}'`);
    }
    if (seg === '' && i !== segments.length - 1) {
      throw new ZipInstallError('path', `invalid zip entry path: empty segment in '${entryPath}'`);
    }
  }
}

/** Collect one entry's decompressed bytes via yauzl's read stream. */
function readEntryContent(zipfile: yauzl.ZipFile, entry: yauzl.Entry): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    zipfile.openReadStream(entry, (err, stream) => {
      if (err) {
        reject(err);
        return;
      }
      const chunks: Buffer[] = [];
      let size = 0;
      stream.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
        size += chunk.length;
      });
      stream.on('end', () => resolve(Buffer.concat(chunks, size)));
      stream.on('error', reject);
    });
  });
}

/**
 * Stream through every zip entry (lazyEntries): structurally validate the
 * path, read the content, and enforce the cumulative unpacked-bytes cap while
 * reading so a lying zip cannot balloon memory. Resolves with file entries
 * only; directory-marker entries (`name/`) are skipped.
 */
function walkZip(zipBuffer: Buffer, maxTotalBytes: number): Promise<ZipEntryData[]> {
  return new Promise((resolve, reject) => {
    let zipfile: yauzl.ZipFile | undefined;
    let done = false;
    const fail = (err: unknown) => {
      if (done) return;
      done = true;
      try {
        zipfile?.close();
      } catch {
        // best effort close; ignore
      }
      reject(toZipError(err));
    };

    yauzl.fromBuffer(zipBuffer, { lazyEntries: true }, (err, zf) => {
      if (err) {
        fail(err);
        return;
      }
      if (!zf) {
        fail(new Error('yauzl returned no zipfile'));
        return;
      }
      zipfile = zf;
      const entries: ZipEntryData[] = [];
      let totalBytes = 0;

      zf.on('error', fail);
      zf.on('end', () => {
        if (done) return;
        done = true;
        try {
          zf.close();
        } catch {
          // best effort close; ignore
        }
        resolve(entries);
      });

      zf.on('entry', (entry: yauzl.Entry) => {
        try {
          const fileName = entry.fileName;
          assertSafeEntryPath(fileName);
          if (fileName.endsWith('/')) {
            // directory marker: nothing to extract, continue the walk
            zf.readEntry();
            return;
          }
          readEntryContent(zf, entry).then(
            (content) => {
              if (done) return;
              totalBytes += content.length;
              if (totalBytes > maxTotalBytes) {
                fail(new ZipInstallError('size', `total unpacked size exceeds ${maxTotalBytes} bytes`));
                return;
              }
              entries.push({ fileName, uncompressedSize: entry.uncompressedSize, content });
              zf.readEntry();
            },
            fail,
          );
        } catch (walkErr) {
          fail(walkErr);
        }
      });

      zf.readEntry();
    });
  });
}

/**
 * Validate a skill zip end to end without writing anything: path safety,
 * single-dir layout, kebab-case name, `<name>/SKILL.md` with matching
 * non-empty frontmatter, and the size/file limits. Returns the parsed package
 * or throws ZipInstallError.
 */
async function validateZip(
  zipBuffer: Buffer,
  limits: { maxZipBytes: number; maxTotalBytes: number; maxFiles: number },
): Promise<ValidatedZip> {
  if (zipBuffer.length > limits.maxZipBytes) {
    throw new ZipInstallError('size', `zip size exceeds ${limits.maxZipBytes} bytes (actual ${zipBuffer.length})`);
  }
  const entries = await walkZip(zipBuffer, limits.maxTotalBytes);

  // Layout: one skill package = one top-level directory; a file at the zip
  // root or multiple top-level directories are invalid.
  const tops = new Set<string>();
  let rootFile: string | undefined;
  for (const e of entries) {
    const idx = e.fileName.indexOf('/');
    if (idx === -1) rootFile = rootFile ?? e.fileName;
    else tops.add(e.fileName.slice(0, idx));
  }
  if (rootFile !== undefined) {
    throw new ZipInstallError('layout', `invalid layout: file at zip root '${rootFile}', expected a single '<name>/' skill directory`);
  }
  if (tops.size !== 1) {
    const got = tops.size === 0 ? '(empty zip)' : [...tops].join(', ');
    throw new ZipInstallError('layout', `invalid layout: expected a single top-level '<name>/' directory, got ${got}`);
  }
  const skillName = [...tops][0];
  if (!NAME_RE.test(skillName)) {
    throw new ZipInstallError('name', `invalid skill name '${skillName}': must be kebab-case (lowercase letters, digits, hyphens)`);
  }

  // Frontmatter: `<name>/SKILL.md` must exist with a matching, non-empty description.
  const skillEntry = entries.find((e) => e.fileName === `${skillName}/SKILL.md`);
  if (!skillEntry) {
    throw new ZipInstallError('skill', `invalid skill package: missing ${skillName}/SKILL.md`);
  }
  const fm = parseFrontmatter(skillEntry.content.toString('utf8'));
  if (fm.name !== skillName) {
    throw new ZipInstallError('name', `frontmatter name '${fm.name ?? ''}' does not match directory '${skillName}'`);
  }
  if (fm.description === undefined || fm.description.trim() === '') {
    throw new ZipInstallError('skill', `skill '${skillName}' has no description in SKILL.md frontmatter`);
  }

  // Limits on declared sizes and entry count (actual bytes were already capped while reading).
  const declaredTotal = entries.reduce((sum, e) => sum + e.uncompressedSize, 0);
  if (declaredTotal > limits.maxTotalBytes) {
    throw new ZipInstallError('size', `total unpacked size exceeds ${limits.maxTotalBytes} bytes (declared ${declaredTotal})`);
  }
  if (entries.length > limits.maxFiles) {
    throw new ZipInstallError('files', `too many files: ${entries.length} exceeds max ${limits.maxFiles}`);
  }

  return { skillName, skillContent: skillEntry.content.toString('utf8'), entries };
}

/** Read-only metadata of a skill zip; validates everything but writes nothing. */
export async function parseZipMetadata(zipBuffer: Buffer): Promise<ZipMetadata> {
  const v = await validateZip(zipBuffer, {
    maxZipBytes: DEFAULT_MAX_ZIP_BYTES,
    maxTotalBytes: DEFAULT_MAX_TOTAL_BYTES,
    maxFiles: DEFAULT_MAX_FILES,
  });
  const fm = parseFrontmatter(v.skillContent);
  return {
    name: v.skillName,
    description: fm.description ?? '',
    whenToUse: fm.whenToUse,
    fileCount: v.entries.length,
    entries: v.entries.map((e) => e.fileName),
  };
}

/**
 * Validate and extract a skill zip into `join(baseDir, name)`. Nothing is
 * written unless every entry passes validation; on an extraction failure the
 * target dir is removed so no partial install remains.
 */
export async function installZip(opts: InstallZipOptions): Promise<{ name: string; targetDir: string }> {
  const { zipBuffer, baseDir } = opts;
  const limits = {
    maxZipBytes: opts.maxZipBytes ?? DEFAULT_MAX_ZIP_BYTES,
    maxTotalBytes: opts.maxTotalBytes ?? DEFAULT_MAX_TOTAL_BYTES,
    maxFiles: opts.maxFiles ?? DEFAULT_MAX_FILES,
  };
  const v = await validateZip(zipBuffer, limits);
  const targetDir = join(baseDir, v.skillName);

  try {
    for (const e of v.entries) {
      const file = join(baseDir, e.fileName);
      mkdirSync(dirname(file), { recursive: true });
      atomicWriteFile(file, e.content);
    }
  } catch (err) {
    rmSync(targetDir, { recursive: true, force: true });
    throw new ZipInstallError(
      'extract',
      `failed to extract skill '${v.skillName}': ${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    );
  }
  return { name: v.skillName, targetDir };
}

/** Write one file via an exclusive tmp file + rename, so it is atomic within its dir. */
function atomicWriteFile(file: string, content: Buffer): void {
  const tmp = join(dirname(file), `.${basename(file)}.${process.pid}.${Date.now()}.tmp`);
  try {
    writeFileSync(tmp, content, { flag: 'wx' });
    renameSync(tmp, file);
  } catch (err) {
    try {
      unlinkSync(tmp);
    } catch {
      // best effort cleanup; ignore
    }
    throw err;
  }
}
