import { literal, namedNode, RdfGraph, serializeRdf } from "../rdf.ts";
import type { Wiki } from "../wiki.ts";
import {
  bestAcceptMedia,
  ENT,
  errorResponse,
  FMT,
  last,
  PROF,
  RDF,
  SD,
  VOID,
  XSD,
} from "./http_utils.ts";

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

export async function serviceDescriptionResponse(
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

export async function requestParameters(request: Request): Promise<
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
