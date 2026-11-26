/** Cloudflare Access JWT verification. */

import { findAccessKey, isRecord } from "./cloudflare_jwks.ts";
import type { AuthIdentity } from "./types.ts";

/** Clock skew tolerated on `nbf`, which Access sets to the issue time. */
const NOT_BEFORE_LEEWAY_SECONDS = 60;

export interface AccessExpectations {
  /** The Access application's AUD tag. */
  readonly audience: string;
  /** `https://<team>.cloudflareaccess.com` */
  readonly issuer: string;
  readonly jwksUrl: string;
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

function hasValidClaims(
  payload: Record<string, unknown>,
  expected: AccessExpectations,
): boolean {
  const now = Date.now() / 1000;
  const { iss, aud, exp, nbf } = payload;
  if (iss !== expected.issuer) return false;
  if (!Array.isArray(aud) || !aud.includes(expected.audience)) return false;
  if (typeof exp !== "number" || exp <= now) return false;
  // Service-token assertions may omit `nbf`.
  return nbf === undefined ||
    (typeof nbf === "number" && nbf <= now + NOT_BEFORE_LEEWAY_SECONDS);
}

/** Service tokens carry an empty `sub` and name themselves in `common_name`. */
function identityFrom(payload: Record<string, unknown>): AuthIdentity | null {
  const id = [payload.email, payload.sub, payload.common_name].find(
    (value): value is string => typeof value === "string" && value !== "",
  );
  if (id === undefined) return null;
  const name = typeof payload.name === "string" ? payload.name : undefined;
  return name === undefined ? { id } : { id, name };
}

/** Verify an Access assertion and turn its claims into a wiki identity. */
export async function verifyAccessJwt(
  assertion: string,
  expected: AccessExpectations,
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
    if (!isRecord(payload) || !hasValidClaims(payload, expected)) return null;

    const jwk = await findAccessKey(expected.jwksUrl, kid);
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
    return valid ? identityFrom(payload) : null;
  } catch {
    return null;
  }
}
