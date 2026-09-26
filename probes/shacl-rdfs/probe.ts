/**
 * Probe: does `rdf-validate-shacl` plus an RDFS closure pass reproduce
 * `pyshacl` with `inference="rdfs"`?
 *
 * The Python engine validates shapes against a graph that has already been
 * closed under RDFS (`audit.py:120,137`). `rdf-validate-shacl` performs no
 * inference of its own, so the port has to close the graph first. This probe
 * measures whether that is actually necessary, by validating the same data
 * twice — raw, then closed — and comparing both against the oracle's report.
 *
 * Run: deno run --allow-read --allow-run --config deno.json probe.ts
 */

import rdf from "@zazuko/env";
import SHACLValidator from "rdf-validate-shacl";
import { parseTurtleQuads } from "@wazoo/sparql-engine/parser";
import type { DatasetCore, Quad, Term } from "@rdfjs/types";

/**
 * Parse with the parser the port itself will use (`@wazoo/sparql-engine`,
 * the spike-verified replacement for `rdflib`) rather than one bundled with the
 * validator, so the probe exercises the real stack.
 */
async function load(path: string): Promise<DatasetCore> {
  const text = await Deno.readTextFile(path);
  const quads = parseTurtleQuads(text) as unknown as Quad[];
  return rdf.dataset(quads) as unknown as DatasetCore;
}

const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
const RDFS_SUBCLASS = "http://www.w3.org/2000/01/rdf-schema#subClassOf";
const RDFS_SUBPROPERTY = "http://www.w3.org/2000/01/rdf-schema#subPropertyOf";
const RDFS_DOMAIN = "http://www.w3.org/2000/01/rdf-schema#domain";
const RDFS_RANGE = "http://www.w3.org/2000/01/rdf-schema#range";

interface Finding {
  readonly focusNode: string;
  readonly resultPath: string;
  readonly constraintComponent: string;
  readonly severity: string;
  readonly message: string;
}

/**
 * Close a dataset under the RDFS fragment that decides SHACL targeting:
 * `rdfs:subClassOf` type propagation, `rdfs:subPropertyOf` propagation, and
 * `rdfs:domain` / `rdfs:range` typing.
 *
 * Deliberately a hand-rolled fixed point rather than a library: the probe is
 * measuring whether this fragment is *sufficient*, so it must be inspectable.
 * The full closure for the port is a separate milestone.
 */
function rdfsClosure(input: DatasetCore): DatasetCore {
  const quads = [...input] as Quad[];
  const subClassOf = new Map<string, Set<string>>();
  const subPropertyOf = new Map<string, Set<string>>();
  const domains = new Map<string, Set<string>>();
  const ranges = new Map<string, Set<string>>();
  const types = new Map<string, Set<string>>();

  const add = (
    index: Map<string, Set<string>>,
    key: string,
    value: string,
  ): boolean => {
    const values = index.get(key) ?? new Set<string>();
    const before = values.size;
    values.add(value);
    index.set(key, values);
    return values.size !== before;
  };

  const subject = (quad: Quad): string => quad.subject.value;
  const object = (quad: Quad): string => quad.object.value;

  for (const quad of quads) {
    const predicate = quad.predicate.value;
    if (predicate === RDFS_SUBCLASS) add(subClassOf, subject(quad), object(quad));
    else if (predicate === RDFS_SUBPROPERTY) {
      add(subPropertyOf, subject(quad), object(quad));
    } else if (predicate === RDFS_DOMAIN) add(domains, subject(quad), object(quad));
    else if (predicate === RDFS_RANGE) add(ranges, subject(quad), object(quad));
    else if (predicate === RDF_TYPE) add(types, subject(quad), object(quad));
  }

  // Transitive closure of the two hierarchies.
  const close = (index: Map<string, Set<string>>): void => {
    let changed = true;
    while (changed) {
      changed = false;
      for (const [from, targets] of [...index]) {
        for (const target of [...targets]) {
          for (const inherited of index.get(target) ?? []) {
            if (add(index, from, inherited)) changed = true;
          }
        }
      }
    }
  };
  close(subClassOf);
  close(subPropertyOf);

  // Sub-property inheritance of domain/range.
  for (const [property, supers] of subPropertyOf) {
    for (const parent of supers) {
      for (const domain of domains.get(parent) ?? []) {
        add(domains, property, domain);
      }
      for (const range of ranges.get(parent) ?? []) {
        add(ranges, property, range);
      }
    }
  }

  const derived: Quad[] = [];
  const factory = rdf;
  const named = (value: string): Term =>
    value.startsWith("_:") ? factory.blankNode(value.slice(2)) : factory.namedNode(value);
  const literal = (value: string): Term => factory.literal(value);

  const emitted = new Set<string>(quads.map((q) => `${q.subject.value}|${q.predicate.value}|${q.object.value}`));
  const emit = (s: Term, p: string, o: Term): void => {
    const key = `${s.value}|${p}|${o.value}`;
    if (emitted.has(key)) return;
    emitted.add(key);
    derived.push(factory.quad(s, factory.namedNode(p), o));
  };

  // `rdfs:subClassOf` propagation on explicit types.
  for (const [node, classes] of types) {
    for (const type of classes) {
      for (const superClass of subClassOf.get(type) ?? []) {
        emit(named(node), RDF_TYPE, named(superClass));
      }
    }
  }

  // domain / range typing for every asserted property.
  for (const quad of quads) {
    const property = quad.predicate.value;
    if (property === RDF_TYPE) continue;
    for (const domain of domains.get(property) ?? []) {
      emit(named(subject(quad)), RDF_TYPE, named(domain));
    }
    if (quad.object.termType === "NamedNode") {
      for (const range of ranges.get(property) ?? []) {
        emit(named(object(quad)), RDF_TYPE, named(range));
      }
    }
  }

  const dataset = rdf.dataset(quads);
  for (const quad of derived) dataset.add(quad);
  return dataset as unknown as DatasetCore;
}

