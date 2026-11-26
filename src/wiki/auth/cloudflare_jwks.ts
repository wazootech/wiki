/** Cloudflare Access signing keys behind a short-lived cache. */

const CACHE_TTL_MS = 10 * 60 * 1000;
/** Floor between forced refreshes, so forged `kid`s cannot flood the endpoint. */
const REFRESH_COOLDOWN_MS = 30 * 1000;

/** Deno's `JsonWebKey` lib type omits `kid`, which Access JWKS entries carry. */
export interface AccessJwk extends JsonWebKey {
  readonly kid: string;
}

interface CacheEntry {
  readonly keys: AccessJwk[];
  readonly expiresAt: number;
}

const cache = new Map<string, CacheEntry>();
const forcedAt = new Map<string, number>();
const pending = new Map<string, Promise<AccessJwk[]>>();

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isJwk(value: unknown): value is AccessJwk {
  return isRecord(value) && value.kty === "RSA" &&
    typeof value.kid === "string" && typeof value.n === "string" &&
    typeof value.e === "string";
}

async function download(jwksUrl: string): Promise<AccessJwk[]> {
  const response = await fetch(jwksUrl);
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`JWKS fetch failed: ${response.status}`);
  }
  const body: unknown = await response.json();
  if (!isRecord(body) || !Array.isArray(body.keys)) {
    throw new Error("Invalid JWKS document");
  }
  const keys = body.keys.filter(isJwk);
  cache.set(jwksUrl, { keys, expiresAt: Date.now() + CACHE_TTL_MS });
  return keys;
}

/** Concurrent callers share one in-flight download. */
function refresh(jwksUrl: string): Promise<AccessJwk[]> {
  let request = pending.get(jwksUrl);
  if (request === undefined) {
    request = download(jwksUrl).finally(() => pending.delete(jwksUrl));
    pending.set(jwksUrl, request);
  }
  return request;
}

/** Find a signing key, refreshing early when a rotated `kid` is not cached. */
export async function findAccessKey(
  jwksUrl: string,
  kid: string,
): Promise<AccessJwk | undefined> {
  const matches = (key: AccessJwk) => key.kid === kid;
  const cached = cache.get(jwksUrl);
  if (cached === undefined || cached.expiresAt <= Date.now()) {
    return (await refresh(jwksUrl)).find(matches);
  }
  const key = cached.keys.find(matches);
  if (key !== undefined) return key;
  if (!pending.has(jwksUrl)) {
    const last = forcedAt.get(jwksUrl) ?? 0;
    if (Date.now() - last < REFRESH_COOLDOWN_MS) return undefined;
    forcedAt.set(jwksUrl, Date.now());
  }
  return (await refresh(jwksUrl)).find(matches);
}
