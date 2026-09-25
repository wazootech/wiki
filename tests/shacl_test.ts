/**
 * The SHACL layer, over the corpus the phase-3b probe built.
 *
 * The fixture is `probes/shacl-rdfs/`'s: a `rdfs:subClassOf` axiom, a shape
 * targeting the superclass, and a shape targeting the class directly, applied
 * to an instance that is never explicitly typed as the superclass. It is
 * adversarial on purpose — the superclass shape can only fire if something
 * performs subclass inference — and the oracle reports three violations over
 * it (`probes/shacl-rdfs/oracle-report.txt`).
 *
 * What this file does *not* assert is the report text. `formatReport`
 * reproduces pyshacl's skeleton but renders terms as N-Triples, because the
 * oracle's rendering is `rdflib`'s `__str__` — `owl:sameAs <self>`,
 * `Literal("1", datatype=xsd:integer)`. Chasing it would be porting the library
 * the migration deletes. The skeleton is asserted line by line here and the
 * parity harness carries the oracle's transcript as a `known` case.
 */

import { assert, assertEquals } from "@std/assert";
import { Config } from "../src/wiki/config.ts";
import { Path } from "../src/wiki/fspath.ts";
import { loadGraph } from "../src/wiki/graph.ts";
import {
  checkShaclAll,
  checkShaclFile,
  formatReport,
  loadShapes,
} from "../src/wiki/shacl.ts";
import { parseTurtle, RDF_FIRST, RdfGraph } from "../src/wiki/rdf.ts";

const SHAPES = `@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix sh: <http://www.w3.org/ns/shacl#> .
@prefix schema: <https://schema.org/> .
@prefix micro: <https://example.org/probe/> .

schema:Person rdfs:subClassOf micro:Agent .

micro:AgentShape a sh:NodeShape ;
    sh:targetClass micro:Agent ;
    sh:property [
        sh:path schema:name ;
        sh:minCount 1 ;
        sh:message "Agent requires schema:name" ;
    ] .

micro:PersonShape a sh:NodeShape ;
    sh:targetClass schema:Person ;
    sh:property [
        sh:path schema:name ;
        sh:minCount 1 ;
        sh:message "Person requires schema:name" ;
    ] .
`;

const DATA = `@prefix schema: <https://schema.org/> .
@prefix micro: <https://example.org/probe/> .
@prefix ex: <https://example.org/probe/> .

ex:alice a schema:Person ;
    schema:name "Alice" .

ex:bob a schema:Person .

ex:dave a micro:Agent .
`;

function tempRoot(): Path {
  return Path.of(Deno.makeTempDirSync({ prefix: "wiki-shacl-" }));
}

function cleanup(root: Path): void {
  try {
    Deno.removeSync(root.toString(), { recursive: true });
  } catch {
    // Windows keeps a handle open long enough to lose this race occasionally.
  }
}

function write(root: Path, relative: string, content: string): Path {
  const target = root.joinpath(...relative.split("/"));
  Deno.mkdirSync(target.parent.toString(), { recursive: true });
  Deno.writeTextFileSync(target.toString(), content);
  return target;
}

/** The probe's config: a `micro:` corpus with SHACL and RDFS prefixes bound. */
function configFor(root: Path): Config {
  return new Config({
    wiki: { input: [root.joinpath("wiki")] },
    config_root: root,
    graph: {
      context: {
        "@vocab": "https://schema.org/",
        schema: "https://schema.org/",
        sh: "http://www.w3.org/ns/shacl#",
        rdf: "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
        rdfs: "http://www.w3.org/2000/01/rdf-schema#",
        micro: "https://example.org/probe/",
        ex: "https://example.org/probe/",
      },
    },
  });
}

function writeCorpus(root: Path): void {
  write(root, "wiki/shapes.ttl", SHAPES);
  write(root, "wiki/data.ttl", DATA);
}

Deno.test("the whole-corpus check finds the probe's three violations", async () => {
  const root = tempRoot();
  try {
    writeCorpus(root);
    const outcome = await checkShaclAll(configFor(root));
    assert(!outcome.conforms);
    // The superclass shape fires for both un-named instances, which is the
    // finding that makes the closure pass unnecessary: `bob` is never typed as
    // an Agent.
    assert(
      outcome.resultsText.includes(
        "Focus Node: <https://example.org/probe/bob>",
      ),
    );
    assert(
      outcome.resultsText.includes(
        "Focus Node: <https://example.org/probe/dave>",
      ),
    );
    assertEquals(
      outcome.resultsText.match(/Constraint Violation in /g)?.length,
      3,
    );
    for (
      const message of [
        "Agent requires schema:name",
        "Person requires schema:name",
      ]
    ) {
      assert(outcome.resultsText.includes(`\tMessage: ${message}`));
    }
  } finally {
    cleanup(root);
  }
});

Deno.test("the report keeps pyshacl's skeleton, line for line", async () => {
  const root = tempRoot();
  try {
    writeCorpus(root);
    const outcome = await checkShaclAll(configFor(root));
    const lines = outcome.resultsText.split("\n");
    assertEquals(lines[0], "Validation Report");
    assertEquals(lines[1], "Conforms: False");
    assertEquals(lines[2], "Results (3):");
    assertEquals(
      lines[3],
      "Constraint Violation in MinCountConstraintComponent (http://www.w3.org/ns/shacl#MinCountConstraintComponent):",
    );
    assert(lines[4]?.startsWith("\tSeverity: "));
    assert(lines[5]?.startsWith("\tSource Shape: "));
    assert(lines[6]?.startsWith("\tFocus Node: "));
    // The result path is the one line the probe concluded had to be read off
    // the report graph. It is a plain accessor — spelled `path`, not
    // `resultPath` — and this line is the regression test for that.
    assert(
      lines[7]?.startsWith("\tResult Path: <https://schema.org/name>"),
      `result path line was ${JSON.stringify(lines[7])}`,
    );
    assert(lines[8]?.startsWith("\tMessage: "));
    assert(outcome.resultsText.endsWith("\n"));
  } finally {
    cleanup(root);
  }
});

