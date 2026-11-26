/** Cloudflare Access JWT verification against a short-lived JWKS cache. */

import type { AuthIdentity } from "./types.ts";

const CACHE_TTL_MS = 10 * 60 * 1000;

/** Deno's `JsonWebKey` lib type omits `kid`, which Access JWKS entries carry. */
export interface AccessJwk extends JsonWebKey {
  readonly kid: string;
}

interface CacheEntry {
  keys: AccessJwk[];
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isJwk(value: unknown): value is AccessJwk {
  return isRecord(value) && value.kty === "RSA" &&
    typeof value.kid === "string" && typeof value.n === "string" &&
    typeof value.e === "string";
}

function decodePart(part: string): Uint8Array<ArrayBuffer> {
  const normalized = part.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes: Uint8Array<ArrayBuffer> = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function parsePart(part: string): unknown {
  return JSON.parse(new TextDecoder().decode(decodePart(part)));
}

async function loadKeys(jwksUrl: string): Promise<AccessJwk[]> {
  const cached = cache.get(jwksUrl);
  if (cached !== undefined && cached.expiresAt > Date.now()) {
    return cached.keys;
  }
  const response = await fetch(jwksUrl);
  if (!response.ok) throw new Error(`JWKS fetch failed: ${response.status}`);
  const body: unknown = await response.json();
  if (!isRecord(body) || !Array.isArray(body.keys)) {
    throw new Error("Invalid JWKS document");
  }
  const keys = body.keys.filter(isJwk);
  cache.set(jwksUrl, { keys, expiresAt: Date.now() + CACHE_TTL_MS });
  return keys;
}

/** Verify an Access assertion and turn its claims into a wiki identity. */
export async function verifyAccessJwt(
  assertion: string,
  audience: string,
  jwksUrl: string,
): Promise<AuthIdentity | null> {
  try {
    const parts = assertion.split(".");
    if (parts.length !== 3) return null;
    const [headerPart, payloadPart, signaturePart] = parts;
    if (
      headerPart === undefined || payloadPart === undefined ||
      signaturePart === undefined
    ) return null;

    const header = parsePart(headerPart);
    const payload = parsePart(payloadPart);
    if (
      !isRecord(header) || header.alg !== "RS256" ||
      typeof header.kid !== "string"
    ) return null;
    const kid = header.kid;
    if (!isRecord(payload)) return null;
    if (
      !Array.isArray(payload.aud) || !payload.aud.includes(audience)
    ) return null;
    if (
      typeof payload.exp !== "number" || payload.exp <= Date.now() / 1000
    ) return null;

    const id = typeof payload.email === "string"
      ? payload.email
      : typeof payload.sub === "string"
      ? payload.sub
      : null;
    if (id === null) return null;

    const jwk = (await loadKeys(jwksUrl)).find((key) => key.kid === kid);
    if (jwk === undefined) return null;
    const key = await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const signed = new TextEncoder().encode(`${headerPart}.${payloadPart}`);
    const valid = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      key,
      decodePart(signaturePart),
      signed,
    );
    if (!valid) return null;

    const name = typeof payload.name === "string" ? payload.name : undefined;
    return name === undefined ? { id } : { id, name };
  } catch {
    return null;
  }
}
