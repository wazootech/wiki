import { resolve } from "@std/path";
import type {
  StaticSiteHandlerHandle,
  StaticSiteServerOptions,
} from "./types.ts";
import { normalizeBaseUrl, relativeSegments } from "./path_utils.ts";
import {
  contentType,
  findStaticFile,
  htmlReloadScript,
  notFound,
  serveResponse,
  siteFingerprint,
} from "./static_files.ts";

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
