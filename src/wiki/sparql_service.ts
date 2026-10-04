import { detectQueryForm, isSparqlUpdate } from "./format.ts";
import { literal, namedNode, RdfGraph, serializeRdf } from "./rdf.ts";
import type { Wiki } from "./wiki.ts";

const RDF = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
const SD = "http://www.w3.org/ns/sparql-service-description#";
const FMT = "http://www.w3.org/ns/formats/";
const ENT = "http://www.w3.org/ns/entailment/";
const PROF = "http://www.w3.org/ns/owl-profile/";
const VOID = "http://rdfs.org/ns/void#";
const XSD = "http://www.w3.org/2001/XMLSchema#";

const SELECT_FORMATS = [
  ["application/sparql-results+json", "json"],
  ["text/csv", "csv"],
  ["text/tab-separated-values", "tsv"],
] as const;
const GRAPH_FORMATS = [
  ["text/turtle", "turtle"],
  ["application/n-triples", "nt"],
  ["text/n3", "n3"],
] as const;

function escapedHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;")
    .replaceAll("'", "&#x27;");
}

function errorResponse(status: number, message: string): Response {
  const body =
    `<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="UTF-8">\n<title>${status}</title>\n</head>\n<body>\n<h1>${status}</h1>\n<p>${
      escapedHtml(message)
    }</p>\n</body>\n</html>`;
  return new Response(body, {
    status,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function normalizePath(path: string): string {
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

function parseBoolean(
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

function bestAcceptMedia(
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

function serviceDescription(
  endpoint: string,
  tripleCount: number | null,
): RdfGraph {
  const graph = new RdfGraph();
  graph.bind("sd", `${SD}`);
  graph.bind("ent", `${ENT}`);
  graph.bind("prof", `${PROF}`);
  graph.bind("void", `${VOID}`);
  const service = namedNode(`${endpoint}#service`);
  const dataset = namedNode(`${endpoint}#dataset`);
  const defaultGraph = namedNode(`${endpoint}#defaultGraph`);
  const add = (
    subject: ReturnType<typeof namedNode>,
    predicate: string,
    object: ReturnType<typeof namedNode> | ReturnType<typeof literal>,
  ) => {
    graph.add(subject, namedNode(predicate), object);
  };
  add(service, `${RDF}type`, namedNode(`${SD}Service`));
  add(service, `${SD}endpoint`, namedNode(endpoint));
  add(service, `${SD}supportedLanguage`, namedNode(`${SD}SPARQL11Query`));
  add(
    service,
    `${SD}defaultEntailmentRegime`,
    namedNode(`${ENT}OWL-RDF-Based`),
  );
  add(
    service,
    `${SD}defaultSupportedEntailmentProfile`,
    namedNode(`${PROF}RL`),
  );
  for (
    const format of [
      "SPARQL_Results_JSON",
      "SPARQL_Results_CSV",
      "SPARQL_Results_TSV",
      "Turtle",
      "N-Triples",
      "N3",
    ]
  ) add(service, `${SD}resultFormat`, namedNode(`${FMT}${format}`));
  add(service, `${SD}defaultDataset`, dataset);
  add(dataset, `${RDF}type`, namedNode(`${SD}Dataset`));
  add(dataset, `${SD}defaultGraph`, defaultGraph);
  add(defaultGraph, `${RDF}type`, namedNode(`${SD}Graph`));
  if (tripleCount !== null) {
    graph.add(
      defaultGraph,
      namedNode(`${VOID}triples`),
      literal(String(tripleCount), { datatype: `${XSD}integer` }),
    );
  }
  return graph;
}

async function serviceDescriptionResponse(
  wiki: Wiki,
  endpoint: string,
  accept: string,
): Promise<Response> {
  const media = bestAcceptMedia(accept, [
    "text/turtle",
    "application/n-triples",
  ]);
  if (media === null) {
    const message = accept.toLowerCase().includes("application/rdf+xml")
      ? "RDF/XML serialization is deferred; request text/turtle or application/n-triples."
      : `Unsupported Accept header: ${accept}`;
    return errorResponse(406, message);
  }
  let tripleCount: number | null = null;
  try {
    tripleCount = (await wiki.graph({ infer: true })).size;
  } catch {
    tripleCount = null;
  }
  const graph = serviceDescription(endpoint, tripleCount);
  const format = media === "application/n-triples" ? "nt" : "turtle";
  const body = await serializeRdf(graph.toArray(), format, {
    prefixes: graph.bindings,
  });
  return new Response(body, {
    headers: { "content-type": `${media}; charset=utf-8` },
  });
}

function last(params: URLSearchParams, name: string): string | null {
  return params.getAll(name).at(-1) ?? null;
}

async function requestParameters(request: Request): Promise<
  {
    query: string | null;
    params: URLSearchParams;
  } | Response
> {
  const url = new URL(request.url);
  if (request.method === "GET") {
    return { query: last(url.searchParams, "query"), params: url.searchParams };
  }
  if (request.method !== "POST") {
    return errorResponse(405, `Unsupported method: ${request.method}`);
  }
  const contentType = (request.headers.get("content-type") ?? "").split(
    ";",
    1,
  )[0]!.trim().toLowerCase();
  const body = await request.text();
  if (contentType === "application/sparql-query") {
    const params = new URLSearchParams(url.searchParams);
    return { query: body, params };
  }
  if (contentType === "application/x-www-form-urlencoded") {
    const params = new URLSearchParams(url.searchParams);
    for (const [key, value] of new URLSearchParams(body)) {
      params.append(key, value);
    }
    return { query: last(params, "query"), params };
  }
  return errorResponse(
    400,
    `Unsupported Content-Type: ${contentType || "missing"}`,
  );
}

export function createSparqlServiceHandler(
  wiki: Wiki,
  options: { readonly path: string; readonly baseUrl: string },
): (request: Request) => Promise<Response | null> {
  const servicePath = normalizePath(options.path);
  if (wiki.config.sparql_service.enabled) {
    validateSparqlServicePath(options.path, options.baseUrl);
  }
  return async (request) => {
    const url = new URL(request.url);
    if (normalizePath(url.pathname) !== servicePath) return null;
    if (!wiki.config.sparql_service.enabled) {
      return errorResponse(404, "SPARQL endpoint is disabled.");
    }
    if (request.method === "GET" && url.search === "") {
      return await serviceDescriptionResponse(
        wiki,
        `${url.origin}${servicePath}`,
        request.headers.get("accept") ?? "",
      );
    }
    const parsed = await requestParameters(request);
    if (parsed instanceof Response) return parsed;
    const { query, params } = parsed;
    if (query === null || query.trim() === "") {
      return errorResponse(400, "Missing SPARQL query.");
    }
    if (isSparqlUpdate(query)) {
      return errorResponse(
        405,
        "SPARQL Update is not supported by this endpoint.",
      );
    }

    let form: string;
    try {
      form = detectQueryForm(query);
    } catch (error) {
      return errorResponse(
        400,
        error instanceof Error ? error.message : String(error),
      );
    }
    if (!new Set(["SELECT", "ASK", "CONSTRUCT", "DESCRIBE"]).has(form)) {
      return errorResponse(405, `Unsupported SPARQL query form: ${form}`);
    }
    const accepted = form === "CONSTRUCT" || form === "DESCRIBE"
      ? GRAPH_FORMATS
      : SELECT_FORMATS;
    const accept = request.headers.get("accept") ?? "";
    const media = bestAcceptMedia(
      accept,
      accepted.map(([mediaType]) => mediaType),
    );
    if (media === null) {
      const message = accept.toLowerCase().includes("application/rdf+xml")
        ? "RDF/XML serialization is deferred; request text/turtle, application/n-triples, or text/n3."
        : `Unsupported Accept header: ${accept}`;
      return errorResponse(406, message);
    }
    const format = accepted.find(([mediaType]) => mediaType === media)![1];
    if (form === "ASK" && format !== "json") {
      return errorResponse(
        406,
        "ASK responses are only available as application/sparql-results+json.",
      );
    }
    try {
      const body = await wiki.query(query, {
        format,
        noInference: !parseBoolean(params, "inference", true),
        reload: parseBoolean(params, "reload", false),
      });
      const contentType = form === "CONSTRUCT" || form === "DESCRIBE"
        ? format === "turtle"
          ? "text/turtle"
          : format === "nt"
          ? "application/n-triples"
          : "text/n3"
        : format === "json"
        ? "application/sparql-results+json"
        : format === "csv"
        ? "text/csv"
        : "text/tab-separated-values";
      return new Response(body, {
        headers: { "content-type": `${contentType}; charset=utf-8` },
      });
    } catch (error) {
      return errorResponse(
        422,
        `Query Execution Error: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  };
}
