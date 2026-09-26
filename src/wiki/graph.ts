/**
 * Wiki graph loading: frontmatter-to-triple conversion, blank nodes, and the
 * named-graph dataset.
 *
 * Port of `src/wiki/graph.py`. This is the module where frontmatter stops being
 * data and becomes RDF, so most of the rules here are about *identity* — what
 * a page's subject URI is, when a nested mapping becomes a blank node, and
 * which frontmatter key resolves to which predicate:
 *
 * - A page's subject is `@id`/`id` when present (with `prefix:name` CURIEs
 *   expanded against the configured namespaces), and otherwise
 *   `{base_iri}{route}` — with the file extension appended when
 *   `graph.include_file_extension` asks for it.
 * - A nested mapping becomes a blank node, or a URI reference when it carries
 *   `@id`, or a *typed* blank node when it carries `@type`.
 * - `resolve_predicate` resolves `prefix:local` first, then `wiki.*`, then the
 *   `@vocab` fallback — and returns nothing at all when `@vocab` is configured
 *   as empty, which is how a wiki opts out of unprefixed keys entirely.
 *
 * Three port-level differences are deliberate:
 *
 * - **The loaders are async.** rdflib parses synchronously; the port's N-Triples
 *   / N-Quads / RDF-XML parsers come from `@zazuko/env-node`, whose streams are
 *   async, and the disk cache in `graph_cache.ts` is already async. Awaiting a
 *   graph build is the same call shape, one `await` further out.
 * - **`applyInference` is imported lazily.** The Python module imports `infer`
 *   inside the function, which keeps owlrl out of commands that never load a
 *   graph; the port does the same for the baked OWL 2 RL ruleset, which is
 *   ~37 KB of text no `wiki --version` should pay for.
 * - **Two value shapes cannot be reproduced exactly**, both because JavaScript
 *   has fewer number types than Python (see `numericLiteral` and
 *   `temporalLiteral`): a YAML `30.0` arrives as `30`, and a YAML date arrives
 *   as a `Date` with no record of whether the source wrote a date or a
 *   date-time. Both need the document layer to record the lexical form, and are
 *   flagged where they happen rather than papered over.
 */

import { extract, LinkedMarkdownError } from "@wazoo/linked-markdown";
import type { NamedNode, Quad, Term } from "./rdf.ts";
import {
  blankNode,
  literal,
  namedNode,
  parseRdf,
  parseTurtle,
  RDF_TYPE,
  RdfDataset,
  RdfGraph,
  termKey,
  XSD_BOOLEAN,
  XSD_DATETIME,
  XSD_DOUBLE,
  XSD_INTEGER,
} from "./rdf.ts";
import { Config } from "./config.ts";
import type { Context } from "./context.ts";
import { IS_WINDOWS, type Path, sortedRglob } from "./fspath.ts";
import { getLogger } from "./logging.ts";
import {
  type DataRecord,
  documentDataFromPath,
  isRecord,
  pyStrip,
  readTextTolerant,
} from "./parser.ts";
import { iterDocumentFiles, routeForDocumentFile } from "./paths.ts";
import { pyRepr, pyStr } from "./pyrepr.ts";
import {
  type GraphDescriptor,
  loadLockfile,
  type SourceConfig,
} from "./schemas/sources.ts";
import { quote } from "./urlquote.ts";

const logger = getLogger("wiki.graph");

/** `true` when a SPARQL query uses an explicit `GRAPH` clause. */
export function usesNamedGraphs(sparqlQuery: string): boolean {
  // The lookbehind is the point: `?graph`, `$graph`, `ex:GRAPH` and
  // `schema:GRAPHx` are all variable or IRI fragments, not the keyword.
  return /(?<![?$A-Za-z0-9_:-])GRAPH\s+/i.test(sparqlQuery);
}

