import { dirname, join } from "@std/path";
import { Config } from "../src/wiki/config.ts";
import { lintShapeDefinitions } from "../src/wiki/shape_lint.ts";

export function write(root: string, relative: string, content: string): void {
  const target = join(root, ...relative.split("/"));
  Deno.mkdirSync(dirname(target), { recursive: true });
  Deno.writeTextFileSync(target, content);
}

/** Lint one page in a fresh wiki and return the messages. */
export async function lintPage(
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

export const VALID = `'@type': sh:NodeShape
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

// ---------------------------------------------------------------------------
// Shapes written in RDF (#342)
// ---------------------------------------------------------------------------

export const TTL_PREFIXES = `@prefix sh: <http://www.w3.org/ns/shacl#> .
@prefix schema: <https://schema.org/> .
@prefix ex: <http://example.org/> .
`;

/** Lint a wiki made of the given files and return the messages per rule. */
export async function lintFiles(
  files: Record<string, string>,
): Promise<{ definitions: string[]; unused: string[] }> {
  const root = Deno.makeTempDirSync({ prefix: "wiki-shape-lint-" });
  try {
    for (const [name, content] of Object.entries(files)) {
      write(root, name, content);
    }
    const config = new Config({ wiki: { input: [root] } });
    const { definitions, unused } = await lintShapeDefinitions(config);
    return {
      definitions: definitions.map((issue) => issue.message),
      unused: unused.map((issue) => issue.message),
    };
  } finally {
    Deno.removeSync(root, { recursive: true });
  }
}
