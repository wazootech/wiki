export const RDF = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
export const SD = "http://www.w3.org/ns/sparql-service-description#";
export const FMT = "http://www.w3.org/ns/formats/";
export const ENT = "http://www.w3.org/ns/entailment/";
export const PROF = "http://www.w3.org/ns/owl-profile/";
export const VOID = "http://rdfs.org/ns/void#";
export const XSD = "http://www.w3.org/2001/XMLSchema#";

export const SELECT_FORMATS = [
  ["application/sparql-results+json", "json"],
  ["text/csv", "csv"],
  ["text/tab-separated-values", "tsv"],
] as const;
export const GRAPH_FORMATS = [
  ["text/turtle", "turtle"],
  ["application/n-triples", "nt"],
  ["text/n3", "n3"],
] as const;

function escapedHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;")
    .replaceAll("'", "&#x27;");
}

export function errorResponse(status: number, message: string): Response {
  const body =
    `<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="UTF-8">\n<title>${status}</title>\n</head>\n<body>\n<h1>${status}</h1>\n<p>${
      escapedHtml(message)
    }</p>\n</body>\n</html>`;
  return new Response(body, {
    status,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

export function normalizePath(path: string): string {
  return path.replace(/\/+$/, "") || "/";
}

export function validateSparqlServicePath(
  path: string,
  baseUrl: string,
): void {
  const servicePath = normalizePath(path);
  const base = normalizePath(baseUrl);
  const watchPath = normalizePath(`${base === "/" ? "" : base}/__watch`);
  if (servicePath === "/") {
    throw new Error(
      "Invalid sparql_service.path: '/' would shadow the entire server.",
    );
  }
  if (servicePath === watchPath) {
    throw new Error(
      `Invalid sparql_service.path: '${path}' collides with the watch endpoint.`,
    );
  }
  if (
    base !== "/" && (servicePath === base || servicePath.startsWith(`${base}/`))
  ) {
    throw new Error(
      `Invalid sparql_service.path: '${path}' collides with page routes under base_url '${baseUrl}'.`,
    );
  }
}

export function parseBoolean(
  params: URLSearchParams,
  name: string,
  fallback: boolean,
): boolean {
  const values = params.getAll(name);
  if (values.length === 0) return fallback;
  return new Set(["1", "true", "yes", "on"]).has(
    values.at(-1)!.trim().toLowerCase(),
  );
}

export function bestAcceptMedia(
  accept: string,
  supported: readonly string[],
): string | null {
  if (accept.trim() === "") return supported[0] ?? null;
  const ranked = accept.split(",").flatMap((entry, index) => {
    const [rawMedia, ...parameters] = entry.trim().split(";");
    const media = rawMedia?.trim().toLowerCase() ?? "";
    if (media === "") return [];
    let quality = 1;
    for (const parameter of parameters) {
      const normalized = parameter.trim();
      if (!normalized.startsWith("q=")) continue;
      const parsed = Number(normalized.slice(2));
      quality = Number.isFinite(parsed) ? parsed : 0;
    }
    return [{ media, quality, index }];
  }).sort((a, b) => b.quality - a.quality || a.index - b.index);
  for (const entry of ranked) {
    if (supported.includes(entry.media)) return entry.media;
    if (entry.media === "*/*") return supported[0] ?? null;
  }
  return null;
}

export function last(params: URLSearchParams, name: string): string | null {
  return params.getAll(name).at(-1) ?? null;
}