/** Load the right RDF query target for plain or named-graph SPARQL. */
export async function loadQueryGraph(
  config: Config,
  sparqlQuery: string,
  options: QueryGraphOptions = {},
): Promise<RdfGraph | RdfDataset> {
  if (usesNamedGraphs(sparqlQuery)) return await loadDataset(config, options);
  return await loadGraph(config, options);
}

/** The base every graph URI is derived from. */
function graphBase(config: Config): string {
  const wiki = config.context.namespaces.get("wiki");
  return (wiki || config.base_iri).replace(/\/+$/, "");
}

/** Stable named graph URI for the root wiki corpus. */
export function rootGraphUri(config: Config): string {
  return `${graphBase(config)}/graphs/root`;
}

/** Stable named graph URI for an installed source. */
export function sourceGraphUri(config: Config, sourceName: string): string {
  // `quote(..., safe="")` escapes the `/` in a nested source name too, so a
  // source called `a/b` cannot forge a deeper graph path.
  return `${graphBase(config)}/graphs/source/${quote(sourceName, "")}`;
}

/**
 * Where an installed source's cache lives.
 *
 * Mirrors the path convention in `sources.ts`. The graph loader keeps this
 * small read-only helper local so describing graphs does not depend on the
 * source-management operations.
 */
function sourceCacheDir(config: Config, sourceName: string): Path {
  return config.config_root.joinpath(".wiki", "sources", sourceName);
}

/**
 * A source's checked-out path, or a failure when it is missing.
 *
 * Ported from `sources.py::_source_resolved_path`, including the `RuntimeError`
 * that `graph_descriptors` swallows to skip a source whose cache is incomplete.
 */
function sourceResolvedPath(source: SourceConfig, repoDir: Path): Path {
  const base = source.path ? repoDir.joinpath(source.path) : repoDir;
  if (!base.exists()) {
    throw new Error(
      `Source ${pyRepr(source.name)}: path ${
        pyRepr(source.path)
      } does not exist`,
    );
  }
  return base.resolve();
}

/** Describe root and installed source graphs without mutating source state. */
export function graphDescriptors(config: Config): GraphDescriptor[] {
  const lockfile = loadLockfile(config.config_root.joinpath("wiki.lock"));
  const cacheRoot = config.config_root.joinpath(".wiki", "sources");
  if (
    lockfile.sources.size === 0 && cacheRoot.isDir() &&
    [...Deno.readDirSync(cacheRoot.toString())].length > 0
  ) {
    logger.warning(
      `Source cache exists under ${cacheRoot} but wiki.lock has no sources; ` +
        `source graph provenance is unavailable.`,
    );
  }

  const sourcePaths = new Map<string, GraphDescriptor>();
  const directSourceNames = new Set(config.sources.map((item) => item.name));

  for (const [name, locked] of lockfile.sources) {
    let requiredBy = [...locked.required_by];
    if (requiredBy.length === 0 && directSourceNames.has(name)) {
      requiredBy = ["root"];
    }
    const repoDir = sourceCacheDir(config, name).joinpath("repo");
    if (!repoDir.exists()) continue;
    const source: SourceConfig = {
      name,
      type: "git",
      url: locked.url,
      ref: locked.ref,
      path: locked.path,
    };
    let localPath: Path;
    try {
      localPath = sourceResolvedPath(source, repoDir);
    } catch {
      continue;
    }
    sourcePaths.set(localPath.resolve().toString(), {
      name,
      uri: sourceGraphUri(config, name),
      kind: "source",
      source_name: name,
      source_type: "git",
      url: locked.url,
      ref: locked.ref,
      resolved_ref: locked.resolved_ref,
      path: locked.path,
      local_path: localPath,
      required_by: requiredBy,
    });
  }

  const rootInputs: Path[] = [];
  const sourceDescriptors: GraphDescriptor[] = [];
  for (const inputDir of config.wiki.input) {
    const descriptor = sourcePaths.get(inputDir.resolve().toString());
    if (descriptor === undefined) {
      rootInputs.push(inputDir);
    } else if (!sourceDescriptors.some((item) => item.uri === descriptor.uri)) {
      sourceDescriptors.push(descriptor);
    }
  }

  const root: GraphDescriptor = {
    name: "root",
    uri: rootGraphUri(config),
    kind: "root",
    source_name: null,
    source_type: null,
    url: null,
    ref: null,
    resolved_ref: null,
    local_path: config.config_root,
    path: rootInputs.map((path) => config.relativeToRoot(path)).join(", ") ||
      null,
    required_by: [],
  };
  return [root, ...sourceDescriptors];
}

