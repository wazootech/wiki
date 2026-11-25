import { dirname, join } from "@std/path";
import { pathExists } from "../src/wiki/fspath.ts";
import { Config } from "../src/wiki/config.ts";

export function tempRoot(): string {
  return Deno.makeTempDirSync({ prefix: "wiki-links-" });
}

export function cleanup(root: string): void {
  try {
    Deno.removeSync(root, { recursive: true });
  } catch {
    // Windows keeps a handle open long enough to lose this race occasionally.
  }
}

/** Write a file below `root`, creating parent directories. */
export function write(root: string, relative: string, content: string): string {
  const target = join(root, ...relative.split("/"));
  Deno.mkdirSync(dirname(target), { recursive: true });
  Deno.writeTextFileSync(target, content);
  return target;
}

export function configFor(root: string): Config {
  return new Config({
    wiki: {
      input: [join(root, "wiki")],
      ...(pathExists(join(root, "assets"))
        ? { assets: [join(root, "assets")] }
        : {}),
    },
    config_root: root,
  });
}
