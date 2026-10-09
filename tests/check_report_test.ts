/**
 * `wiki check -f json` — the structured check report (#310).
 *
 * The payload is a data contract an editor form and CI read instead of the text
 * report, so these tests pin its field names as well as its values, and run the
 * real CLI to cover the process contract: JSON alone on stdout, the text report
 * still on stderr, and the exit code unchanged.
 */

import { fromFileUrl, join } from "@std/path";
import { assert, assertEquals } from "@std/assert";
import { EXIT_FAILURE, EXIT_OK, EXIT_USAGE } from "../src/wiki/cli.ts";
import type { CheckEnvelope } from "../src/wiki/check_report.ts";

const CLI_ENTRY = fromFileUrl(new URL("../src/wiki/cli.ts", import.meta.url));
const DECODER = new TextDecoder();
const SCHEMA = "https://schema.org/";
const SH = "http://www.w3.org/ns/shacl#";

const ARTICLE_SHAPE = `---
'@type': sh:NodeShape
rdfs:label: Article Shape
sh:targetClass: schema:Article
sh:property:
  - sh:path: schema:description
    sh:minCount: 1
    sh:message: Article must have a description.
  - sh:path: schema:headline
    sh:minCount: 1
    sh:message: Article must have a headline.
---
`;

const APP_SHAPE = `---
'@type': sh:NodeShape
rdfs:label: App Shape
sh:targetClass: schema:SoftwareApplication
sh:property:
  - sh:path: schema:headline
    sh:minCount: 1
    sh:message: App must have a headline.
---
`;

function writeVault(pages: Record<string, string>): string {
  const root = Deno.makeTempDirSync({ prefix: "wiki-check-json-" });
  Deno.mkdirSync(join(root, "wiki"));
  Deno.writeTextFileSync(join(root, "wiki.yml"), "wiki:\n  input: [wiki]\n");
  for (const [name, content] of Object.entries(pages)) {
    Deno.writeTextFileSync(join(root, name), content);
  }
  return root;
}

async function check(
  root: string,
  args: readonly string[],
): Promise<{ code: number; stdout: string; stderr: string }> {
  const { code, stdout, stderr } = await new Deno.Command(Deno.execPath(), {
    args: ["run", "--quiet", "--allow-all", CLI_ENTRY, "check", ...args],
    cwd: root,
    stdout: "piped",
    stderr: "piped",
  }).output();
  return {
    code,
    stdout: DECODER.decode(stdout),
    stderr: DECODER.decode(stderr),
  };
}

const RESULT_KEYS = [
  "check",
  "code",
  "frontmatterKeys",
  "instancePath",
  "keyword",
  "message",
  "resultPath",
  "schema",
  "severity",
  "shaclSeverity",
  "sourceConstraintComponent",
  "sourceShapes",
  "value",
];

Deno.test(
  "check -f json reports each missing field with its key, constraint, and named shape",
  { permissions: { run: true, read: true, write: true } },
  async () => {
    const root = writeVault({
      "wiki/Article_Shape.md": ARTICLE_SHAPE,
      "wiki/CSS.md": "---\ntype: schema:Article\nname: CSS\n---\n",
    });
    try {
      const result = await check(root, ["-f", "json", "wiki/CSS.md"]);
      assertEquals(result.code, EXIT_FAILURE);
      assert(result.stderr.includes("Results (2):"), result.stderr);

      const payload = JSON.parse(result.stdout) as CheckEnvelope;
      assertEquals(Object.keys(payload).sort(), ["documents", "issues", "ok"]);
      assertEquals(payload.ok, false);
      assertEquals(payload.documents.length, 1);

      const [doc] = payload.documents;
      assertEquals(
        Object.keys(doc!).sort(),
        ["conforms", "focusNode", "path", "results", "route"],
      );
      assertEquals(doc!.path, "wiki/CSS.md");
      assertEquals(doc!.route, "CSS");
      assertEquals(doc!.focusNode, "https://wiki.example.org/CSS");
      assertEquals(doc!.conforms, false);
      assertEquals(doc!.results.length, 2);

      const [first, second] = doc!.results;
      assertEquals(Object.keys(first!).sort(), RESULT_KEYS);
      assertEquals(first!.code, "shacl_violation");
      assertEquals(first!.check, "shacl");
      assertEquals(first!.resultPath, `${SCHEMA}description`);
      assertEquals(first!.frontmatterKeys[0], "description");
      assertEquals(first!.message, "Article must have a description.");
      assertEquals(
        first!.sourceConstraintComponent,
        `${SH}MinCountConstraintComponent`,
      );
      assertEquals(first!.sourceShapes, [{
        iri: "https://wiki.example.org/Article_Shape",
        route: "Article_Shape",
        path: "wiki/Article_Shape.md",
        targetClass: [`${SCHEMA}Article`],
        label: "Article Shape",
      }]);
      assertEquals(first!.value, null);
      assertEquals(second!.resultPath, `${SCHEMA}headline`);

      assertEquals(payload.issues.length, 1);
      assertEquals(payload.issues[0]!.code, "shacl_violation");
      assertEquals(payload.issues[0]!.path, "wiki/CSS.md");
    } finally {
      Deno.removeSync(root, { recursive: true });
    }
  },
);