/** Convert a string to kebab-case for URI segments. */
export function kebabCase(value: unknown): string {
  return String(value)
    .toLowerCase()
    .trim()
    .replace(/[\s-]+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

/**
 * Expand a `prefix:local` reference, or `null` when the prefix is unknown.
 *
 * Splitting on the *first* colon is what `str.split(":", 1)` does, so a local
 * part containing colons (`ex:a:b`) survives intact.
 */
function expandCurie(value: string, context: Context): string | null {
  const index = value.indexOf(":");
  if (index < 0) return null;
  const namespace = context.namespaces.get(value.slice(0, index));
  if (namespace === undefined) return null;
  return `${namespace}${value.slice(index + 1)}`;
}

/**
 * Map a frontmatter key to an RDF predicate URI using managed namespaces.
 *
 * Resolution order: CURIE (`prefix:localName`) → `wiki.*` dotted keys → the
 * `@vocab` default. Nothing resolves to `null` unless `@vocab` is absent, which
 * is what makes `@vocab: null` a way to say "only prefixed keys count".
 */
export function resolvePredicate(
  key: string,
  context: Context,
): NamedNode | null {
  if (key.includes(":")) {
    const expanded = expandCurie(key, context);
    if (expanded !== null) return namedNode(expanded);
  }
  if (key.startsWith("wiki.")) {
    const wiki = context.namespaces.get("wiki");
    // Python reaches `context.namespaces["wiki"]` unguarded and raises a
    // `KeyError` when the context deletes the prefix; returning nothing is the
    // same answer the deletion was asking for.
    if (wiki !== undefined) return namedNode(`${wiki}${key.slice(5)}`);
  }
  if (context.vocab) return namedNode(`${context.vocab}${key}`);
  return null;
}

/**
 * Map a frontmatter type to an RDF type URI using managed namespaces.
 *
 * A non-string type (`type: 5`, a list item that is not a string) is taken as a
 * URI outright, which is `URIRef(str(t))`.
 */
export function resolveType(
  value: unknown,
  context: Context,
): NamedNode | null {
  if (typeof value === "string") {
    if (value.includes(":")) {
      const expanded = expandCurie(value, context);
      if (expanded !== null) return namedNode(expanded);
    }
    if (context.vocab) return namedNode(`${context.vocab}${value}`);
    return null;
  }
  return namedNode(pyStr(value));
}

/** Python truthiness, which is not JavaScript truthiness for `[]` and `{}`. */
function pyTruthy(value: unknown): boolean {
  if (value === null || value === undefined || value === false) return false;
  if (value === 0 || value === "") return false;
  if (Array.isArray(value)) return value.length > 0;
  if (isRecord(value)) return Object.keys(value).length > 0;
  return true;
}

/**
 * A numeric literal the way rdflib infers one from a Python number.
 *
 * JavaScript has a single number type, so `30.0` and `30` are the same value
 * here and both become `xsd:integer`; Python's YAML reader hands rdflib a float
 * for `30.0` and gets `"30.0"^^xsd:double`. An integral value in that range is
 * indistinguishable at this layer — the fix belongs where YAML is parsed, not
 * here, and no test in the corpus depends on the difference.
 */
function numericLiteral(value: number): ReturnType<typeof literal> {
  if (Number.isInteger(value)) {
    return literal(String(value), { datatype: XSD_INTEGER });
  }
  // Python's `str` keeps the `.0` on an integral float and switches to exponent
  // form outside 1e-4..1e16; JavaScript's does neither.
  if (Math.abs(value) < 1e16 && value === Math.trunc(value)) {
    return literal(`${value}.0`, { datatype: XSD_DOUBLE });
  }
  return literal(String(value), { datatype: XSD_DOUBLE });
}

/**
 * A `datetime`/`date` literal, typed the way rdflib types one.
 *
 * Python hands `resolve_object` a `datetime` (which has `.hour`) or a `date`
 * (which has `.isoformat` and `.year`) and rdflib types them `xsd:dateTime` and
 * `xsd:date`. A JavaScript `Date` carries a time in both cases, and YAML
 * resolves `2026-05-30` and `2026-05-30T00:00:00` to the same value, so a
 * date-only frontmatter value is typed `xsd:dateTime` where the oracle writes
 * `xsd:date`. Recording the lexical form at the parser is the fix; until then
 * this is a real, narrow divergence rather than a silent guess.
 */
function temporalLiteral(value: Date): ReturnType<typeof literal> {
  return literal(value.toISOString(), { datatype: XSD_DATETIME });
}

/** Add a predicate-object pair, recursively handling nested structures. */
export function resolveObject(
  key: string,
  value: unknown,
  graph: RdfGraph,
  subject: Term,
  context: Context,
): void {
  const pred = resolvePredicate(key, context);
  if (pred === null) return;

  // A `Date` is an object in JavaScript but not a `dict` in Python, so it has to
  // be excluded from the mapping branch: otherwise `2026-05-30` becomes an
  // empty blank node and loses its datatype entirely.
  if (value instanceof Date) {
    graph.add(subject, pred, temporalLiteral(value));
    return;
  }

  if (isRecord(value)) {
    if (pyTruthy(value["@id"])) {
      let uri = String(value["@id"]);
      const expanded = uri.includes(":") ? expandCurie(uri, context) : null;
      if (expanded !== null) uri = expanded;
      graph.add(subject, pred, namedNode(uri));
    } else if ("@type" in value) {
      // A typed nested mapping is a *fresh* blank node, never a reuse of the
      // parent: sharing one is the wiki#144 collision between shape files.
      const blank = blankNode();
      graph.add(subject, pred, blank);
      const resolved = resolveType(value["@type"], context);
      if (resolved !== null) graph.add(blank, namedNode(RDF_TYPE), resolved);
      for (const [childKey, childValue] of Object.entries(value)) {
        if (childKey.startsWith("@")) continue;
        resolveObject(childKey, childValue, graph, blank, context);
      }
    } else {
      const blank = blankNode();
      graph.add(subject, pred, blank);
      for (const [childKey, childValue] of Object.entries(value)) {
        if (childKey.startsWith("@")) continue;
        resolveObject(childKey, childValue, graph, blank, context);
      }
    }
    return;
  }

  if (typeof value === "string") {
    if (value.startsWith("http")) {
      graph.add(subject, pred, namedNode(value));
    } else if (
      value.includes(":") && !value.includes(" ") && !value.includes("\n")
    ) {
      // A CURIE-ish string, but only a *known* prefix makes it a URI; anything
      // else stays a literal so `time: 9:30` does not invent a namespace.
      const expanded = expandCurie(value, context);
      if (expanded !== null) graph.add(subject, pred, namedNode(expanded));
      else graph.add(subject, pred, literal(value));
    } else {
      graph.add(subject, pred, literal(value));
    }
    return;
  }

  // Booleans before numbers: Python's `bool` is an `int` subclass, and
  // `isinstance(True, int)` is true, so the order in the oracle is load-bearing.
  if (typeof value === "boolean") {
    graph.add(
      subject,
      pred,
      literal(value ? "true" : "false", { datatype: XSD_BOOLEAN }),
    );
    return;
  }
  if (typeof value === "number") {
    graph.add(subject, pred, numericLiteral(value));
    return;
  }
  if (value !== null && value !== undefined) {
    graph.add(subject, pred, literal(pyStr(value)));
  }
}

/** The context and content predicate a `Config` or bare `Context` implies. */
function rdfBinding(
  context: Context | Config,
): { context: Context; contentPredicate: string | null } {
  if (context instanceof Config) {
    return {
      context: context.context,
      contentPredicate: context.graph.content_predicate,
    };
  }
  return { context, contentPredicate: null };
}

/** Frontmatter `type` as a list, whatever shape it arrived in. */
function normalizeTypeList(raw: unknown): unknown[] {
  if (raw === null || raw === undefined) return [];
  if (Array.isArray(raw)) return [...raw];
  return [raw];
}

/** `true` for the SHACL shape types `append` must leave alone. */
function isShaclShapeDocument(types: readonly unknown[]): boolean {
  for (const item of types) {
    if (typeof item !== "string") continue;
    const normalized = item.trim();
    if (
      normalized === "sh:NodeShape" || normalized === "sh:PropertyShape" ||
      normalized === "NodeShape" || normalized === "PropertyShape"
    ) {
      return true;
    }
    const index = normalized.indexOf(":");
    if (index > 0 && normalized.slice(0, index) === "sh") {
      const local = normalized.slice(index + 1);
      if (local === "NodeShape" || local === "PropertyShape") return true;
    }
  }
  return false;
}

/**
 * Merge frontmatter types with `graph.implicit_types` per
 * `implicit_types_policy`.
 *
 * `fallback` (the default) only supplies a type to a page that declares none;
 * `append` unions them, in declaration order, deduped by *resolved URI* — which
 * is why two spellings of the same class (`schema:Person` and `Person` under a
 * schema.org vocab) collapse to the first one seen. Shape documents are exempt
 * from `append`: adding `TechArticle` to a `sh:NodeShape` would make every
 * shape validate as content.
 */
export function effectiveTypes(
  data: DataRecord,
  context: Context | Config,
): unknown[] {
  const declared = pyTruthy(data["@type"]) ? data["@type"] : data["type"];
  const frontmatterTypes = normalizeTypeList(declared);

  let implicitTypes: readonly string[] = [];
  let policy = "fallback";
  if (context instanceof Config) {
    implicitTypes = context.graph.implicit_types;
    policy = context.graph.implicit_types_policy;
  }

  if (implicitTypes.length === 0) return frontmatterTypes;
  if (frontmatterTypes.length === 0) return [...implicitTypes];
  if (policy === "fallback") return frontmatterTypes;
  if (isShaclShapeDocument(frontmatterTypes)) return frontmatterTypes;

  const rdfContext = context instanceof Config ? context.context : context;
  const seen = new Set<string>();
  const merged: unknown[] = [];
  for (const item of [...frontmatterTypes, ...implicitTypes]) {
    const resolved = resolveType(item, rdfContext);
    if (resolved === null) continue;
    if (seen.has(resolved.value)) continue;
    seen.add(resolved.value);
    merged.push(item);
  }
  return merged;
}

/** Options for {@link frontmatterToGraph}, mirroring the oracle's keywords. */
export interface FrontmatterGraphOptions {
  /** The page's route, used to build a subject when frontmatter has no `@id`. */
  readonly fileId?: string | null;
  /** The markdown body to fold into the content predicate. */
  readonly body?: string | null;
  readonly includeFileExtension?: boolean;
  /** The document's extension, used when `includeFileExtension` is set. */
  readonly fileExt?: string;
  readonly contentPredicate?: string | null;
}

/** Convert a parsed frontmatter mapping into an RDF graph. */
export function frontmatterToGraph(
  data: DataRecord | null | undefined,
  context: Context | Config,
  options: FrontmatterGraphOptions = {},
): RdfGraph {
  const binding = rdfBinding(context);
  const rdfContext = binding.context;
  const contentPredicate = options.contentPredicate ?? binding.contentPredicate;
  const includeFileExtension = options.includeFileExtension ?? false;
  const fileExt = options.fileExt ?? ".md";
  const fileId = options.fileId ?? null;
  const body = options.body ?? null;

  const graph = new RdfGraph();
  rdfContext.bindNamespaces(graph);
  graph.vocab = rdfContext.vocab;

  const record: DataRecord = data ?? {};
  const types = effectiveTypes(record, context);
  if (!pyTruthy(record) || types.length === 0) return graph;

  let docId = pyTruthy(record["@id"]) ? record["@id"] : record["id"];
  if (!pyTruthy(docId)) {
    // No `@id` and no route to derive one from: Python returns a *fresh*
    // unbound `Graph()` here rather than the graph built above. The triple set
    // is empty either way, so returning the bound graph is indistinguishable —
    // and one less place for a namespace binding to mysteriously vanish.
    if (!pyTruthy(fileId)) return graph;
    docId = `${rdfContext.baseIri}${fileId}${
      includeFileExtension ? fileExt : ""
    }`;
  }

  let subjectIri = String(docId);
  if (subjectIri.includes(":")) {
    const expanded = expandCurie(subjectIri, rdfContext);
    if (expanded !== null) subjectIri = expanded;
  }
  const subject = namedNode(subjectIri);

  for (const item of types) {
    const resolved = resolveType(item, rdfContext);
    if (resolved !== null) graph.add(subject, namedNode(RDF_TYPE), resolved);
  }

  const skipKeys = new Set(["id", "type", "@type"]);
  for (const [key, value] of Object.entries(record)) {
    if (key.startsWith("@") || skipKeys.has(key)) continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        resolveObject(key, item, graph, subject, rdfContext);
      }
    } else if (pyTruthy(value)) {
      resolveObject(key, value, graph, subject, rdfContext);
    }
  }

  if (pyTruthy(body) && pyTruthy(contentPredicate)) {
    resolveObject(contentPredicate!, body, graph, subject, rdfContext);
  }

  return graph;
}

