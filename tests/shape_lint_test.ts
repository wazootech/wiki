/**
 * Shape-page meta-validation (#306): an ill-formed shape fails `wiki check`.
 *
 * Each case is one way a shape page can validate nothing while `check` stays
 * green, taken from the SHACL Core rules it breaks. The assertions pin the
 * route and the key path in the message, because "which file, which key" is
 * the point of linting frontmatter rather than the compiled graph.
 */

import { dirname, join } from "@std/path";
import { assert, assertEquals } from "@std/assert";
import { runCheck } from "../src/wiki/audit.ts";
import { Config } from "../src/wiki/config.ts";
import { lintShapeDefinitions } from "../src/wiki/shape_lint.ts";

function write(root: string, relative: string, content: string): void {
  const target = join(root, ...relative.split("/"));
  Deno.mkdirSync(dirname(target), { recursive: true });
  Deno.writeTextFileSync(target, content);
}

/** Lint one page in a fresh wiki and return the messages. */
async function lintPage(
  frontmatter: string,
  extra: Record<string, string> = {},
): Promise<string[]> {
  const root = Deno.makeTempDirSync({ prefix: "wiki-shape-lint-" });
  try {
    write(root, "Shape.md", `---\n${frontmatter}---\n`);
    for (const [name, content] of Object.entries(extra)) {
      write(root, name, content);
    }
    const config = new Config({ wiki: { input: [root] } });
    const { definitions, unused } = await lintShapeDefinitions(config);
    return [...definitions, ...unused].map((issue) => issue.message);
  } finally {
    Deno.removeSync(root, { recursive: true });
  }
}

const VALID = `'@type': sh:NodeShape
sh:targetClass: schema:Thing
sh:property:
  - sh:path: schema:status
    sh:minCount: 1
    sh:in: [schema:Open, schema:Shipped]
    sh:nodeKind: sh:IRI
    sh:severity: sh:Warning
  - sh:path:
      sh:alternativePath: [schema:name, [schema:author, schema:name]]
    sh:datatype: xsd:string
`;

Deno.test("a well-formed shape page has no findings", async () => {
  assertEquals(await lintPage(VALID), []);
});

Deno.test("a misspelled sh: key is named with its key path", async () => {
  const messages = await lintPage(`'@type': sh:NodeShape
sh:targetClass: schema:Thing
sh:property:
  - sh:path: schema:name
    sh:patern: "^x$"
`);
  assertEquals(messages.length, 1);
  assert(messages[0]!.startsWith("In Shape: sh:property[0].sh:patern:"));
  assert(messages[0]!.includes("not a property of the SHACL vocabulary"));
});

Deno.test("a misspelled sh: type or value is caught too", async () => {
  // A typo'd type would otherwise hide the page from every shape rule.
  const messages = await lintPage(`'@type': sh:NodeShap
sh:targetClass: schema:Thing
sh:severity: sh:Violaton
`);
  assertEquals(messages.length, 2);
  assert(messages.some((m) => m.startsWith("In Shape: type: sh:NodeShap ")));
  assert(messages.some((m) => m.startsWith("In Shape: sh:severity: ")));
});

Deno.test("a property shape without sh:path fails (SHACL §2.3)", async () => {
  const nested = await lintPage(`'@type': sh:NodeShape
sh:targetClass: schema:Thing
sh:property:
  - sh:minCount: 1
`);
  assertEquals(nested.length, 1);
  assert(nested[0]!.startsWith("In Shape: sh:property[0]: "));
  assert(nested[0]!.includes("exactly one sh:path"));

  const page = await lintPage(`'@type': sh:PropertyShape
sh:minCount: 1
`);
  assertEquals(page.length, 1);
  assert(page[0]!.startsWith("In Shape: sh:path: "));
});

Deno.test("a node shape cannot have sh:path (SHACL §2.2, §4.7.1)", async () => {
  const page = await lintPage(`'@type': sh:NodeShape
sh:targetClass: schema:Thing
sh:path: schema:name
`);
  assertEquals(page.length, 1, page.join("\n"));
  assert(page[0]!.startsWith("In Shape: sh:path: "));
  assert(page[0]!.includes("cannot have sh:path"));

  const viaNode = await lintPage(`'@type': sh:NodeShape
sh:targetClass: schema:Thing
sh:property:
  - sh:path: schema:address
    sh:node:
      sh:path: schema:streetAddress
`);
  assertEquals(viaNode.length, 1, viaNode.join("\n"));
  assert(viaNode[0]!.startsWith("In Shape: sh:property[0].sh:node.sh:path: "));
});

Deno.test("ill-formed property paths fail (SHACL §2.3.1)", async () => {
  const messages = await lintPage(`'@type': sh:NodeShape
sh:targetClass: schema:Thing
sh:property:
  - sh:path:
      sh:alternativePath: [schema:name]
  - sh:path: nope:name
  - sh:path: []
  - sh:path:
      sh:inversePath: schema:knows
      sh:zeroOrMorePath: schema:knows
`);
  const at = (prefix: string) => messages.some((m) => m.startsWith(prefix));
  assert(at("In Shape: sh:property[0].sh:path.sh:alternativePath: "));
  assert(at("In Shape: sh:property[1].sh:path: "), messages.join("\n"));
  assert(at("In Shape: sh:property[2].sh:path: "));
  assert(at("In Shape: sh:property[3].sh:path: "));
  assertEquals(messages.length, 4, messages.join("\n"));
});

