import { extname, resolve } from "@std/path";
import { MIME_TYPES, type StaticUrlStyle } from "./types.ts";
import { isWithinRoot } from "./path_utils.ts";

function getRegularFile(root: string, candidate: string): string | null {
  try {
    const realCandidate = Deno.realPathSync(candidate);
    if (!isWithinRoot(root, realCandidate)) return null;
    return Deno.statSync(realCandidate).isFile ? realCandidate : null;
  } catch {
    return null;
  }
}

export function findStaticFile(
  root: string,
  segments: readonly string[],
  urlStyle: StaticUrlStyle,
): string | null {
  if (segments.length === 0) {
    return getRegularFile(root, resolve(root, "index.html"));
  }

  const directPath = resolve(root, ...segments);
  const directFile = getRegularFile(root, directPath);
  if (directFile !== null) return directFile;

  if (urlStyle === "dir") {
    return getRegularFile(root, resolve(directPath, "index.html"));
  }

  const lastSegment = segments.at(-1)!;
  if (lastSegment.includes(".")) return null;
  const htmlSegments = [...segments.slice(0, -1), `${lastSegment}.html`];
  return getRegularFile(root, resolve(root, ...htmlSegments));
}

export function contentType(filePath: string): string {
  const extension = extname(filePath).toLowerCase();
  const mimeType = MIME_TYPES[extension] ?? "application/octet-stream";
  if (
    mimeType.startsWith("text/") || mimeType === "application/json" ||
    mimeType === "application/manifest+json" ||
    mimeType === "application/xml" || mimeType === "application/rdf+xml" ||
    mimeType === "image/svg+xml"
  ) {
    return `${mimeType}; charset=utf-8`;
  }
  return mimeType;
}

export function htmlReloadScript(watchPath: string): string {
  const endpoint = JSON.stringify(watchPath);
  return `<script>(function(){let build=null;async function poll(){try{const response=await fetch(${endpoint},{cache:"no-store"});if(!response.ok)throw new Error();const state=await response.json();if(build===null)build=state.build;else if(state.build!==build){location.reload();return;}}catch{}setTimeout(poll,500);}poll();})();</script>`;
}

export function serveResponse(
  body: Uint8Array,
  mimeType: string,
  method: string,
  extraHeaders: HeadersInit = {},
): Response {
  const headers = new Headers(extraHeaders);
  headers.set("content-type", mimeType);
  headers.set("content-length", String(body.byteLength));
  headers.set("x-content-type-options", "nosniff");
  const responseBody = method === "HEAD" ? null : (() => {
    const buffer = new ArrayBuffer(body.byteLength);
    new Uint8Array(buffer).set(body);
    return buffer;
  })();
  return new Response(responseBody, { headers });
}

export function siteFingerprint(root: string): string {
  const entries: string[] = [];
  const visit = (directory: string, prefix: string): void => {
    for (const entry of Deno.readDirSync(directory)) {
      const name = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
      const path = resolve(directory, entry.name);
      if (entry.isSymlink) continue;
      if (entry.isDirectory) {
        visit(path, name);
      } else if (entry.isFile) {
        try {
          const stat = Deno.statSync(path);
          entries.push(`${name}\t${stat.size}\t${stat.mtime?.getTime() ?? 0}`);
        } catch {
          continue;
        }
      }
    }
  };
  visit(root, "");
  return entries.sort().join("\n");
}

export function notFound(method: string): Response {
  return new Response(method === "HEAD" ? null : "Not Found\n", {
    status: 404,
    headers: {
      "content-length": "10",
      "content-type": "text/plain; charset=utf-8",
      "x-content-type-options": "nosniff",
    },
  });
}
