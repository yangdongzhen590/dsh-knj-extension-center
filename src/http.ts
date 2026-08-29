// Bounded JSON body reader + JSON response writer for the host routes.
// Port of the skill-explorer plugin's src/http.ts with the default body cap
// raised to 8 MB per the skill-center contract.

import type { IncomingMessage, ServerResponse } from 'node:http';

/** Default body cap for readJsonBody: 8 MB. */
const DEFAULT_JSON_BODY_MAX_BYTES = 8 * 1024 * 1024;

/** Family-default JSON response headers; callers may append or override. */
const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'referrer-policy': 'no-referrer',
};

export interface ReadJsonBodyOptions {
  /** Body cap in bytes (default 8 MB). */
  maxBytes?: number;
  /** When true, non-JSON-object payloads yield null. */
  objectOnly?: boolean;
}

/**
 * Lenient bounded body reader: parse a request body as JSON, or null on an
 * empty body, invalid JSON, or a body past maxBytes (default 8 MB).
 * Overflow destroys the request instead of draining the remainder (no drain
 * call); callers must not keep reading the request afterwards. With
 * objectOnly, non-JSON-object payloads also yield null.
 */
export async function readJsonBody(req: IncomingMessage, opts: ReadJsonBodyOptions = {}): Promise<unknown> {
  const maxBytes = opts.maxBytes ?? DEFAULT_JSON_BODY_MAX_BYTES;
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = chunk as Buffer;
    size += buffer.length;
    if (size > maxBytes) {
      req.destroy();
      return null;
    }
    chunks.push(buffer);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  if (text === '') return null;
  try {
    const parsed: unknown = JSON.parse(text);
    if (opts.objectOnly && !isJsonObject(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Whether a value is a JSON object: typeof object, not null, not an array. */
export function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Write one JSON response. Default headers are the family defaults
 * (content-type and referrer-policy); caller headers are appended or
 * override them.
 */
export function writeJson(
  res: ServerResponse,
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, { ...JSON_HEADERS, ...headers });
  res.end(payload);
}
