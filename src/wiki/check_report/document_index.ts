import { relative, resolve, SEPARATOR } from "@std/path";
import type { Config } from "../config.ts";
import { ValueError } from "../errors.ts";
import { frontmatterToGraph, resolvePredicate } from "../graph.ts";
import { type DataRecord, documentDataFromPath } from "../parser.ts";
import { iterDocumentFiles, routeForDocumentFile } from "../paths.ts";
import { RDF_TYPE } from "../rdf.ts";
import type { IndexedDocument } from "./types.ts";

/** Document lookups by subject IRI, route, and resolved file path. */
export class DocumentIndex {
  readonly #bySubject = new Map<string, IndexedDocument>();
  readonly #byRoute = new Map<string, IndexedDocument>();
  readonly #byFile = new Map<string, IndexedDocument>();

  constructor(private readonly config: Config) {
    for (const filePath of iterDocumentFiles(config)) this.add(filePath);
  }

  add(filePath: string): IndexedDocument {
    const key = resolve(filePath);
    const known = this.#byFile.get(key);
    if (known !== undefined) return known;

    const route = safeRoute(this.config, filePath);
    const data = documentDataFromPath(filePath);
    // The whole-wiki graph appends the file extension when the config asks;
    // the scoped pass does not. Index both spellings of the subject.
    const subjects = new Set<string>();
    if (data !== null && route !== null) {
      for (const includeFileExtension of [true, false]) {
        const subject = documentSubject(this.config, data, route, filePath, {
          includeFileExtension: includeFileExtension &&
            this.config.graph.include_file_extension,
        });
        if (subject !== null) subjects.add(subject);
      }
    }

    const doc: IndexedDocument = {
      path: displayPath(this.config, filePath),
      route,
      focusNode: subjects.values().next().value ?? null,
      data,
    };
    this.#byFile.set(key, doc);
    if (route !== null && !this.#byRoute.has(route)) {
      this.#byRoute.set(route, doc);
    }
    for (const subject of subjects) {
      if (!this.#bySubject.has(subject)) this.#bySubject.set(subject, doc);
    }
    return doc;
  }

  bySubject(iri: string | null | undefined): IndexedDocument | undefined {
    return iri ? this.#bySubject.get(iri) : undefined;
  }

  byRoute(route: string | null | undefined): IndexedDocument | undefined {
    return route ? this.#byRoute.get(route) : undefined;
  }
}

/** The subject IRI `frontmatterToGraph` gives a document, or `null`. */
function documentSubject(
  config: Config,
  data: DataRecord,
  route: string,
  filePath: string,
  options: { readonly includeFileExtension: boolean },
): string | null {
  const graph = frontmatterToGraph(data, config, {
    fileId: route,
    includeFileExtension: options.includeFileExtension,
    fileExt: filePath.slice(filePath.lastIndexOf(".")).toLowerCase(),
  });
  for (const quad of graph.toArray()) {
    if (
      quad.predicate.value === RDF_TYPE && quad.subject.termType === "NamedNode"
    ) {
      return quad.subject.value;
    }
  }
  return null;
}

function safeRoute(config: Config, filePath: string): string | null {
  try {
    return routeForDocumentFile(config, filePath);
  } catch (error) {
    if (error instanceof ValueError) return null;
    throw error;
  }
}

/** A path relative to the config root with `/` separators. */
export function displayPath(config: Config, filePath: string): string {
  const rel = relative(resolve(config.config_root), resolve(filePath));
  return SEPARATOR === "/" ? rel : rel.split(SEPARATOR).join("/");
}

/**
 * The frontmatter keys that spell a predicate.
 *
 * Keys the document actually carries win: that is the field a form shows. A
 * missing field (`sh:minCount`) has no key in the document, so the candidates
 * are the spellings the context would resolve to the same IRI — the `@vocab`
 * local name, then each `prefix:local` CURIE — checked through the same
 * {@link resolvePredicate} the graph builder uses.
 */
export function frontmatterKeysFor(
  config: Config,
  predicate: string | null | undefined,
  data: DataRecord | null,
): string[] {
  if (!predicate) return [];
  const context = config.context;
  const resolvesTo = (key: string) =>
    resolvePredicate(key, context)?.value === predicate;

  const present = Object.keys(data ?? {}).filter((key) =>
    !key.startsWith("@") && resolvesTo(key)
  );
  if (present.length > 0) return present;

  const candidates: string[] = [];
  if (context.vocab && predicate.startsWith(context.vocab)) {
    candidates.push(predicate.slice(context.vocab.length));
  }
  for (const [prefix, namespace] of context.namespaces) {
    if (prefix !== "" && predicate.startsWith(namespace)) {
      candidates.push(`${prefix}:${predicate.slice(namespace.length)}`);
    }
  }
  return [...new Set(candidates)].filter((key) =>
    key !== "" && resolvesTo(key)
  );
}
