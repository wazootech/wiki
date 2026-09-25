/**
 * A `pathlib.Path`-compatible path value type.
 *
 * Port of the subset of `pathlib` the Python engine relies on. Every ported
 * module speaks in these paths, so the semantics live in exactly one place
 * instead of being re-derived per call site.
 *
 * Three `pathlib` behaviours are load-bearing enough to call out, because
 * getting them wrong silently changes which files a command sees:
 *
 * - **`resolve()` is not `absolute()`.** Python's `resolve()` runs the path
 *   through `os.path.realpath`, so it expands symlinks *and* collapses `..`
 *   even for paths that do not exist. `Deno.realPathSync` throws on a missing
 *   path, so a non-existent path falls back to lexical resolution — identical
 *   output for every case the Python engine hits, but not symlink-expanding for
 *   files that do not exist yet.
 * - **Sort order is case-insensitive on Windows.** `PurePath` orders by
 *   `_str_normcase`, which lower-cases the whole path under a case-insensitive
 *   flavour. Directories are walked and then sorted, so this ordering is
 *   user-visible in reports — `sortPaths` exists so no call site re-invents it.
 * - **`suffix` ignores a leading dot.** `".env"` has no suffix; `"a.tar.gz"` has
 *   `".gz"`. `@std/path`'s `extname` already matches this.
 */

import {
  basename,
  dirname,
  extname,
  isAbsolute,
  join,
  normalize,
  relative,
  resolve,
  SEPARATOR,
} from "@std/path";

/** `true` when the runtime is Windows, where path comparison is case-folded. */
export const IS_WINDOWS = SEPARATOR === "\\";

/** A throwaway handle passed to {@link Path.walk}; unused outside recursion. */
function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** A filesystem path with `pathlib`-shaped accessors. */
export class Path {
  /** The path as given, normalised to native separators but not resolved. */
  readonly value: string;

  constructor(value: string | Path) {
    this.value = value instanceof Path ? value.value : String(value);
  }

  static of(value: string | Path): Path {
    return value instanceof Path ? value : new Path(value);
  }

  /** The final path component, or `""` for the root. */
  get name(): string {
    return basename(this.value);
  }

  /** The path without its final component; `"."` for a bare filename. */
  get parent(): Path {
    const parent = dirname(this.value);
    return new Path(parent === "" ? "." : parent);
  }

  /** The final component's extension, including the dot, or `""`. */
  get suffix(): string {
    return extname(this.value);
  }

  /** The final component without its extension. */
  get stem(): string {
    return basename(this.value, extname(this.value));
  }

  /** The path split into components, dropping separators and a drive letter. */
  get parts(): readonly string[] {
    const parts = this.value.split(/[\\/]+/).filter((part) => part !== "");
    if (parts.length > 0 && /^[A-Za-z]:$/.test(parts[0]!)) parts.shift();
    return parts;
  }

  /** `true` when the path is rooted (a POSIX `/` prefix or a Windows drive). */
  isAbsolute(): boolean {
    return isAbsolute(this.value);
  }

  /** Replace the final component's extension. */
  withSuffix(suffix: string): Path {
    const extension = this.suffix;
    const name = this.name;
    const head = this.value.slice(0, this.value.length - name.length);
    const base = extension === "" ? name : name.slice(0, -extension.length);
    return new Path(`${head}${base}${suffix}`);
  }

  /** Append path components, matching `pathlib`'s join and absolute-reset rules. */
  joinpath(...segments: (string | Path)[]): Path {
    let value = this.value;
    for (const segment of segments) {
      value = join(value, String(segment));
    }
    return new Path(value);
  }

  /** Collapse `.`/`..` and redundant separators without touching the filesystem. */
  normalize(): Path {
    return new Path(normalize(this.value));
  }

  /** Make absolute lexically, matching `Path.absolute()` (no symlink chasing). */
  absolute(): Path {
    return new Path(resolve(this.value));
  }

  /** Expand symlinks and collapse `..`, falling back to lexical resolution. */
  resolve(): Path {
    try {
      return new Path(Deno.realPathSync(this.value));
    } catch {
      return new Path(resolve(this.value));
    }
  }

  /**
   * Make `base`-relative, or raise when the path is not beneath `base`.
   *
   * `pathlib` raises `ValueError` here, and callers rely on that to detect
   * "this file is outside the wiki" — so this throws rather than returning
   * `null`.
   */
  relativeTo(base: string | Path): Path {
    const root = base instanceof Path ? base.value : base;
    const result = relative(root, this.value);
    if (result === "" || result.startsWith("..") || isAbsolute(result)) {
      throw new ValueError(`${this.value} is not in the subpath of ${root}`);
    }
    return new Path(result);
  }

