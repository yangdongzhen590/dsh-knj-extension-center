// skill-center — host half. Serves the skill center REST API: the
// /api/dsh-skill-center route family (list/search, install from zip,
// set-enabled, uninstall into trash, trash restore/purge, detail, health)
// over the loopback trust fence. The browser half (./client) renders the
// skill center panel.
//
// Ported from the skill-explorer plugin; everything rides official NPM SDK
// packages — no dsh source changes.

import { homedir } from 'node:os';
import { sep } from 'node:path';
import type { Context } from '@deepseek-ai/cordis';
import { makeRoutes, ROUTES, type Route } from './routes';
import { mountOnce } from './mount-once';
import type { SkillRegistry } from './collect';

/** Stable cordis plugin name. */
export const name = 'skill-center';
/** Services required before the skill center routes can mount. */
export const inject = ['webServer', 'skills', 'sessions'];

/** Plugin config. */
export interface Config {
  /** Master switch for the plugin (routes). */
  enabled?: boolean;
  /** User dsh config root override (defaults to $DSH_HOME or ~/.dsh). */
  dshHome?: string;
}

/** The ctx surface this plugin consumes (services are injected dynamically). */
interface HostSurface {
  webServer: { register(route: Route): () => void };
  skills: SkillRegistry;
  sessions: { list(): Array<{ header?: { cwd?: unknown } }> };
  logger: { warn(error: unknown): void };
  effect(callback: () => void | (() => void), label?: string): void;
}

/**
 * Mount the skill center routes.
 * @param ctx - host plugin context carrying webServer/skills/sessions.
 * @param config - resolved plugin config.
 */
function applyImpl(ctx: Context, config?: Config): void {
  if (config?.enabled === false) return;
  const host = ctx as unknown as HostSurface;
  const dshHome = config?.dshHome ?? process.env.DSH_HOME ?? homedir() + sep + '.dsh';
  /** Active session workspace cwds (degraded to [] when the service is unavailable). */
  const activeSessionCwds = () => {
    try {
      if (typeof host.sessions?.list !== 'function') return [];
      return host.sessions
        .list()
        .map((session) => session.header?.cwd)
        .filter((cwd): cwd is string => typeof cwd === 'string' && cwd !== '');
    } catch {
      return [];
    }
  };
  const routes = makeRoutes(ctx, {
    dshHome,
    registry: host.skills,
    activeSessionCwds,
    logger: { warn: (error: unknown) => host.logger.warn(error) },
  });
  host.effect(() => {
    const disposers = routes.map((route) => host.webServer.register(route));
    return () => {
      for (const dispose of disposers) dispose();
    };
  }, 'skill-center: routes');
}

/**
 * Single-instance guard shared by the plugin family: the aggregate bundle
 * and a standalone install of this package can coexist in one profile, so
 * the second host apply must be a no-op instead of re-registering the same
 * routes and failing the boot.
 */
export const apply = mountOnce('dsh-knj-extension-center', applyImpl);
/** Route paths (re-exported for the client contract check). */
export { ROUTES };
