import { join } from "@std/path";
import { assert, assertEquals } from "@std/assert";
import { runCheck } from "../src/wiki/audit.ts";
import { Config } from "../src/wiki/config.ts";
import { lintFiles, TTL_PREFIXES, write } from "./shape_lint_support.ts";

Deno.test("SHACL is skipped while a shape page is ill-formed", async () => {
  const root = Deno.makeTempDirSync({ prefix: "wiki-shape-lint-" });
  try {
    // The shape is valid SHACL apart from the typo, and Ada violates it.
    write(
      root,
      "Shape.md",
      `---
'@type': sh:NodeShape
sh:targetClass: schema:Person
sh:property:
  - sh:path: schema:email
    sh:minCount: 1
    sh:maxCont: 1
---
`,
    );
    write(
      root,
      "Ada.md",
      `---
type: Person
name: Ada
---
`,
    );
    const config = new Config({ wiki: { input: [root] } });

    for (
      const report of [
        await runCheck(config),
        await runCheck(config, {
          filePaths: [join(root, "Shape.md"), join(root, "Ada.md")],
        }),
      ]
    ) {
      assert(report.errors.some((issue) => issue.code === "shape_definition"));
      assertEquals(
        report.errors.filter((issue) => issue.code === "shacl_violation"),
        [],
      );
      assert(report.warnings.some((issue) => issue.code === "shacl_skipped"));
    }

    // With the typo fixed, SHACL runs and reports Ada.
    write(
      root,
      "Shape.md",
      `---
'@type': sh:NodeShape
sh:targetClass: schema:Person
sh:property:
  - sh:path: schema:email
    sh:minCount: 1
---
`,
    );
    const fixed = await runCheck(new Config({ wiki: { input: [root] } }));
    assert(fixed.errors.some((issue) => issue.code === "shacl_violation"));
    assertEquals(
      fixed.warnings.filter((issue) => issue.code === "shacl_skipped"),
      [],
    );
  } finally {
    Deno.removeSync(root, { recursive: true });
  }
});

Deno.test("a well-formed Turtle shape file has no findings", async () => {
  const result = await lintFiles({
    "Shapes.ttl": `${TTL_PREFIXES}
ex:PersonShape a sh:NodeShape ;
  sh:targetClass schema:Person ;
  sh:property [
    sh:path [ sh:inversePath schema:knows ] ;
    sh:minCount 1 ;
    sh:nodeKind sh:IRI
  ] , [
    sh:path ( schema:author schema:name ) ;
    sh:datatype <http://www.w3.org/2001/XMLSchema#string>
  ] , [
    sh:path [ sh:alternativePath ( schema:name ( schema:author schema:name ) ) ]
  ] ;
  sh:ignoredProperties ( schema:url ) .
`,
  });
  assertEquals(result, { definitions: [], unused: [] });
});

Deno.test("a misspelled sh: term in a .ttl file names the file and the shape", async () => {
  const { definitions } = await lintFiles({
    "Shapes.ttl": `${TTL_PREFIXES}
ex:PersonShape a sh:NodeShape ;
  sh:targetClass schema:Person ;
  sh:property [ sh:path schema:name ; sh:minCont 1 ] .
`,
  });
  assertEquals(definitions.length, 1);
  assert(/^In .*Shapes\.ttl: /.test(definitions[0]!), definitions[0]);
  assert(
    definitions[0]!.includes(
      "<http://example.org/PersonShape> sh:property [ ] sh:minCont",
    ),
    definitions[0],
  );
  assert(definitions[0]!.includes("not a property of the SHACL vocabulary"));
});

Deno.test("a fenced turtle block is linted under its page's route", async () => {
  const { definitions } = await lintFiles({
    "Person_Shape.md": [
      "# Person shape",
      "",
      "```turtle",
      TTL_PREFIXES,
      "ex:PersonShape a sh:NodeShape ;",
      "  sh:targetClass schema:Person ;",
      "  sh:property [ sh:minCount 1 ] .",
      "```",
      "",
    ].join("\n"),
  });
  assertEquals(definitions.length, 1);
  assert(
    definitions[0]!.startsWith(
      "In Person_Shape (turtle block 1): <http://example.org/PersonShape> sh:property [ ]: ",
    ),
    definitions[0],
  );
  assert(definitions[0]!.includes("needs exactly one sh:path, found 0"));
});

