import { dirname, join } from "@std/path";
import { isDirectory, pathExists } from "../fspath.ts";
import { errorText } from "../errors.ts";
import { CONFIG_FILENAMES, encoder } from "./options.ts";

export function conflict(root: string): string | null {
  if (CONFIG_FILENAMES.some((name) => pathExists(join(root, name)))) {
    return "wiki.yml/wiki.yaml/wiki.json/wiki.toml already exists. Use a new directory or remove the config file.";
  }
  if (pathExists(join(root, "README.md"))) {
    return "README.md already exists. Use a new directory or remove README.md.";
  }
  const wikiDir = join(root, "wiki");
  if (!pathExists(wikiDir)) return null;
  if (!isDirectory(wikiDir)) {
    return "wiki/ exists and is not a directory. Use a new directory or remove wiki/.";
  }
  if (Deno.readDirSync(wikiDir).next().done === false) {
    return "wiki/ is not empty. Use a new directory or clear wiki/ before init.";
  }
  return null;
}

export function ensureDirectory(path: string, created: string[]): void {
  const missing: string[] = [];
  let current = path;
  while (!pathExists(current)) {
    missing.push(current);
    const parent = dirname(current);
    if (parent === current) {
      throw new Error(`Cannot find an existing parent for ${path}`);
    }
    current = parent;
  }
  if (!isDirectory(current)) {
    throw new Error(`${current} exists and is not a directory`);
  }
  for (const directory of missing.reverse()) {
    try {
      Deno.mkdirSync(directory);
      created.push(directory);
    } catch (error) {
      if (!isDirectory(directory)) throw error;
    }
  }
}

export function writeNewFile(
  path: string,
  text: string,
  created: string[],
): void {
  const file = Deno.openSync(path, { write: true, createNew: true });
  created.push(path);
  try {
    const bytes = encoder.encode(text);
    let offset = 0;
    while (offset < bytes.length) {
      const written = file.writeSync(bytes.subarray(offset));
      if (written === 0) throw new Error(`Could not finish writing ${path}`);
      offset += written;
    }
  } finally {
    file.close();
  }
}

export function removeIfPresent(
  path: string,
  recursive = false,
): string | null {
  try {
    Deno.removeSync(path, { recursive });
    return null;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return null;
    return `${path}: ${errorText(error)}`;
  }
}

export function rollback(paths: readonly string[]): string[] {
  const errors: string[] = [];
  for (const path of [...paths].reverse()) {
    const error = removeIfPresent(path);
    if (error !== null) errors.push(error);
  }
  return errors;
}
