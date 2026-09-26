import {
  basename,
  isAbsolute,
  join,
  relative,
  resolve,
  SEPARATOR,
} from "@std/path";
import { ValueError } from "./errors.ts";

export const IS_WINDOWS = SEPARATOR === "\\";

export function pathExists(path: string): boolean {
  try {
    Deno.lstatSync(path);
    return true;
  } catch {
    return false;
  }
}

export function isFile(path: string): boolean {
  try {
    return Deno.statSync(path).isFile;
  } catch {
    return false;
  }
}

export function isDirectory(path: string): boolean {
  try {
    return Deno.statSync(path).isDirectory;
  } catch {
    return false;
  }
}

export function isSymlink(path: string): boolean {
  try {
    return Deno.lstatSync(path).isSymlink;
  } catch {
    return false;
  }
}

export function readText(path: string): string {
  const text = Deno.readTextFileSync(path);
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function resolveForContainment(path: string): string {
  const absolute = resolve(path);
  try {
    return Deno.realPathSync(absolute);
  } catch {
    let cursor = absolute;
    const missing: string[] = [];
    while (true) {
      missing.unshift(basename(cursor));
      const parent = resolve(cursor, "..");
      if (parent === cursor) return absolute;
      try {
        return join(Deno.realPathSync(parent), ...missing);
      } catch {
        cursor = parent;
      }
    }
  }
}

export function relativeWithin(path: string, base: string): string {
  const candidate = resolveForContainment(path);
  const root = resolveForContainment(base);
  const result = relative(root, candidate);
  if (result === "" || /^\.\.(?:[\\/]|$)/.test(result) || isAbsolute(result)) {
    throw new ValueError(`${path} is not in the subpath of ${base}`);
  }
  return result;
}

function comparisonParts(path: string): string[] {
  const value = IS_WINDOWS ? path.toLowerCase() : path;
  return value.split(/[\\/]+/);
}

export function sortPathsByComponent(paths: readonly string[]): string[] {
  return [...paths].sort((a, b) => {
    const left = comparisonParts(a);
    const right = comparisonParts(b);
    const shared = Math.min(left.length, right.length);
    for (let index = 0; index < shared; index++) {
      const leftPart = left[index]!;
      const rightPart = right[index]!;
      if (leftPart < rightPart) return -1;
      if (leftPart > rightPart) return 1;
    }
    return left.length - right.length;
  });
}

export function walkTree(root: string): string[] {
  const paths: string[] = [];
  const visit = (directory: string): void => {
    const entries = [...Deno.readDirSync(directory)].filter((entry) =>
      entry.isSymlink || entry.isFile || entry.isDirectory
    );
    const byPath = new Map<string, Deno.DirEntry>();
    for (const entry of entries) byPath.set(join(directory, entry.name), entry);
    for (const path of sortPathsByComponent([...byPath.keys()])) {
      paths.push(path);
      if (byPath.get(path)?.isDirectory) visit(path);
    }
  };
  visit(root);
  return paths;
}

export function sortedTreePaths(root: string): string[] {
  return sortPathsByComponent(walkTree(root));
}