Deno.test("Turtle shapes break the same path and parameter rules", async () => {
  const { definitions } = await lintFiles({
    "Shapes.ttl": `${TTL_PREFIXES}
ex:S a sh:NodeShape ;
  sh:targetClass "Person" ;
  sh:path schema:name ;
  sh:property [ sh:path ( schema:name ) ] ,
    [ sh:path [ sh:alternativePath ( schema:name ) ] ] ,
    [ sh:path "name" ] ,
    [ sh:path [ sh:inversePath schema:knows ; sh:zeroOrOnePath schema:knows ] ] ,
    [ sh:path schema:name ; sh:nodeKind sh:Thing ] ,
    [ sh:path schema:name ; sh:path schema:alternateName ] ;
  sh:ignoredProperties ( "url" ) .
`,
  });
  const expect = [
    'sh:targetClass: "Person" is not an IRI',
    "<http://example.org/S> sh:path: a node shape cannot have sh:path",
    "a sequence path is a list of at least two paths",
    "sh:alternativePath takes a list of at least two paths",
    '"name" is not an IRI, so it is not a property path',
    "a complex path is a blank node with exactly one triple",
    "sh:Thing is not a term of the SHACL vocabulary",
    "sh:Thing is not one of the six node kinds",
    "needs exactly one sh:path, found 2",
    '"url" is not an IRI (SHACL §4.8.1)',
  ];
  for (const fragment of expect) {
    assert(
      definitions.some((message) => message.includes(fragment)),
      `missing "${fragment}" in:\n${definitions.join("\n")}`,
    );
  }
});

Deno.test("an unused Turtle node shape is shape_unused, unless referenced", async () => {
  const orphan = await lintFiles({
    "Shapes.ttl": `${TTL_PREFIXES}
ex:AddressShape a sh:NodeShape ;
  sh:property [ sh:path schema:streetAddress ; sh:minCount 1 ] .
`,
  });
  assertEquals(orphan.definitions, []);
  assertEquals(orphan.unused.length, 1);
  assert(
    /^In .*Shapes\.ttl: <http:\/\/example\.org\/AddressShape>: /.test(
      orphan.unused[0]!,
    ),
    orphan.unused[0],
  );

  // Referenced from a frontmatter shape page elsewhere in the wiki.
  const referenced = await lintFiles({
    "Shapes.ttl": `${TTL_PREFIXES}
ex:AddressShape a sh:NodeShape ;
  sh:property [ sh:path schema:streetAddress ; sh:minCount 1 ] .
`,
    "Person_Shape.md": `---
'@type': sh:NodeShape
sh:targetClass: schema:Person
sh:property:
  - sh:path: schema:address
    sh:node: { '@id': 'http://example.org/AddressShape' }
---
`,
  });
  assertEquals(referenced, { definitions: [], unused: [] });
});

Deno.test("RDF without SHACL terms is not linted", async () => {
  assertEquals(
    await lintFiles({
      "data.ttl": `${TTL_PREFIXES}
ex:ada a schema:Person ; schema:name "Ada" .
`,
    }),
    { definitions: [], unused: [] },
  );
});

Deno.test("check reports Turtle shape errors and skips SHACL", async () => {
  const root = Deno.makeTempDirSync({ prefix: "wiki-shape-lint-" });
  try {
    write(
      root,
      "Shapes.ttl",
      `${TTL_PREFIXES}
ex:PersonShape a sh:NodeShape ;
  sh:targetClass schema:Person ;
  sh:property [ sh:path schema:email ; sh:minCount 1 ; sh:maxCont 1 ] .
`,
    );
    write(root, "Ada.md", `---\ntype: Person\nname: Ada\n---\n`);
    const report = await runCheck(new Config({ wiki: { input: [root] } }));
    const shape = report.errors.filter((issue) =>
      issue.code === "shape_definition"
    );
    assertEquals(shape.length, 1);
    assert(shape[0]!.path!.endsWith("Shapes.ttl"));
    assertEquals(shape[0]!.route, null);
    assert(report.warnings.some((issue) => issue.code === "shacl_skipped"));

    // Scoped to another file, the .ttl source is not linted.
    const scoped = await runCheck(new Config({ wiki: { input: [root] } }), {
      filePaths: [join(root, "Ada.md")],
    });
    assertEquals(
      scoped.errors.filter((issue) => issue.code === "shape_definition"),
      [],
    );
  } finally {
    Deno.removeSync(root, { recursive: true });
  }
});

Deno.test("a nested complex path in a turtle block stays linked (sparql-engine#210)", async () => {
  // sparql-engine 0.4.2 linked `sh:property` to the inner `[ sh:inversePath ]`
  // node, so the property shape lost its path and this page failed the lint.
  const result = await lintFiles({
    "Person_Shape.md": [
      "```turtle",
      TTL_PREFIXES,
      "ex:PersonShape a sh:NodeShape ;",
      "  sh:targetClass schema:Person ;",
      "  sh:property [ sh:path [ sh:inversePath schema:knows ] ; sh:minCount 1 ] .",
      "```",
      "",
    ].join("\n"),
  });
  assertEquals(result, { definitions: [], unused: [] });
});
