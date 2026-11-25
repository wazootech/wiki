import { fromFileUrl, join } from "@std/path";
import type { Wiki } from "../src/wiki/wiki.ts";

const CLI_ENTRY = fromFileUrl(new URL("../src/wiki/cli.ts", import.meta.url));
const DECODER = new TextDecoder();

const ARTICLE_SHAPE = `---
'@type': sh:NodeShape
rdfs:label: Article Shape
sh:targetClass: schema:Article
sh:property:
  - sh:path: schema:headline
    sh:minCount: 1
    sh:message: Article must have a headline.
---

# Article Shape
`;

export const GOOD = `---
'@type': schema:Article
schema:headline: Good
---

# Good

Links to [Other](Other.md).
`;

export const OTHER = `---
'@type': schema:Article
schema:headline: Other
---

# Other
`;

/**
 * Already broken before any edit: no headline. It has no H1 either, because an
 * H1 supplies a derived `schema:headline` that satisfies the shape (wiki#318).
 */
export const BROKEN = `---
'@type': schema:Article
---

No title here.
`;

/** GOOD with no headline at all: neither the frontmatter key nor the H1. */
export const HEADLESS = GOOD.replace("schema:headline: Good\n", "").replace(
  "# Good\n\n",
  "",
);

export function writeWiki(): string {
  const root = Deno.makeTempDirSync({ prefix: "wiki-edit-" });
  const pages: Record<string, string> = {
    "Article_Shape.md": ARTICLE_SHAPE,
    "Good.md": GOOD,
    "Other.md": OTHER,
    "Broken.md": BROKEN,
  };
  Deno.mkdirSync(join(root, "wiki"));
  Deno.writeTextFileSync(join(root, "wiki.yml"), "wiki:\n  input: [wiki]\n");
  for (const [name, content] of Object.entries(pages)) {
    Deno.writeTextFileSync(join(root, "wiki", name), content);
  }
  return root;
}

export function cleanup(root: string): void {
  try {
    Deno.removeSync(root, { recursive: true });
  } catch {
    // Windows keeps a handle open long enough to lose this race occasionally.
  }
}

export function read(root: string, rel: string): string {
  return Deno.readTextFileSync(join(root, ...rel.split("/")));
}

export function exists(root: string, rel: string): boolean {
  try {
    Deno.statSync(join(root, ...rel.split("/")));
    return true;
  } catch {
    return false;
  }
}

/** One element of `Wiki.edit`'s `ops`, for deliberately malformed input. */
export type EditOpInput = Parameters<Wiki["edit"]>[0]["ops"][number];

export async function runEdit(
  root: string,
  args: readonly string[],
  stdin: string,
): Promise<{ code: number; stdout: string; stderr: string }> {
  const child = new Deno.Command(Deno.execPath(), {
    args: ["run", "--quiet", "--allow-all", CLI_ENTRY, "edit", ...args],
    cwd: root,
    stdin: "piped",
    stdout: "piped",
    stderr: "piped",
  }).spawn();
  const writer = child.stdin.getWriter();
  await writer.write(new TextEncoder().encode(stdin));
  await writer.close();
  const { code, stdout, stderr } = await child.output();
  return {
    code,
    stdout: DECODER.decode(stdout),
    stderr: DECODER.decode(stderr),
  };
}