/**
 * Add quads into a container, applying the *container's* graph name.
 *
 * `RdfGraph.addAll` preserves each quad's own graph, which is right for a plain
 * graph and wrong here: a document parsed on its own carries the default graph,
 * but in a dataset it must land in that source's named graph. Python gets this
 * from rdflib's context-aware store (`dataset.graph(uri) += other`); the port
 * gets it by re-adding subject/predicate/object through `add`.
 */
function addQuads(target: RdfGraph, quads: Iterable<Quad>): void {
  for (const item of quads) {
    target.add(item.subject, item.predicate as NamedNode, item.object);
  }
}

/** A stable key for a path, matching `pathlib`'s case-insensitive Windows hash. */
function pathKey(path: Path): string {
  const value = path.toString();
  return IS_WINDOWS ? value.toLowerCase() : value;
}

/** Parse a supported wiki document into the graph. */
function processDocumentFile(
  graph: RdfGraph,
  filePath: Path,
  config: Config,
): void {
  const data = documentDataFromPath(filePath);
  if (data !== null) {
    let body: string | null = null;
    if (
      filePath.suffix.toLowerCase() === ".md" &&
      pyTruthy(config.graph.content_predicate)
    ) {
      const content = readTextTolerant(filePath);
      try {
        body = pyStrip(extract<DataRecord>(content).body);
      } catch (error) {
        if (!(error instanceof LinkedMarkdownError)) throw error;
      }
    }
    addQuads(
      graph,
      frontmatterToGraph(data, config, {
        fileId: routeForDocumentFile(config, filePath),
        body,
        includeFileExtension: config.graph.include_file_extension,
        fileExt: filePath.suffix.toLowerCase(),
      }),
    );
  }

  if (filePath.suffix.toLowerCase() !== ".md") return;

  const content = readTextTolerant(filePath);

  // ` ```turtle ` blocks are the escape hatch for hand-written RDF inside a
  // page, so a malformed one must not take the whole graph down with it.
  for (const match of content.matchAll(/```turtle\s*([\s\S]*?)```/g)) {
    try {
      addQuads(graph, parseTurtle(match[1]!.trim()));
    } catch (error) {
      logger.warning(
        `Failed to parse turtle block in ${filePath.name}: ${String(error)}`,
      );
    }
  }
}