Deno.test(
  "check --json attributes a shared path to the shape that declared it",
  { permissions: { run: true, read: true, write: true } },
  async () => {
    const root = writeVault({
      "wiki/Article_Shape.md": ARTICLE_SHAPE,
      "wiki/App_Shape.md": APP_SHAPE,
      "wiki/Both.md":
        "---\ntype: [schema:Article, schema:SoftwareApplication]\nheadline: Both\n---\n",
    });
    try {
      const result = await check(root, ["--json", "wiki/Both.md"]);
      assertEquals(result.code, EXIT_FAILURE);
      const payload = JSON.parse(result.stdout) as CheckEnvelope;
      const results = payload.documents[0]!.results;
      assertEquals(results.length, 1);
      assertEquals(results[0]!.resultPath, `${SCHEMA}description`);
      assertEquals(
        results[0]!.sourceShapes.map((shape) => shape.route),
        ["Article_Shape"],
      );
    } finally {
      Deno.removeSync(root, { recursive: true });
    }
  },
);

Deno.test(
  "check -f json on a conforming document is a well-formed passing payload",
  { permissions: { run: true, read: true, write: true } },
  async () => {
    const root = writeVault({
      "wiki/Article_Shape.md": ARTICLE_SHAPE,
      "wiki/Good.md":
        "---\ntype: schema:Article\nheadline: Ok\ndescription: Ok\n---\n",
    });
    try {
      const result = await check(root, ["--format=json", "wiki/Good.md"]);
      assertEquals(result.code, EXIT_OK);
      assertEquals(result.stderr, "");
      assertEquals(JSON.parse(result.stdout), {
        ok: true,
        documents: [{
          path: "wiki/Good.md",
          route: "Good",
          focusNode: "https://wiki.example.org/Good",
          conforms: true,
          results: [],
        }],
        issues: [],
      });
    } finally {
      Deno.removeSync(root, { recursive: true });
    }
  },
);

Deno.test(
  "check -f json over the whole wiki maps focus nodes back to documents",
  { permissions: { run: true, read: true, write: true } },
  async () => {
    const root = writeVault({
      "wiki/Article_Shape.md": ARTICLE_SHAPE,
      "wiki/CSS.md": "---\ntype: schema:Article\nheadline: CSS\n---\n",
      "wiki/Good.md":
        "---\ntype: schema:Article\nheadline: Ok\ndescription: Ok\n---\n",
    });
    try {
      const result = await check(root, ["-f", "json"]);
      assertEquals(result.code, EXIT_FAILURE);
      const payload = JSON.parse(result.stdout) as CheckEnvelope;
      assertEquals(payload.documents.map((doc) => doc.path), ["wiki/CSS.md"]);
      const [only] = payload.documents[0]!.results;
      assertEquals(only!.frontmatterKeys[0], "description");
      assertEquals(only!.sourceShapes[0]!.route, "Article_Shape");
    } finally {
      Deno.removeSync(root, { recursive: true });
    }
  },
);

Deno.test(
  "check -f json carries JSON Schema failures with their code and instance path",
  { permissions: { run: true, read: true, write: true } },
  async () => {
    const root = writeVault({
      "thing.schema.json": JSON.stringify({
        type: "object",
        properties: { name: { type: "string", minLength: 5 } },
      }),
      "wiki/Thing.md":
        "---\ntype: schema:Thing\nname: abc\nwazoo:jsonSchema: thing.schema.json\n---\n",
    });
    try {
      const result = await check(root, ["-f", "json", "wiki/Thing.md"]);
      assertEquals(result.code, EXIT_FAILURE);
      const payload = JSON.parse(result.stdout) as CheckEnvelope;
      const [issue] = payload.issues;
      assertEquals(issue!.code, "frontmatter_schema");
      assert(result.stderr.includes(issue!.message), result.stderr);

      const [found] = payload.documents[0]!.results;
      assertEquals(found!.check, "jsonSchema");
      assertEquals(found!.code, "frontmatter_schema");
      assertEquals(found!.schema, "thing.schema.json");
      assertEquals(found!.instancePath, ["name"]);
      assertEquals(found!.frontmatterKeys, ["name"]);
      assertEquals(found!.keyword, "minLength");
    } finally {
      Deno.removeSync(root, { recursive: true });
    }
  },
);

Deno.test(
  "check rejects an unknown --format value as a usage error",
  { permissions: { run: true, read: true, write: true } },
  async () => {
    const root = writeVault({});
    try {
      const result = await check(root, ["-f", "xml"]);
      assertEquals(result.code, EXIT_USAGE);
      assertEquals(result.stdout, "");
      assert(
        result.stderr.includes("'xml' is not one of 'text', 'json'."),
        result.stderr,
      );
    } finally {
      Deno.removeSync(root, { recursive: true });
    }
  },
);
