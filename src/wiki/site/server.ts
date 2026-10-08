/**
 * Static HTTP preview server for an already-built Wiki site.
 *
 * `siteDir` is the directory containing the generated site root (including
 * `index.html`). `baseUrl` mounts that directory at a URL prefix; it does not
 * name a subdirectory inside `siteDir`.
 */

import { extname, isAbsolute, relative, resolve } from "@std/path";

export type StaticUrlStyle = "dir" | "file";

export interface StaticSiteServerOptions {
  readonly siteDir: string;
  readonly host?: string;
  readonly port?: number;
  readonly baseUrl?: string;
  readonly urlStyle?: StaticUrlStyle;
  readonly watch?: boolean;
  readonly pollIntervalMs?: number;
  readonly requestHandler?: (request: Request) => Promise<Response | null>;
}

export interface StaticSiteServerHandle {
  readonly server: Deno.HttpServer;
  readonly url: string;
  close(): Promise<void>;
}

export interface StaticSiteHandlerHandle {
  handleRequest(request: Request): Promise<Response>;
  close(): void;
}

interface NormalizedBaseUrl {
  readonly segments: readonly string[];
  readonly pathname: string;
}

const MIME_TYPES: Readonly<Record<string, string>> = {
  ".avif": "image/avif",
  ".css": "text/css",
  ".csv": "text/csv",
  ".gif": "image/gif",
  ".htm": "text/html",
  ".html": "text/html",
  ".ico": "image/vnd.microsoft.icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript",
  ".json": "application/json",
  ".map": "application/json",
  ".mjs": "text/javascript",
  ".n3": "text/n3",
  ".nq": "application/n-quads",
  ".nt": "application/n-triples",
  ".otf": "font/otf",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".rdf": "application/rdf+xml",
  ".svg": "image/svg+xml",
  ".txt": "text/plain",
  ".ttf": "font/ttf",
  ".ttl": "text/turtle",
  ".wasm": "application/wasm",
  ".webmanifest": "application/manifest+json",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".xml": "application/xml",
};

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

