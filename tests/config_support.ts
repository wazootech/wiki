import { join } from "@std/path";

export const MINIMAL_WIKI_YAML = "wiki:\n  input: [wiki]\n";

/** Run `body` with a fresh temp directory, cleaning up afterwards. */
export function withTempDir(body: (root: string) => void): void {
  const dir = Deno.makeTempDirSync({ prefix: "wiki-config-" });
  try {
    body(dir);
  } finally {
    Deno.removeSync(dir, { recursive: true });
  }
}

/** Write `content` to `root/name` and hand back the file path. */
export function writeFile(root: string, name: string, content: string): string {
  const file = join(root, name);
  Deno.writeTextFileSync(file, content);
  return file;
}

/** Render a path list for comparison, so assertions read like the Python ones. */
export function strings(paths: readonly string[]): string[] {
  return paths.map((path) => path);
}
