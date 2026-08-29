// Client-side fetch wrapper for the skill-center host REST API.
// Same-origin JSON over the loopback trust fence; every non-2xx response
// becomes an ApiError carrying the host's { error } message. Route literals
// mirror src/routes.ts ROUTES verbatim — the client bundle must not import
// host code (it pulls in node builtins), so the paths are duplicated here.

export type SkillLevel = 'bundled' | 'user-dsh' | 'runtime';

export interface SkillItem {
  name: string;
  description: string;
  whenToUse?: string;
  provider?: string;
  level: SkillLevel;
  path?: string;
  linked: boolean;
  modelInvocable: boolean;
  userInvocable: boolean;
}

export interface Group {
  key: SkillLevel;
  title: string;
  hint: string;
  skills: SkillItem[];
}

export interface ListPayload {
  cwd: string;
  groups: Group[];
  complete: boolean;
}

/**
 * Raw detail payload. The host sends only `{ name, frontmatter, body }` — the
 * frontmatter is the raw text including the `---` fences and body is verbatim,
 * NOT parsed fields. The metadata fields (description/level/…) are filled by
 * the caller merging the list entry, so they stay optional here.
 */
export interface DetailPayload {
  name: string;
  description?: string;
  whenToUse?: string;
  level?: SkillLevel;
  path?: string;
  linked?: boolean;
  modelInvocable?: boolean;
  userInvocable?: boolean;
  frontmatter: string;
  body: string;
}

export interface TrashItem {
  name: string;
  trashPath: string;
  originalPath: string;
  deletedAt: string;
  legacy: boolean;
}

export interface TrashPayload {
  items: TrashItem[];
}

export interface InstallOk {
  ok: true;
  name: string;
  path: string;
}

export interface InstallConflict {
  conflict: true;
  existing?: { name: string; description?: string; level?: SkillLevel; path?: string };
}

export type InstallResult = InstallOk | InstallConflict;

/** Route literals mirrored from src/routes.ts ROUTES (client-side copy). */
const PATHS = {
  list: '/api/dsh-skill-center/list',
  install: '/api/dsh-skill-center/install',
  setEnabled: '/api/dsh-skill-center/set-enabled',
  uninstall: '/api/dsh-skill-center/uninstall',
  trashList: '/api/dsh-skill-center/trash/list',
  trashRestore: '/api/dsh-skill-center/trash/restore',
  trashPurge: '/api/dsh-skill-center/trash/purge',
  detail: '/api/dsh-skill-center/detail',
} as const;

/** Non-2xx responses become this; `message` is the host's `{ error }` text. */
export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/** Base64-encode bytes in bounded chunks (avoids call-stack limits). */
function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  return bytesToBase64(new Uint8Array(buffer));
}

/**
 * Same-origin fetch wrapper for the skill-center REST API.
 * Every method throws ApiError on a non-2xx response.
 */
export class SkillApi {
  /** Serialize query params; undefined/empty values are omitted. */
  private static queryString(params: Record<string, string | undefined>): string {
    const sp = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== '') sp.set(key, value);
    }
    const qs = sp.toString();
    return qs === '' ? '' : `?${qs}`;
  }

  private async getJson<T>(url: string): Promise<T> {
    return this.decode<T>(await fetch(url));
  }

  private async postJson<T>(url: string, body: unknown): Promise<T> {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    return this.decode<T>(res);
  }

  private async decode<T>(res: Response): Promise<T> {
    const status = typeof res.status === 'number' ? res.status : 0;
    if (!res.ok) {
      let message = `skill-center request failed (${status})`;
      try {
        const data = (await res.json()) as { error?: unknown };
        if (typeof data.error === 'string' && data.error !== '') message = data.error;
      } catch {
        // non-JSON error body: keep the status fallback
      }
      throw new ApiError(message, status);
    }
    return (await res.json()) as T;
  }

  /** List skills grouped by level; the host drops empty groups (0-3 groups). */
  list(opts?: { q?: string; level?: string }): Promise<ListPayload> {
    return this.getJson<ListPayload>(PATHS.list + SkillApi.queryString({ q: opts?.q, level: opts?.level }));
  }

  /** Raw skill detail; frontmatter and body arrive verbatim (not parsed). */
  detail(name: string): Promise<DetailPayload> {
    return this.getJson<DetailPayload>(PATHS.detail + SkillApi.queryString({ name }));
  }

  /** Toggle model invocation for a user skill (writes disable-model-invocation). */
  async setEnabled(name: string, path: string, enabled: boolean): Promise<void> {
    await this.postJson<unknown>(PATHS.setEnabled, { name, path, enabled });
  }

  /** Uninstall a skill into the recoverable trash. */
  async uninstall(name: string, path: string): Promise<void> {
    await this.postJson<unknown>(PATHS.uninstall, { name, path });
  }

  /**
   * Install a skill from a zip File (base64 in the POST body). `cwd` selects
   * the workspace currently shown to the user; '' lets the host fall back to
   * the active session. The host may answer `{ conflict: true, existing }`
   * instead of a success payload — the caller decides overwrite vs cancel.
   */
  async install(zip: File, overwrite: boolean, cwd = ''): Promise<InstallResult> {
    const zipBase64 = await fileToBase64(zip);
    return this.postJson<InstallResult>(PATHS.install, { zipBase64, overwrite, cwd });
  }

  /** List recoverable trash entries. */
  trashList(): Promise<TrashPayload> {
    return this.getJson<TrashPayload>(PATHS.trashList);
  }

  /** Restore a trash entry back to the skills root. */
  async trashRestore(trashPath: string): Promise<void> {
    await this.postJson<unknown>(PATHS.trashRestore, { trashPath });
  }

  /** Permanently delete a trash entry. */
  async trashPurge(trashPath: string): Promise<void> {
    await this.postJson<unknown>(PATHS.trashPurge, { trashPath });
  }
}