function summarise(report: {
  conforms: boolean;
  results: readonly {
    focusNode: Term;
    resultPath?: Term;
    sourceConstraintComponent: Term;
    severity: Term;
    message?: readonly Term[];
  }[];
}): { conforms: boolean; findings: readonly Finding[] } {
  const findings = report.results.map((result) => ({
    focusNode: result.focusNode.value,
    resultPath: result.resultPath?.value ?? "",
    constraintComponent: result.sourceConstraintComponent.value,
    severity: result.severity.value,
    message: result.message?.map((term) => term.value).join(" ") ?? "",
  })).sort((left, right) =>
    `${left.focusNode}${left.constraintComponent}`.localeCompare(
      `${right.focusNode}${right.constraintComponent}`,
    )
  );
  return { conforms: report.conforms, findings };
}

const data = await load("./data.ttl");
const shapes = await load("./shapes.ttl");

// The engine loads the whole corpus — documents, axioms, and shapes — into one
// graph and extracts the shapes from it, so the `rdfs:subClassOf` axiom declared
// beside the shapes is part of the graph the validator sees. Validating
// `data.ttl` alone would silently make the closure a no-op.
const corpus = rdf.dataset([...data, ...shapes]) as unknown as DatasetCore;
const validator = new SHACLValidator(shapes as never);

/**
 * Show how the validator exposes a single result, so the phase-6 report mapper
 * does not have to guess which accessor carries `sh:resultPath`. `resultPath`
 * came back `undefined` on the top-level result even though the oracle prints a
 * `Result Path` line, so this records what is actually there.
 */
function inspectResult(result: unknown): Record<string, unknown> {
  if (typeof result !== "object" || result === null) return {};
  const source = result as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.getOwnPropertyNames(source).sort()) {
    const value = source[key];
    if (typeof value === "object" && value !== null && "value" in value) {
      out[key] = (value as { value: unknown }).value;
    } else if (Array.isArray(value)) {
      out[key] = `<array:${value.length}>`;
    } else {
      out[key] = typeof value;
    }
  }
  return out;
}

/**
 * Dump the validation report's own quads for the first result.
 *
 * The results are clownface pointers whose useful properties live behind
 * accessors on the prototype, and `resultPath` is not among the ones that
 * resolve — while the oracle prints a `Result Path` line. The report *graph* is
 * the reliable source, so the phase-6 mapper should read predicates from it
 * rather than trusting accessors.
 */
function firstResultQuads(report: unknown): readonly string[] {
  const typed = report as {
    dataset: Iterable<Quad>;
    results: readonly { term: Term }[];
  };
  const first = typed.results[0];
  if (first === undefined) return [];
  return [...typed.dataset]
    .filter((quad) => quad.subject.value === first.term.value)
    .map((quad) => `${quad.predicate.value} = ${quad.object.value}`)
    .sort();
}

const rawReport = await validator.validate(corpus as never) as never;
const raw = summarise(rawReport);
const closure = rdfsClosure(corpus);
const closed = summarise(await validator.validate(closure as never) as never);

const agentTyped = [...closure]
  .filter((quad) =>
    quad.predicate.value === RDF_TYPE &&
    quad.object.value === "https://example.org/probe/Agent"
  )
  .map((quad) => quad.subject.value)
  .sort();

console.log(JSON.stringify(
  {
    corpusTriples: corpus.size,
    closedTriples: closure.size,
    agentTypedAfterClosure: agentTyped,
    firstRawResultShape: inspectResult(
      (rawReport as { results: readonly unknown[] }).results[0],
    ),
    firstRawResultQuads: firstResultQuads(rawReport),
    raw,
    closed,
  },
  null,
  2,
));
