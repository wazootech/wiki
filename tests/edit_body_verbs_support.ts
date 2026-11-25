import { fromFileUrl, join } from "@std/path";
import { assertEquals } from "@std/assert";
import { Wiki } from "../src/wiki/wiki.ts";

const CLI_ENTRY = fromFileUrl(new URL("../src/wiki/cli.ts", import.meta.url));
const DECODER = new TextDecoder();

/** Shaped like `wazootech/memory`'s `PurchaseShape.md`. */
const PURCHASE_SHAPE = `---
'@type': sh:NodeShape
rdfs:label: PurchaseShape
sh:targetClass: schema:Purchase
sh:property:
  - sh:path: schema:name
    sh:minCount: 1
    sh:maxCount: 1
    sh:datatype: xsd:string
  - sh:path: schema:price
    sh:minCount: 1
    sh:maxCount: 1
    sh:datatype: xsd:double
  - sh:path: schema:priceCurrency
    sh:minCount: 1
    sh:pattern: ^[A-Z]{3}$
  - sh:path: schema:url
    sh:maxCount: 1
---

# PurchaseShape
`;

export const LEDGER = `---
'@type': schema:Purchase
# Keep this entry's price in sync with the invoice.
schema:name: DeepSeek API key
schema:price: 12.00
schema:priceCurrency: USD
---

# DeepSeek API key

Prepaid credits.

## Change log

- 2026-09-14 — Created.

\`\`\`md
## Change log
\`\`\`

## Notes

### Change log

Nested.
`;

export function writeWiki(extra: Record<string, string> = {}): string {
  const root = Deno.makeTempDirSync({ prefix: "wiki-body-verbs-" });
  Deno.mkdirSync(join(root, "wiki"));
  Deno.writeTextFileSync(join(root, "wiki.yml"), "wiki:\n  input: [wiki]\n");
  const pages: Record<string, string> = {
    "PurchaseShape.md": PURCHASE_SHAPE,
    "DeepSeek_(payment).md": LEDGER,
    ...extra,
  };
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

export async function runCli(
  root: string,
  args: readonly string[],
  stdin = "",
): Promise<{ code: number; stdout: string; stderr: string }> {
  const child = new Deno.Command(Deno.execPath(), {
    args: ["run", "--quiet", "--allow-all", CLI_ENTRY, ...args],
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

export const PAGE = "wiki/DeepSeek_(payment).md";

export const HISTORY = `---
'@type': schema:Article
schema:headline: History
---

# History

## Log

- 2026-09-14 — Created.
- 2026-09-15 — Tightened.

## Next

Plans.
`;

export async function patchLog(
  mode: "append" | "prepend",
  content: string,
): Promise<string> {
  const root = writeWiki({ "History.md": HISTORY });
  try {
    const report = await Wiki.load(root).edit({
      ops: [{
        op: "patch",
        path: "wiki/History.md",
        target: { heading: "Log" },
        mode,
        content,
      }],
    }, { apply: true });
    assertEquals(report.status, "applied", JSON.stringify(report.introduced));
    return read(root, "wiki/History.md");
  } finally {
    cleanup(root);
  }
}

export const ARTICLE_SHAPE = `---
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