/** File extensions rdflib is asked to parse directly, as format names. */
const EXT_FORMAT_MAP: ReadonlyMap<string, string> = new Map([
  [".ttl", "turtle"],
  [".trig", "trig"],
  [".nt", "nt"],
  [".nq", "nquads"],
  [".rdf", "xml"],
  [".xml", "xml"],
  [".jsonld", "json-ld"],
]);

/** Load every document and RDF file under one input directory. */
async function processInputDir(
  graph: RdfGraph,
  config: Config,
  inputDir: Path,
  documentFiles: ReadonlySet<string>,
): Promise<void> {
  if (!inputDir.exists()) return;
  for (const filePath of sortedRglob(inputDir)) {
    if (!filePath.isFile() || config.isExcluded(filePath)) continue;
    try {
      if (documentFiles.has(pathKey(filePath))) {
        processDocumentFile(graph, filePath, config);
      } else {
        const format = EXT_FORMAT_MAP.get(filePath.suffix.toLowerCase());
        if (format !== undefined) {
          addQuads(
            graph,
            await parseRdf(readTextTolerant(filePath), format),
          );
        }
      }
    } catch (error) {
      // A warning, not a failure: a wiki with one unparseable import is still a
      // wiki, and the oracle's contract is to load the rest of it.
      logger.warning(`Failed to process ${filePath.name}: ${String(error)}`);
    }
  }
}

