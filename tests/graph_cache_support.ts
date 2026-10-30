import { join } from "@std/path";
import { Config } from "../src/wiki/config.ts";
import { clearAllProcessGraphs } from "../src/wiki/graph_cache.ts";

/** 2023-11-14T22:13:20Z, a whole second so both sides record the same instant. */
export const PINNED_MTIME = 1_700_000_000;

/** Run `body` with a fresh temp directory, cleaning up afterwards. */
export async function withTempDir(
  body: (root: string) => void | Promise<void>,
): Promise<void> {
  const dir = Deno.makeTempDirSync({ prefix: "wiki-cache-" });
  try {
    await body(dir);
  } finally {
    clearAllProcessGraphs();
    Deno.removeSync(dir, { recursive: true });
  }
}

/** A wiki with one page, plus the config that points at it. */
export function wiki(
  root: string,
  content = "---\ntype: Person\ngivenName: Ada\n---\n",
) {
  const wikiDir = join(root, "wiki");
  Deno.mkdirSync(wikiDir, { recursive: true });
  const page = join(wikiDir, "page.md");
  Deno.writeTextFileSync(page, content);
  return {
    wikiDir,
    page,
    config: Config.forRoot(root, { wiki: { input: [wikiDir] } }),
  };
}