Deno.test("a one-member sh:path list is accepted, as the compiler collapses it", async () => {
  assertEquals(
    await lintPage(`'@type': sh:PropertyShape
sh:path: [schema:name]
`),
    [],
  );
});

Deno.test("IRI-valued parameters reject literals (SHACL §2.1, §4)", async () => {
  const messages = await lintPage(`'@type': sh:NodeShape
sh:targetClass: nope:Thing
sh:closed: true
sh:ignoredProperties: [rdf:type, plain text]
sh:property:
  - sh:path: schema:name
    sh:datatype: string
`);
  const at = (prefix: string) => messages.some((m) => m.startsWith(prefix));
  assert(at("In Shape: sh:targetClass: "), messages.join("\n"));
  assert(at("In Shape: sh:ignoredProperties[1]: "));
  assert(at("In Shape: sh:property[0].sh:datatype: "));
  assertEquals(messages.length, 3, messages.join("\n"));
});

Deno.test("sh:nodeKind must be one of the six kinds (SHACL §4.1.3)", async () => {
  const messages = await lintPage(`'@type': sh:PropertyShape
sh:path: schema:url
sh:nodeKind: IRI
`);
  assertEquals(messages.length, 1);
  assert(messages[0]!.startsWith("In Shape: sh:nodeKind: "));
});

Deno.test("a node shape with no target applies to nothing, unless referenced", async () => {
  const orphan = await lintPage(`'@type': sh:NodeShape
sh:property:
  - sh:path: schema:name
    sh:minCount: 1
`);
  assertEquals(orphan.length, 1);
  assert(orphan[0]!.includes("has no target"));

  // Reached through sh:node from another shape: no target of its own needed.
  const referenced = await lintPage(
    `'@type': sh:NodeShape
sh:property:
  - sh:path: schema:name
    sh:minCount: 1
`,
    {
      "Person_Shape.md": `---
'@type': sh:NodeShape
sh:targetClass: schema:Person
sh:property:
  - sh:path: schema:address
    sh:node: wiki:Shape
---
`,
    },
  );
  assertEquals(referenced, []);

  // A shape that is also a class targets its instances implicitly (§2.1.3.1).
  assertEquals(
    await lintPage(`'@type': [sh:NodeShape, rdfs:Class]
sh:property:
  - sh:path: schema:name
`),
    [],
  );
});

Deno.test("non-shape pages are only checked for SHACL vocabulary", async () => {
  assertEquals(
    await lintPage(`type: Person
name: Ada
knowsAbout: [{ name: Topic }]
`),
    [],
  );
});

Deno.test("check reports shape_definition first, and off silences it", async () => {
  const root = Deno.makeTempDirSync({ prefix: "wiki-shape-lint-" });
  try {
    write(
      root,
      "Shape.md",
      `---\n'@type': sh:NodeShape\nsh:targetClass: schema:Thing\nsh:property:\n  - sh:path: schema:name\n    sh:minCont: 1\n---\n`,
    );
    const report = await runCheck(new Config({ wiki: { input: [root] } }));
    assertEquals(report.ok, false);
    assertEquals(report.errors[0]!.code, "shape_definition");
    assert(report.errors[0]!.path!.endsWith("Shape.md"));
    assertEquals(report.errors[0]!.route, "Shape");

    const scoped = await runCheck(new Config({ wiki: { input: [root] } }), {
      filePaths: [join(root, "Shape.md")],
    });
    assert(scoped.errors.some((issue) => issue.code === "shape_definition"));

    const off = await runCheck(
      new Config({
        wiki: { input: [root] },
        check: { shape_definition: "off" },
      }),
    );
    assertEquals(
      off.errors.filter((issue) => issue.code === "shape_definition"),
      [],
    );
  } finally {
    Deno.removeSync(root, { recursive: true });
  }
});

Deno.test("an unused node shape is a shape_unused warning, not an error", async () => {
  const root = Deno.makeTempDirSync({ prefix: "wiki-shape-lint-" });
  try {
    write(
      root,
      "Shape.md",
      `---
'@type': sh:NodeShape
sh:property:
  - sh:path: schema:name
    sh:minCount: 1
---
`,
    );
    const report = await runCheck(new Config({ wiki: { input: [root] } }));
    assertEquals(
      report.errors.filter((issue) => issue.code.startsWith("shape_")),
      [],
    );
    const unused = report.warnings.filter((issue) =>
      issue.code === "shape_unused"
    );
    assertEquals(unused.length, 1);
    assert(unused[0]!.message.includes("has no target"));

    const off = await runCheck(
      new Config({ wiki: { input: [root] }, check: { shape_unused: "off" } }),
    );
    assertEquals(
      off.warnings.filter((issue) => issue.code === "shape_unused"),
      [],
    );

    const strict = await runCheck(
      new Config({ wiki: { input: [root] }, check: { shape_unused: "error" } }),
    );
    assertEquals(strict.ok, false);
    assert(strict.errors.some((issue) => issue.code === "shape_unused"));
  } finally {
    Deno.removeSync(root, { recursive: true });
  }
});

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
