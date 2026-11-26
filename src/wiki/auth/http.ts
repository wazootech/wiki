/** Small HTTP helpers shared by auth providers. */

import type { AuthContext } from "./types.ts";

export function authPath(context: AuthContext, path: string): string {
  const base = context.baseUrl.replace(/\/+$/, "");
  return `${base}${path}`;
}

export function isAuthPath(
  url: URL,
  context: AuthContext,
  path: string,
): boolean {
  return url.pathname === authPath(context, path);
}

export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (header === null) return null;
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}

export function cookie(name: string, value: string, secure: boolean): string {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function clearCookie(name: string, secure: boolean): string {
  const parts = [`${name}=`, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

/** True for HTTPS, including TLS terminated by a proxy or tunnel. */
export function isSecure(request: Request, url: URL): boolean {
  const forwarded = request.headers.get("x-forwarded-proto");
  // Spoofing this header can only add `Secure` to the sender's own cookie.
  return url.protocol === "https:" ||
    forwarded?.split(",")[0]?.trim().toLowerCase() === "https";
}

export function htmlResponse(
  body: string,
  status = 200,
  headers: HeadersInit = {},
): Response {
  const merged = new Headers(headers);
  merged.set("content-type", "text/html; charset=utf-8");
  merged.set("x-content-type-options", "nosniff");
  return new Response(body, { status, headers: merged });
}

export function redirect(location: string, status = 302): Response {
  return new Response(null, { status, headers: { location } });
}

export function withNoStore(response: Response): Response {
  response.headers.set("cache-control", "private, no-store");
  return response;
}

export function safeNext(value: string | null, baseUrl: string): string {
  const fallback = baseUrl.replace(/\/+$/, "") || "/";
  if (value === null || !value.startsWith("/") || value.startsWith("//")) {
    return fallback;
  }
  // Browsers read `\` as `/` and drop tabs and newlines, forming `//host`.
  if (/[\\\p{Cc}]/u.test(value)) return fallback;
  if (
    fallback !== "/" && value !== fallback && !value.startsWith(`${fallback}/`)
  ) {
    return fallback;
  }
  return value;
}

export function constantTimeEquals(left: string, right: string): boolean {
  const encoder = new TextEncoder();
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) {
    difference |= a[index]! ^ b[index]!;
  }
  return difference === 0;
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character]!;
  });
}