Deno.test("a conforming corpus conforms and prints no results", async () => {
  const root = tempRoot();
  try {
    write(root, "wiki/shapes.ttl", SHAPES);
    write(
      root,
      "wiki/data.ttl",
      `@prefix schema: <https://schema.org/> .
@prefix micro: <https://example.org/probe/> .
@prefix ex: <https://example.org/probe/> .

ex:alice a schema:Person ; schema:name "Alice" .
ex:dave a micro:Agent ; schema:name "Dave" .
`,
    );
    const outcome = await checkShaclAll(configFor(root));
    assert(outcome.conforms);
    assertEquals(
      outcome.resultsText,
      "Validation Report\nConforms: True\n",
    );
  } finally {
    cleanup(root);
  }
});

/**
 * The prose branch of {@link checkShaclAll} is unreachable, and this is the
 * test that says so rather than a comment that claims it.
 *
 * `load_graph(context, infer=True)` materialises the OWL 2 RL axiom preamble
 * before it returns — `owl:Thing owl:sameAs owl:Thing`, the XSD datatype
 * declarations, the reflexive properties — so `len(data_graph) == 0` never
 * holds for the corpus `check_shacl_all` validates. Measured against the
 * oracle on a wiki holding one metadata-free page: the Python graph is 106
 * triples and `check_shacl_all` answers `Validation Report\nConforms: True\n`,
 * not the prose. The port has to reproduce that answer, not the message, and
 * the branch stays because deleting a documented oracle branch is a behaviour
 * change the parity gate would have to adjudicate.
 */
Deno.test("an empty corpus still infers the axiom preamble, so it reports", async () => {
  const root = tempRoot();
  try {
    write(root, "wiki/Page.md", "# Page\n");
    const config = configFor(root);
    const graph = await loadGraph(config);
    assert(
      graph.size > 0,
      "the premise of the prose branch: the inferred graph is never empty",
    );
    const outcome = await checkShaclAll(config);
    assert(outcome.conforms);
    assertEquals(outcome.resultsText, "Validation Report\nConforms: True\n");
  } finally {
    cleanup(root);
  }
});

Deno.test("formatReport renders the empty report the way pyshacl does", () => {
  assertEquals(formatReport(true, []), "Validation Report\nConforms: True\n");
});

Deno.test("a single document is validated against the wiki's shapes", async () => {
  const root = tempRoot();
  try {
    writeCorpus(root);
    const shapeOnly = write(
      root,
      "wiki/Dave.md",
      "---\ntype: micro:Agent\n---\nNo name here.\n",
    );
    const outcome = await checkShaclFile(shapeOnly, configFor(root));
    assert(outcome !== null);
    assert(!outcome.conforms);
    assert(outcome.resultsText.includes("Agent requires schema:name"));
  } finally {
    cleanup(root);
  }
});

Deno.test("a document with no metadata is not a conformance failure", async () => {
  const root = tempRoot();
  try {
    writeCorpus(root);
    const conformance = write(root, "wiki/Plain.md", "Just prose.\n");
    assertEquals(await checkShaclFile(conformance, configFor(root)), null);
  } finally {
    cleanup(root);
  }
});

Deno.test("loadShapes follows the property lists it extracts", () => {
  // `sh:property [ ... ]` puts the property shape in a nested block, and a
  // list-valued constraint puts the shapes in an RDF list. Both have to come
  // out of the CONSTRUCT, which is four of its five branches.
  const graph = new RdfGraph();
  const turtle = `
    @prefix sh: <http://www.w3.org/ns/shacl#> .
    @prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
    @prefix schema: <https://schema.org/> .

    <https://example.org/Shape> a sh:NodeShape ;
        sh:targetClass schema:Person ;
        sh:property [ sh:path schema:name ; sh:minCount 1 ] ;
        sh:in ( 1 2 3 ) .
  `;
  for (const quad of parseTurtle(turtle)) graph.addQuad(quad);

  const shapes = loadShapes(graph);
  const predicates = new Set([...shapes].map((quad) => quad.predicate.value));
  assert(predicates.has("http://www.w3.org/ns/shacl#path"));
  assert(predicates.has("http://www.w3.org/ns/shacl#minCount"));
  // The list elements themselves: their `rdf:first` values must be copied, or
  // `sh:in` silently becomes an empty constraint.
  const firsts = [...shapes]
    .filter((quad) => quad.predicate.value === RDF_FIRST)
    .map((quad) => quad.object.value);
  assertEquals(firsts.length, 3);
});

Deno.test("formatReport omits the lines pyshacl omits", () => {
  const text = formatReport(false, [
    {
      term: undefined as never,
      sourceConstraintComponent: {
        termType: "NamedNode",
        value: "http://www.w3.org/ns/shacl#MinCountConstraintComponent",
      } as never,
      focusNode: {
        termType: "NamedNode",
        value: "https://example.org/a",
      } as never,
      message: [{ termType: "Literal", value: "needs a value" } as never],
    },
  ]);
  const lines = text.split("\n");
  assertEquals(
    lines[3],
    "Constraint Violation in MinCountConstraintComponent (http://www.w3.org/ns/shacl#MinCountConstraintComponent):",
  );
  assertEquals(lines[4], "\tSeverity: ");
  assertEquals(lines[5], "\tFocus Node: <https://example.org/a>");
  assertEquals(lines[6], "\tMessage: needs a value");
});