/** Load asserted triples from all wiki sources without inference. */
async function buildGraphFromWiki(config: Config): Promise<RdfGraph> {
  const graph = new RdfGraph();
  config.bindNamespaces(graph);
  graph.vocab = config.context.vocab;

  const documentFiles = new Set(iterDocumentFiles(config).map(pathKey));
  for (const inputDir of config.wiki.input) {
    await processInputDir(graph, config, inputDir, documentFiles);
  }

  return graph;
}

/** Shared cache controls for {@link loadGraph} and {@link loadDataset}. */
export interface LoadOptions {
  readonly infer?: boolean;
  readonly useCache?: boolean;
  readonly reload?: boolean;
  readonly diskCache?: boolean;
}

/** Cache controls {@link loadQueryGraph} accepts, which excludes `useCache`. */
export interface QueryGraphOptions {
  readonly infer?: boolean;
  readonly reload?: boolean;
  readonly diskCache?: boolean;
}

/**
 * Load wiki sources into a read-only Dataset with stable named graphs.
 *
 * The dataset uses `defaultUnion`, so unscoped SPARQL preserves the umbrella /
 * union behaviour while `GRAPH` clauses can inspect source boundaries.
 */
export async function loadDataset(
  config: Config,
  options: LoadOptions = {},
): Promise<RdfDataset> {
  const infer = options.infer ?? true;
  const useCache = options.useCache ?? true;
  const reload = options.reload ?? false;
  const diskCache = options.diskCache ?? false;

  const {
    clearDiskDataset,
    clearProcessDataset,
    getDiskDataset,
    getProcessDataset,
    setDiskDataset,
    setProcessDataset,
  } = await import("./graph_cache.ts");

  if (reload) {
    clearProcessDataset(config, infer);
    if (diskCache) clearDiskDataset(config, infer);
  } else if (useCache) {
    const cached = getProcessDataset(config, infer);
    if (cached !== null) return cached;
    if (diskCache) {
      const cachedDisk = await getDiskDataset(config, infer);
      if (cachedDisk !== null) {
        setProcessDataset(config, infer, cachedDisk);
        return cachedDisk;
      }
    }
  }

  const dataset = new RdfDataset({ defaultUnion: true });
  config.bindNamespaces(dataset);
  dataset.vocab = config.context.vocab;
  const documentFiles = new Set(iterDocumentFiles(config).map(pathKey));
  const descriptors = graphDescriptors(config);
  const sourceByPath = new Map<string, GraphDescriptor>();
  for (const descriptor of descriptors) {
    if (descriptor.kind !== "source" || descriptor.local_path === null) {
      continue;
    }
    sourceByPath.set(
      descriptor.local_path.resolve().toString(),
      descriptor,
    );
  }
  const rootDescriptor = descriptors[0]!;

  for (const inputDir of config.wiki.input) {
    const descriptor = sourceByPath.get(inputDir.resolve().toString()) ??
      rootDescriptor;
    const graph = dataset.graph(descriptor.uri);
    config.bindNamespaces(graph);
    graph.vocab = config.context.vocab;
    await processInputDir(graph, config, inputDir, documentFiles);
  }

  if (infer) {
    const { applyInference } = await import("./infer.ts");
    // Python iterates `dataset.graphs()`, which includes the (empty) default
    // graph; the port has no default graph to expand, so only named graphs.
    for (const graph of dataset.graphs()) applyInference(graph, config);
  }

  if (useCache) setProcessDataset(config, infer, dataset);
  if (diskCache) setDiskDataset(config, infer, dataset);

  return dataset;
}

