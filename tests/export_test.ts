import { assertEquals, assertStringIncludes } from "@std/assert";
import { Path } from "../src/wiki/fspath.ts";
import {
  normalizeExportFormat,
  normalizeExportMode,
} from "../src/wiki/export.ts";
import { Wiki } from "../src/wiki/wiki.ts";

function setup() {
  const root = Path.of(Deno.makeTempDirSync({ prefix: "wiki-export-" }));
  const wiki = root.joinpath("wiki");
  Deno.mkdirSync(wiki.toString());
  Deno.writeTextFileSync(
    root.joinpath("wiki.yaml").toString(),
    'wiki:\n  input: [wiki]\ngraph:\n  context:\n    "@vocab": https://schema.org/\n    schema: https://schema.org/\n    wiki: https://wiki.example.org/\n',
  );
  const ada = wiki.joinpath("Ada.md");
  Deno.writeTextFileSync(
    ada.toString(),
    "---\nid: wiki:Ada\ntype: schema:Person\nname: Ada\n---\n# Ada\n",
  );
  const bob = wiki.joinpath("Bob.md");
  Deno.writeTextFileSync(
    bob.toString(),
    "---\nid: wiki:Bob\ntype: schema:Person\nname: Bob\n---\n# Bob\n",
  );
  return { root, ada, bob, wiki: Wiki.load(root) };
}

function cleanup(root: Path): void {
  Deno.removeSync(root.toString(), { recursive: true });
}

Deno.test("export normalizes format aliases and defaults unknown API modes to expanded", () => {
  assertEquals(normalizeExportFormat("TURTLE"), "turtle");
  assertEquals(normalizeExportFormat("application/rdf+xml"), "xml");
  assertEquals(normalizeExportFormat("text/n3"), "n3");
  assertEquals(normalizeExportMode("COMPACTED"), "compacted");
  assertEquals(normalizeExportMode("unknown"), "expanded");
});

Deno.test("export emits per-document dictionaries and expanded JSON-LD", async () => {
  const { root, ada, wiki } = setup();
  try {
    const all = await wiki.export();
    assertEquals(all.ok, true);
    const payload = JSON.parse(all.output) as {
      name: string;
      rdf: Record<string, unknown>;
    }[];
    assertEquals(payload.length, 2);
    assertEquals(payload[0]!.name, "Ada.md");
    assertEquals(payload[0]!.rdf.name, "Ada");

    const expanded = await wiki.export([ada], { format: "json-ld" });
    assertEquals(expanded.ok, true);
    const single = JSON.parse(expanded.output) as {
      name: string;
      rdf: Record<string, unknown>[];
    };
    assertEquals(single.name, "Ada.md");
    assertStringIncludes(JSON.stringify(single.rdf), "https://schema.org/name");
  } finally {
    cleanup(root);
  }
});

Deno.test("export compacts JSON-LD and serializes RDF with configured prefixes", async () => {
  const { root, ada, wiki } = setup();
  try {
    const compacted = await wiki.export([ada], {
      format: "json-ld",
      mode: "compacted",
    });
    assertEquals(compacted.ok, true);
    const jsonld = JSON.parse(compacted.output) as {
      rdf: Record<string, unknown>;
    };
    assertEquals(jsonld.rdf["@context"] !== undefined, true);
    assertStringIncludes(JSON.stringify(jsonld.rdf), "schema:name");
    assertStringIncludes(JSON.stringify(jsonld.rdf), "Ada");

    const turtle = await wiki.export([ada], { format: "turtle" });
    assertEquals(turtle.ok, true);
    assertStringIncludes(turtle.output, "schema:name");
    assertStringIncludes(turtle.output, "Ada");
  } finally {
    cleanup(root);
  }
});

Deno.test("export rejects deferred RDF/XML output and raw multi-file exports", async () => {
  const { root, ada, bob, wiki } = setup();
  try {
    const xml = await wiki.export([ada], { format: "xml" });
    assertEquals(xml.ok, false);
    assertStringIncludes(
      xml.error_message ?? "",
      "RDF/XML serialization is deferred",
    );

    const multiple = await wiki.export([ada, bob], { format: "turtle" });
    assertEquals(multiple.ok, false);
    assertStringIncludes(multiple.error_message ?? "", "single FILE");
  } finally {
    cleanup(root);
  }
});

Deno.test("export reports a selected document without metadata", async () => {
  const { root, wiki } = setup();
  try {
    const path = root.joinpath("wiki", "Plain.md");
    Deno.writeTextFileSync(path.toString(), "# Plain\n");
    const result = await wiki.export([path]);
    assertEquals(result.ok, false);
    assertStringIncludes(
      result.error_message ?? "",
      "No valid document metadata",
    );
  } finally {
    cleanup(root);
  }
});