function normalizeBaseUrl(baseUrl: string): NormalizedBaseUrl {
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

function relativeSegments(
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

function isWithinRoot(root: string, filePath: string): boolean {
  const pathFromRoot = relative(root, filePath);
  if (pathFromRoot === "" || isAbsolute(pathFromRoot)) {
    return pathFromRoot === "";
  }
  const firstSegment = pathFromRoot.split(/[\\/]/, 1)[0];
  return firstSegment !== "..";
}

function getRegularFile(root: string, candidate: string): string | null {
  try {
    const realCandidate = Deno.realPathSync(candidate);
    if (!isWithinRoot(root, realCandidate)) return null;
    return Deno.statSync(realCandidate).isFile ? realCandidate : null;
  } catch {
    return null;
  }
}

function findStaticFile(
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

function contentType(filePath: string): string {
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

function htmlReloadScript(watchPath: string): string {
  const endpoint = JSON.stringify(watchPath);
  return `<script>(function(){let build=null;async function poll(){try{const response=await fetch(${endpoint},{cache:"no-store"});if(!response.ok)throw new Error();const state=await response.json();if(build===null)build=state.build;else if(state.build!==build){location.reload();return;}}catch{}setTimeout(poll,500);}poll();})();</script>`;
}

function serveResponse(
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

function siteFingerprint(root: string): string {
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

function notFound(method: string): Response {
  return new Response(method === "HEAD" ? null : "Not Found\n", {
    status: 404,
    headers: {
      "content-length": "10",
      "content-type": "text/plain; charset=utf-8",
      "x-content-type-options": "nosniff",
    },
  });
}

export function createStaticSiteHandler(
  options: StaticSiteServerOptions,
): StaticSiteHandlerHandle {
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 8080;
  const base = normalizeBaseUrl(options.baseUrl ?? "/wiki");
  const urlStyle = options.urlStyle ?? "dir";
  const watch = options.watch ?? false;
  const pollIntervalMs = options.pollIntervalMs ?? 500;

  if (!host.trim()) throw new TypeError("host must not be empty");
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new RangeError(`Invalid port: ${port}`);
  }
  if (urlStyle !== "dir" && urlStyle !== "file") {
    throw new TypeError(`Invalid urlStyle: ${urlStyle}`);
  }
  if (!Number.isFinite(pollIntervalMs) || pollIntervalMs <= 0) {
    throw new RangeError(`Invalid pollIntervalMs: ${pollIntervalMs}`);
  }

  let root: string;
  try {
    root = Deno.realPathSync(resolve(options.siteDir));
  } catch {
    throw new TypeError(
      `Static site directory does not exist: ${options.siteDir}`,
    );
  }
  if (!Deno.statSync(root).isDirectory) {
    throw new TypeError(
      `Static site path is not a directory: ${options.siteDir}`,
    );
  }

  let build = 0;
  let fingerprint = watch ? siteFingerprint(root) : "";
  let pollTimer: ReturnType<typeof setInterval> | undefined;
  const watchPath = `${base.pathname}/__watch` || "/__watch";

  const handler = async (request: Request): Promise<Response> => {
    if (options.requestHandler !== undefined) {
      const response = await options.requestHandler(request);
      if (response !== null) return response;
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method Not Allowed\n", {
        status: 405,
        headers: {
          allow: "GET, HEAD",
          "content-type": "text/plain; charset=utf-8",
        },
      });
    }

    const url = new URL(request.url);
    const relSegments = relativeSegments(url.pathname, base);
    if (relSegments === null) return notFound(request.method);

    if (
      watch && relSegments.length === 1 && relSegments[0] === "__watch"
    ) {
      const body = new TextEncoder().encode(JSON.stringify({ build }));
      return serveResponse(
        body,
        "application/json; charset=utf-8",
        request.method,
        { "cache-control": "no-store" },
      );
    }

    const filePath = findStaticFile(root, relSegments, urlStyle);
    if (filePath === null) return notFound(request.method);

    try {
      let body = await Deno.readFile(filePath);
      const mimeType = contentType(filePath);
      if (watch && mimeType.startsWith("text/html")) {
        const html = new TextDecoder().decode(body);
        const script = htmlReloadScript(watchPath);
        const closingBody = /<\/body\s*>/i;
        const updatedHtml = closingBody.test(html)
          ? html.replace(closingBody, `${script}$&`)
          : `${html}${script}`;
        body = new TextEncoder().encode(updatedHtml);
      }
      return serveResponse(body, mimeType, request.method, {
        "cache-control": "no-store",
      });
    } catch {
      return notFound(request.method);
    }
  };

  if (watch) {
    pollTimer = setInterval(() => {
      try {
        const nextFingerprint = siteFingerprint(root);
        if (nextFingerprint !== fingerprint) {
          fingerprint = nextFingerprint;
          build++;
        }
      } catch {
        return;
      }
    }, pollIntervalMs);
  }

  return {
    handleRequest: handler,
    close() {
      if (pollTimer !== undefined) clearInterval(pollTimer);
    },
  };
}

export function startStaticSiteServer(
  options: StaticSiteServerOptions,
): StaticSiteServerHandle {
  const preview = createStaticSiteHandler(options);
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 8080;
  const server = Deno.serve(
    { hostname: host, port, onListen: () => {} },
    preview.handleRequest,
  );
  const address = server.addr;
  const hostname = address.hostname.includes(":")
    ? `[${address.hostname}]`
    : address.hostname;
  const url = `http://${hostname}:${address.port}`;
  let closePromise: Promise<void> | undefined;
  return {
    server,
    url,
    close() {
      if (closePromise === undefined) {
        preview.close();
        closePromise = server.shutdown();
      }
      return closePromise;
    },
  };
}
