import { detectQueryForm, isSparqlUpdate } from "./format.ts";
import { errorText } from "./errors.ts";
import type { Wiki } from "./wiki.ts";
import {
  bestAcceptMedia,
  errorResponse,
  GRAPH_FORMATS,
  normalizePath,
  parseBoolean,
  SELECT_FORMATS,
  validateSparqlServicePath,
} from "./sparql_service/http_utils.ts";
import {
  requestParameters,
  serviceDescriptionResponse,
} from "./sparql_service/service_support.ts";

export { validateSparqlServicePath } from "./sparql_service/http_utils.ts";

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
        errorText(error),
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
        `Query Execution Error: ${errorText(error)}`,
      );
    }
  };
}