  /** The path with forward slashes, for URLs and route computation. */
  asPosix(): string {
    return this.value.replaceAll("\\", "/");
  }

  /** The path as a string, using native separators. */
  toString(): string {
    return this.value;
  }

  toJSON(): string {
    return this.value;
  }

  /** `true` when the entry exists (a file, directory, or symlink). */
  exists(): boolean {
    try {
      Deno.lstatSync(this.value);
      return true;
    } catch {
      return false;
    }
  }

  /** `true` when the entry exists and is a regular file. */
  isFile(): boolean {
    try {
      return Deno.statSync(this.value).isFile;
    } catch {
      return false;
    }
  }

  /** `true` when the entry exists and is a directory. */
  isDir(): boolean {
    try {
      return Deno.statSync(this.value).isDirectory;
    } catch {
      return false;
    }
  }

  /**
   * `true` when the entry is a symlink.
   *
   * `lstat`, not `stat`: the asset audit's whole job here is to notice the
   * difference between a symlink and its target, because only one of the two is
   * copied into the site.
   */
  isSymlink(): boolean {
    try {
      return Deno.lstatSync(this.value).isSymlink;
    } catch {
      return false;
    }
  }

  /** Read UTF-8 text, tolerating and stripping a leading BOM (wiki#312). */
  readText(): string {
    return stripBom(Deno.readTextFileSync(this.value));
  }

  /** Write UTF-8 text without a BOM. */
  writeText(text: string): void {
    Deno.writeTextFileSync(this.value, text);
  }

  /** Walk the tree, yielding files and directories in sorted order. */
  *walk(): Generator<Path> {
    const entries: { path: Path; isDir: boolean }[] = [];
    for (const entry of Deno.readDirSync(this.value)) {
      if (entry.isSymlink || entry.isFile || entry.isDirectory) {
        entries.push({
          path: this.joinpath(entry.name),
          isDir: entry.isDirectory,
        });
      }
    }
    for (const entry of sortPaths(entries.map((item) => item.path))) {
      yield entry;
      if (entry.isDir()) {
        yield* entry.walk();
      }
    }
  }

  /** Recursively collect every entry, matching `Path.rglob("*")`. */
  rglob(): readonly Path[] {
    return [...this.walk()];
  }
}

/** Stand-in for Python's `ValueError`, so ported code can catch it by name. */
export class ValueError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValueError";
  }
}

/**
 * The parts `pathlib` compares two paths by.
 *
 * `PurePath.__lt__` is `self._parts_normcase < other._parts_normcase` — the
 * *component* list, lower-cased on a case-insensitive flavour — and not the
 * joined string. That distinction is reachable, and the oracle settles it: with
 * both `notes.md` and `notes/inner.md` present, `sorted(...)` puts
 * `notes/inner.md` first (`"notes" < "notes.md"`), where a string comparison
 * puts `notes.md` first because `.` sorts before the separator.
 *
 * Splitting on either separator also normalises what `str(PureWindowsPath)`
 * normalises: a path written `a/b` is the same path as `a\\b`.
 */
function comparisonParts(path: Path): string[] {
  const value = IS_WINDOWS ? path.value.toLowerCase() : path.value;
  return value.split(/[\\/]+/);
}

/**
 * Sort paths the way `pathlib` does.
 *
 * `iter_document_files` sorts a whole tree before anything filters it, `rglob`
 * sorts each directory it walks, and the graph fingerprint sorts its manifest —
 * so this ordering reaches report output *and* a SHA-256 digest.
 */
export function sortPaths(paths: readonly Path[]): Path[] {
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
    // A path that is a prefix of another sorts first: `a` before `a/b`.
    return left.length - right.length;
  });
}

/**
 * `sorted(root.rglob("*"))`, which is how every Python call site spells a walk.
 *
 * Two things are being pinned here. The collected list is sorted as a whole
 * (`sorted(...)` inside a `for` header) rather than by directory walk
 * (`Path.walk`'s own order), and it is sorted the way `pathlib` compares paths —
 * by component, see {@link comparisonParts}. For the wiki's inputs the two
 * agree, and this states the oracle's rule explicitly so a fixture with
 * `notes.md` beside `notes/` cannot quietly depend on which one is used.
 */
export function sortedRglob(root: Path): Path[] {
  return sortPaths(root.rglob());
}

/** `Path("a").joinpath("b")` without the ceremony of constructing a `Path`. */
export function joinPath(...segments: (string | Path)[]): Path {
  const [head = ".", ...rest] = segments;
  return new Path(head).joinpath(...rest);
}
