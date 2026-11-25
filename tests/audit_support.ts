import { dirname, join } from "@std/path";

function tempRoot(): string {
  return Deno.makeTempDirSync({ prefix: "wiki-audit-" });
}

function cleanup(root: string): void {
  try {
    Deno.removeSync(root, { recursive: true });
  } catch {
    // Windows keeps a handle open long enough to lose this race occasionally.
  }
}

export function write(root: string, relative: string, content: string): string {
  const target = join(root, ...relative.split("/"));
  Deno.mkdirSync(dirname(target), { recursive: true });
  Deno.writeTextFileSync(target, content);
  return target;
}

/** Run `body` against a fresh temp root and always clean it up. */
export function withRoot(
  run: (root: string) => void | Promise<void>,
): Promise<void> {
  const root = tempRoot();
  return Promise.resolve(run(root)).finally(() => cleanup(root));
}

export const PAGE_FRONTMATTER = "---\ntype: TechArticle\n---\n";

/*
 * The four `_run_check` tests, moved from `tests/test_frontmatter_schema.py`.
 * They need a schema that binds a type, a shape document that points at it, and
 * a page that fails it — which is the same fixture for all four, so it is built
 * once here.
 */

export function writeSchema(
  root: string,
  relative: string,
  schema: unknown,
): void {
  write(root, relative, `${JSON.stringify(schema, null, 2)}\n`);
}

export const ARTICLE_SCHEMA = {
  type: "object",
  required: ["headline", "description"],
  properties: {
    headline: { type: "string" },
    description: { type: "string" },
  },
};

/** A wiki whose `Broken.md` fails a required-field schema, and a missing ref. */
export function writeSeverityFixture(root: string): string {
  const wiki = join(root, "wiki");
  Deno.mkdirSync(wiki, { recursive: true });
  writeSchema(root, "schemas/article.json", ARTICLE_SCHEMA);
  write(
    root,
    "wiki/Article_Shape.md",
    "---\n" +
      "type: sh:NodeShape\n" +
      "sh:targetClass: schema:TechArticle\n" +
      "wazoo:jsonSchema: schemas/article.json\n" +
      "---\n",
  );
  write(
    root,
    "wiki/Gadget_Shape.md",
    "---\n" +
      "type: sh:NodeShape\n" +
      "sh:targetClass: schema:Product\n" +
      "wazoo:jsonSchema: schemas/missing.json\n" +
      "---\n",
  );
  write(
    root,
    "wiki/Broken.md",
    "---\ntype: TechArticle\nheadline: Only\n---\n",
  );
  write(
    root,
    "wiki/Product.md",
    "---\ntype: schema:Product\nname: Gadget\n---\n",
  );
  return wiki;
}

/** `AuditReport.messages()` flattened, as the Python helpers do it. */
export function issueMessages(report: {
  messages(): [string[], string[]];
}): string[] {
  const [errors, warnings] = report.messages();
  return [...errors, ...warnings];
}
