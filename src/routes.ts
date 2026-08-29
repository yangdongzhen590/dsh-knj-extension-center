// Host REST route family for the skill center, over the loopback trust fence.
// Port of the skill-explorer plugin's src/routes.ts, adapted to the
// skill-center contract: only ~/.dsh/skills is managed, install arrives as
// base64 zip (with conflict detection + overwrite via trash), and the trash
// routes expose the recoverable-uninstall cycle.

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Context } from '@deepseek-ai/cordis';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { collectSkills, type SkillEntry, type SkillLevel, type SkillRegistry } from './collect';
import { installZip, parseZipMetadata, ZipInstallError } from './zip-install';
import { listTrash, purgeTrashItem, restoreTrashItem, trashSkillDir, type TrashItem } from './trash';
import { setFrontmatterField, splitFrontmatter } from './frontmatter';
import { isLoopbackRequest } from './loopback';
import { readJsonBody, writeJson } from './http';

/** Route paths (the client bundle mirrors these literals; tests assert both sides). */
export const ROUTES = {
  list: '/api/dsh-skill-center/list',
  install: '/api/dsh-skill-center/install',
  setEnabled: '/api/dsh-skill-center/set-enabled',
  uninstall: '/api/dsh-skill-center/uninstall',
  trashList: '/api/dsh-skill-center/trash/list',
  trashRestore: '/api/dsh-skill-center/trash/restore',
  trashPurge: '/api/dsh-skill-center/trash/purge',
  detail: '/api/dsh-skill-center/detail',
  health: '/api/dsh-skill-center/health',
} as const;

/** One exact-path route registration for ctx.webServer.register. */
export interface Route {
  kind: 'exact';
  path: string;
  handler(req: IncomingMessage, res: ServerResponse): void | Promise<void>;
}

/** Route family dependencies (tests inject fakes). */
export interface SkillCenterRoutesDeps {
  /** User dsh config root (~/.dsh). */
  dshHome: string;
  /** ctx.skills registry (snapshot). */
  registry: SkillRegistry;
  /** Active session cwd list (degraded to [] when sessions throw). */
  activeSessionCwds(): string[];
  /** Logger. */
  logger: { warn(error: unknown): void };
}

/** Skill name pattern shared by the routes (kebab-case). */
const NAME_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
/** Default process cwd fallback. */
const DEFAULT_CWD = () => process.cwd();
/** JSON body cap for mutation routes with small payloads. */
const SMALL_BODY_MAX_BYTES = 128 * 1024;
/** JSON body cap for install: base64 of an 8 MB zip ≈ 10.7 MB, so 16 MB fits it. */
const INSTALL_BODY_MAX_BYTES = 16 * 1024 * 1024;

/** Display grouping for the three levels this plugin collects. */
const LEVEL_GROUPS: ReadonlyArray<{ key: SkillLevel; title: string; hint: string }> = [
  { key: 'bundled', title: 'System bundled', hint: 'Global skills shipped with DSH and its plugins' },
  { key: 'user-dsh', title: 'User skills (~/.dsh/skills)', hint: 'Global skills shared by all projects on this machine' },
  { key: 'runtime', title: 'Runtime registered', hint: 'Skills registered at runtime by plugins' },
];

/** URL query helper (first value, decoded). */
function queryParam(url: URL, name: string): string | undefined {
  const value = url.searchParams.get(name);
  return value === null ? undefined : value;
}

/**
 * Build every /api/dsh-skill-center route (exact paths).
 * @param ctx - host plugin context (reserved; the fence is loopback-only).
 * @param deps - dshHome/registry/sessions/logger.
 * @returns the route list for ctx.webServer.register.
 */
