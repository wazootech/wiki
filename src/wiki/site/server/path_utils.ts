import { isAbsolute, relative } from "@std/path";
import type { NormalizedBaseUrl } from "./types.ts";

function decodePathSegments(pathname: string): string[] | null {
  if (!pathname.startsWith("/")) return null;
  const rawSegments = pathname.slice(1).split("/");
  if (rawSegments.at(-1) === "") rawSegments.pop();
  if (rawSegments.some((segment) => segment === "")) return null;

  const segments: string[] = [];
  try {
    for (const rawSegment of rawSegments) {
      const segment = decodeURIComponent(rawSegment);
      const hasControlCharacter = [...segment].some((character) => {
        const code = character.charCodeAt(0);
        return code <= 0x1f || code === 0x7f;
      });
      if (
        segment === "" || segment === "." || segment === ".." ||
        segment.includes("/") || segment.includes("\\") ||
        segment.includes(":") || hasControlCharacter
      ) return null;
      segments.push(segment);
    }
  } catch {
    return null;
  }
  return segments;
}

export function normalizeBaseUrl(baseUrl: string): NormalizedBaseUrl {
  if (baseUrl === "") return { segments: [], pathname: "" };
  if (
    !baseUrl.startsWith("/") || baseUrl.startsWith("//") ||
    baseUrl.includes("?") || baseUrl.includes("#")
  ) {
    throw new TypeError(`Invalid baseUrl: ${baseUrl}`);
  }
  const segments = decodePathSegments(baseUrl.replace(/\/+$/, "") || "/");
  if (segments === null) throw new TypeError(`Invalid baseUrl: ${baseUrl}`);
  return {
    segments,
    pathname: segments.length === 0
      ? ""
      : `/${segments.map((segment) => encodeURIComponent(segment)).join("/")}`,
  };
}

export function relativeSegments(
  pathname: string,
  base: NormalizedBaseUrl,
): string[] | null {
  const segments = decodePathSegments(pathname);
  if (segments === null || segments.length < base.segments.length) return null;
  for (let index = 0; index < base.segments.length; index++) {
    if (segments[index] !== base.segments[index]) return null;
  }
  return segments.slice(base.segments.length);
}

export function isWithinRoot(root: string, filePath: string): boolean {
  const pathFromRoot = relative(root, filePath);
  if (pathFromRoot === "" || isAbsolute(pathFromRoot)) {
    return pathFromRoot === "";
  }
  const firstSegment = pathFromRoot.split(/[\\/]/, 1)[0];
  return firstSegment !== "..";
}
