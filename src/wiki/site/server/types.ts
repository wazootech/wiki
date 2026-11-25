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

export interface NormalizedBaseUrl {
  readonly segments: readonly string[];
  readonly pathname: string;
}

export const MIME_TYPES: Readonly<Record<string, string>> = {
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