/**
 * Load wiki sources into a Graph, reusing the in-process cache when possible.
 *
 * Multiple calls in the same process (many SPARQL blocks, query + render, SHACL
 * checks, serve requests) share one graph build unless `reload` is set.
 */
export async function loadGraph(
  config: Config,
  options: LoadOptions = {},
): Promise<RdfGraph> {
  const infer = options.infer ?? true;
  const useCache = options.useCache ?? true;
  const reload = options.reload ?? false;
  const diskCache = options.diskCache ?? false;

  const {
    clearDiskGraph,
    clearProcessGraph,
    getDiskGraph,
    getProcessGraph,
    setDiskGraph,
    setProcessGraph,
  } = await import("./graph_cache.ts");

  if (reload) {
    clearProcessGraph(config, infer);
    if (diskCache) clearDiskGraph(config, infer);
  } else if (useCache) {
    const cached = getProcessGraph(config, infer);
    if (cached !== null) return cached;
    if (diskCache) {
      const cachedDisk = await getDiskGraph(config, infer);
      if (cachedDisk !== null) {
        setProcessGraph(config, infer, cachedDisk);
        return cachedDisk;
      }
    }
  }

  const graph = await buildGraphFromWiki(config);
  if (infer) {
    const { applyInference } = await import("./infer.ts");
    applyInference(graph, config);
  }

  if (useCache) setProcessGraph(config, infer, graph);
  if (diskCache) setDiskGraph(config, infer, graph);

  return graph;
}

/** Basic statistics about a loaded graph, in the oracle's key order. */
export function graphStats(graph: RdfGraph | RdfDataset): {
  triples: number;
  subjects: number;
  predicates: number;
  objects: number;
} {
  const quads = [...graph];
  const subjects = new Set<string>();
  const predicates = new Set<string>();
  const objects = new Set<string>();
  for (const item of quads) {
    subjects.add(termKey(item.subject));
    predicates.add(termKey(item.predicate));
    objects.add(termKey(item.object));
  }
  return {
    triples: quads.length,
    subjects: subjects.size,
    predicates: predicates.size,
    objects: objects.size,
  };
}
