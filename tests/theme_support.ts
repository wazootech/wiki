import { dirname, join } from "@std/path";
import { Config } from "../src/wiki/theme.ts";

export function tempRoot(): string {
  return Deno.makeTempDirSync({ prefix: "wiki-theme-" });
}

export function write(root: string, relative: string, content: string): string {
  const path = join(root, ...relative.split("/"));
  Deno.mkdirSync(dirname(path), { recursive: true });
  Deno.writeTextFileSync(path, content);
  return path;
}

export function cleanup(root: string): void {
  Deno.removeSync(root, { recursive: true });
}

export function fixtureConfig(root: string): Config {
  write(
    root,
    "wiki/Home.md",
    "---\nheadline: Home\n---\n\n# Home\n\n## Getting Started\n\nSee [Other](Other.md).\n",
  );
  write(root, "wiki/Other.md", "# Other\n");
  write(root, "assets/site.css", "body { color: navy; }\n");
  return Config.forRoot(root, {
    wiki: { input: [join(root, "wiki")], assets: [join(root, "assets")] },
    site: { base_url: "/manual", url_style: "file" },
  });
}