export function makeRoutes(ctx: Context, deps: SkillCenterRoutesDeps): Route[] {
  const { dshHome, registry, activeSessionCwds, logger } = deps;
  /** Guard helper: fence + method check. */
  const guard = (req: IncomingMessage, res: ServerResponse, method: string): boolean => {
    if (!isLoopbackRequest(req)) {
      writeJson(res, 403, { error: 'forbidden: loopback-only' });
      return false;
    }
    if (req.method !== method) {
      writeJson(res, 405, { error: `method not allowed: ${req.method}` });
      return false;
    }
    return true;
  };
  /** Active session cwd list (degraded to [] when sessions throw). */
  const safeSessionCwds = (): string[] => {
    try {
      return activeSessionCwds();
    } catch {
      return [];
    }
  };
  /** Collect options shared by the handlers (the subset collectSkills needs). */
  const collectOptions = (cwd: string) => ({ cwd, dshHome, registry });
  /** Find a skill by name from a fresh collection pass (trusts scanned paths only). */
  const findSkill = async (name: string, cwd: string): Promise<SkillEntry | undefined> => {
    const { skills } = await collectSkills(collectOptions(cwd));
    return skills.find((candidate) => candidate.name === name);
  };
  /** Resolve the exact editable file shown by the client, rejecting stale same-name fallbacks. */
  const resolveMutationSkill = async (
    name: string,
    expectedPath: string,
    cwd: string,
    res: ServerResponse,
  ): Promise<(SkillEntry & { path: string }) | undefined> => {
    const skill = await findSkill(name, cwd);
    if (skill === undefined || skill.path === undefined) {
      writeJson(res, 404, { error: `skill ${name} has no editable file` });
      return undefined;
    }
    const path: string = skill.path;
    if (path !== expectedPath) {
      writeJson(res, 409, { error: `skill ${name} changed since the panel loaded; refresh and retry` });
      return undefined;
    }
    return { ...skill, path };
  };
  /** Resolve a trash item by its absolute trash path (404 when unknown). */
  const findTrashItem = async (trashPath: string): Promise<TrashItem | undefined> => {
    const items = await listTrash(join(dshHome, 'skills'));
    return items.find((item) => item.trashPath === trashPath);
  };
  return [
    {
      kind: 'exact',
      path: ROUTES.list,
      handler: async (req, res) => {
        if (!guard(req, res, 'GET')) return;
        try {
          const url = new URL(req.url ?? '/', 'http://x');
          const cwd = queryParam(url, 'cwd') ?? safeSessionCwds()[0] ?? DEFAULT_CWD();
          const q = queryParam(url, 'q');
          const level = queryParam(url, 'level');
          const { skills, complete } = await collectSkills(collectOptions(cwd));
          let filtered = skills;
          if (level !== undefined) filtered = filtered.filter((skill) => skill.level === level);
          if (q !== undefined && q !== '') {
            const needle = q.toLowerCase();
            filtered = filtered.filter(
              (skill) => skill.name.toLowerCase().includes(needle) || skill.description.toLowerCase().includes(needle),
            );
          }
          const groups = LEVEL_GROUPS.map((group) => ({
            key: group.key,
            title: group.title,
            hint: group.hint,
            skills: filtered
              .filter((skill) => skill.level === group.key)
              .sort((a, b) => a.name.localeCompare(b.name)),
          })).filter((group) => group.skills.length > 0);
          writeJson(res, 200, { cwd, groups, complete });
        } catch (error) {
          logger.warn(error);
          writeJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
        }
      },
    },
    {
      kind: 'exact',
      path: ROUTES.install,
      handler: async (req, res) => {
        if (!guard(req, res, 'POST')) return;
        try {
          const body = await readJsonBody(req, { maxBytes: INSTALL_BODY_MAX_BYTES, objectOnly: true });
          if (body === null) {
            writeJson(res, 400, { error: 'invalid JSON body' });
            return;
          }
          const { zipBase64, cwd, overwrite } = body as { zipBase64?: unknown; cwd?: unknown; overwrite?: unknown };
          if (typeof zipBase64 !== 'string' || zipBase64 === '') {
            writeJson(res, 400, { error: 'expected { zipBase64, cwd }' });
            return;
          }
          const skillsRoot = join(dshHome, 'skills');
          const zipBuffer = Buffer.from(zipBase64, 'base64');
          const meta = await parseZipMetadata(zipBuffer); // throws ZipInstallError → 400
          const target = join(skillsRoot, meta.name);
          if (existsSync(target)) {
            if (overwrite !== true) {
              const existing = await findSkill(meta.name, typeof cwd === 'string' && cwd !== '' ? cwd : DEFAULT_CWD());
              writeJson(res, 200, { conflict: true, existing: existing ?? { name: meta.name } });
              return;
            }
            await trashSkillDir(target);
          }
          const { name, targetDir } = await installZip({ zipBuffer, baseDir: skillsRoot });
          writeJson(res, 200, { ok: true, name, path: join(targetDir, 'SKILL.md') });
        } catch (error) {
          if (error instanceof ZipInstallError) {
            writeJson(res, 400, { error: error.message, code: error.code });
            return;
          }
          logger.warn(error);
          writeJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
        }
      },
    },
    {
      kind: 'exact',
      path: ROUTES.setEnabled,
      handler: async (req, res) => {
        if (!guard(req, res, 'POST')) return;
        try {
          const body = await readJsonBody(req, { maxBytes: SMALL_BODY_MAX_BYTES, objectOnly: true });
          if (body === null) {
            writeJson(res, 400, { error: 'invalid JSON body' });
            return;
          }
          const { name, path, enabled } = body as { name?: unknown; path?: unknown; enabled?: unknown };
          if (
            typeof name !== 'string' ||
            !NAME_PATTERN.test(name) ||
            typeof path !== 'string' ||
            path.trim() === '' ||
            typeof enabled !== 'boolean'
          ) {
            writeJson(res, 400, { error: 'expected { name, path, enabled }' });
            return;
          }
          const skill = await resolveMutationSkill(name, path, DEFAULT_CWD(), res);
          if (skill === undefined) return;
          const frontmatter = setFrontmatterField(skill.path, 'disable-model-invocation', !enabled);
          writeJson(res, 200, {
            name,
            enabled: frontmatter.disableModelInvocation !== true,
            modelInvocable: frontmatter.disableModelInvocation !== true,
            path: skill.path,
          });
        } catch (error) {
          logger.warn(error);
          writeJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
        }
      },
    },
    {
      kind: 'exact',
      path: ROUTES.uninstall,
      handler: async (req, res) => {
        if (!guard(req, res, 'POST')) return;
        try {
          const body = await readJsonBody(req, { maxBytes: SMALL_BODY_MAX_BYTES, objectOnly: true });
          if (body === null) {
            writeJson(res, 400, { error: 'invalid JSON body' });
            return;
          }
          const { name, path } = body as { name?: unknown; path?: unknown };
          if (typeof name !== 'string' || !NAME_PATTERN.test(name) || typeof path !== 'string' || path.trim() === '') {
            writeJson(res, 400, { error: 'expected { name, path }' });
            return;
          }
          const skill = await resolveMutationSkill(name, path, DEFAULT_CWD(), res);
          if (skill === undefined) return;
          if (skill.linked === true) {
            writeJson(res, 400, { error: `skill ${name} is a linked skill and cannot be uninstalled` });
            return;
          }
          // Directory skills are `<dir>/SKILL.md`; trash the whole directory.
          // Single-file skills are `<name>.md`; trash just the file so the
          // skills root itself is never moved.
          const targetDir = path.endsWith('SKILL.md') ? dirname(path) : path;
          const trashPath = await trashSkillDir(targetDir);
          writeJson(res, 200, { ok: true, name, trashPath });
        } catch (error) {
          logger.warn(error);
          writeJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
        }
      },
    },
    {
      kind: 'exact',
      path: ROUTES.trashList,
      handler: async (req, res) => {
        if (!guard(req, res, 'GET')) return;
        try {
          const items = await listTrash(join(dshHome, 'skills'));
          writeJson(res, 200, { items });
        } catch (error) {
          logger.warn(error);
          writeJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
        }
      },
    },
    {
      kind: 'exact',
      path: ROUTES.trashRestore,
      handler: async (req, res) => {
        if (!guard(req, res, 'POST')) return;
        try {
          const body = await readJsonBody(req, { maxBytes: SMALL_BODY_MAX_BYTES, objectOnly: true });
          if (body === null) {
            writeJson(res, 400, { error: 'invalid JSON body' });
            return;
          }
          const { trashPath } = body as { trashPath?: unknown };
          if (typeof trashPath !== 'string' || trashPath.trim() === '') {
            writeJson(res, 400, { error: 'expected { trashPath }' });
            return;
          }
          const item = await findTrashItem(trashPath);
          if (item === undefined) {
            writeJson(res, 404, { error: 'trash item not found' });
            return;
          }
          try {
            const originalPath = await restoreTrashItem(item);
            writeJson(res, 200, { ok: true, path: originalPath });
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (/occupied/i.test(message)) {
              writeJson(res, 409, { error: message });
              return;
            }
            writeJson(res, 400, { error: message });
          }
        } catch (error) {
          logger.warn(error);
          writeJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
        }
      },
    },
    {
      kind: 'exact',
      path: ROUTES.trashPurge,
      handler: async (req, res) => {
        if (!guard(req, res, 'POST')) return;
        try {
          const body = await readJsonBody(req, { maxBytes: SMALL_BODY_MAX_BYTES, objectOnly: true });
          if (body === null) {
            writeJson(res, 400, { error: 'invalid JSON body' });
            return;
          }
          const { trashPath } = body as { trashPath?: unknown };
          if (typeof trashPath !== 'string' || trashPath.trim() === '') {
            writeJson(res, 400, { error: 'expected { trashPath }' });
            return;
          }
          const item = await findTrashItem(trashPath);
          if (item === undefined) {
            writeJson(res, 404, { error: 'trash item not found' });
            return;
          }
          await purgeTrashItem(item);
          writeJson(res, 200, { ok: true });
        } catch (error) {
          logger.warn(error);
          writeJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
        }
      },
    },
    {
      kind: 'exact',
      path: ROUTES.detail,
      handler: async (req, res) => {
        if (!guard(req, res, 'GET')) return;
        try {
          const url = new URL(req.url ?? '/', 'http://x');
          const name = queryParam(url, 'name');
          if (name === undefined || name === '') {
            writeJson(res, 400, { error: 'name query parameter is required' });
            return;
          }
          const cwd = queryParam(url, 'cwd') ?? safeSessionCwds()[0] ?? DEFAULT_CWD();
          const skill = await findSkill(name, cwd);
          if (skill?.path === undefined) {
            writeJson(res, 404, { error: `skill ${name} not found` });
            return;
          }
          const content = readFileSync(skill.path, 'utf8');
          const split = splitFrontmatter(content);
          writeJson(res, 200, {
            name,
            frontmatter: split?.frontmatter ?? '',
            body: split?.body ?? content,
          });
        } catch (error) {
          logger.warn(error);
          writeJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
        }
      },
    },
    {
      kind: 'exact',
      path: ROUTES.health,
      handler: async (req, res) => {
        if (!guard(req, res, 'GET')) return;
        try {
          const { skills } = await collectSkills(collectOptions(DEFAULT_CWD()));
          writeJson(res, 200, { ok: true, plugin: 'skill-center', skills: skills.length });
        } catch (error) {
          logger.warn(error);
          writeJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
        }
      },
    },
  ];
}
