/**
 * `fnmatch.fnmatchcase` port.
 *
 * `Config.is_excluded` decides which files a command may see, and it does so
 * with `fnmatch.fnmatchcase` — so this translation table *is* the include
 * policy. Two properties are easy to get wrong with a general-purpose glob
 * matcher and are therefore reproduced deliberately:
 *
 * - **`*` matches `/`.** `fnmatch` is not a pathname glob: `**` and `*` are the
 *   same pattern, so `wiki/drafts/*` excludes `wiki/drafts/a/b.md` too.
 *   `@std/path`'s `globToRegExp` is the opposite (a `*` stops at a separator),
 *   which is why it is not used here.
 * - **`*` matches newlines.** Python compiles with `(?s)`, so `.*` crosses line
 *   breaks; JavaScript needs the `s` flag for the same meaning.
 *
 * The oracle emits the Python 3.12 `fnmatch.translate` form — `(?s:…)\Z` with
 * `(?>…)` atomic-group optimisations for a globstar-then-separator prefix.
 * Those are performance
 * rewrites, not semantic ones: refusing to re-enter the atomic group is safe
 * only because the emitted form still requires a literal separator, which is
 * exactly what the unoptimised translation does. The corpus in
 * `probes/fnmatch` pins that down: the pattern `wiki/**` followed by `/*.md`
 * must *reject* `wiki/x.md`, because the separator next to the stars is a
 * literal character rather than an optional one.
 *
 * A third property is not a property at all but a bug to reproduce: Python
 * "fixes up" a bracket expression before compiling it, dropping inverted ranges
 * (`[z-a]`) and therefore turning them into a pattern that matches *nothing*.
 * `translateClass` ports that fix-up rather than passing `[z-a]` through to
 * JavaScript, which would reject it outright — and `probes/fnmatch` pins the
 * never-matching verdict so the faithfulness is checked, not assumed.
 */

/** Translate an `fnmatch` pattern to an anchored JavaScript regex source. */
export function fnmatchTranslate(pattern: string): string {
  let result = "";
  let index = 0;
  const length = pattern.length;
  while (index < length) {
    const char = pattern[index]!;
    index += 1;
    if (char === "*") {
      // Consecutive stars collapse: `**` means the same thing as `*`.
      if (!result.endsWith(".*")) result += ".*";
    } else if (char === "?") {
      result += ".";
    } else if (char === "[") {
      let scan = index;
      if (scan < length && pattern[scan] === "!") scan += 1;
      if (scan < length && pattern[scan] === "]") scan += 1;
      while (scan < length && pattern[scan] !== "]") scan += 1;
      if (scan >= length) {
        // Unclosed bracket: `fnmatch` treats it as a literal `[`.
        result += "\\[";
      } else {
        result += translateClass(pattern, index, scan);
        index = scan + 1;
      }
    } else {
      result += escapeLiteral(char);
    }
  }
  return result;
}

/**
 * Translate the body of a bracket expression, `pattern[start..end)`.
 *
 * Ported from CPython's `fnmatch.translate`, including the range fix-up: chunks
 * split on `-` are dropped where the left chunk's last character sorts after the
 * right chunk's first, which is how `[z-a]` becomes a pattern matching nothing.
 * Reproducing the fix-up is what keeps a `wiki.yml` exclude list behaving
 * identically instead of failing to compile.
 */
function translateClass(pattern: string, start: number, end: number): string {
  let cursor = start;
  let stuff = pattern.slice(start, end);
  if (!stuff.includes("-")) {
    return buildClass(stuff.replaceAll("\\", "\\\\"));
  }

  const chunks: string[] = [];
  let scan = pattern[start] === "!" ? start + 2 : start + 1;
  for (;;) {
    const at = pattern.indexOf("-", scan);
    if (at < 0 || at >= end) break;
    chunks.push(pattern.slice(cursor, at));
    cursor = at + 1;
    scan = at + 3;
  }
  const tail = pattern.slice(cursor, end);
  if (tail !== "") {
    chunks.push(tail);
  } else if (chunks.length > 0) {
    chunks[chunks.length - 1] += "-";
  }
  // Drop inverted ranges, exactly as CPython does. This is why `[z-a]` matches
  // nothing rather than throwing.
  for (let index = chunks.length - 1; index > 0; index -= 1) {
    const left = chunks[index - 1]!;
    const right = chunks[index]!;
    if (left[left.length - 1]! > right[0]!) {
      chunks[index - 1] = left.slice(0, -1) + right.slice(1);
      chunks.splice(index, 1);
    }
  }
  stuff = chunks
    .map((chunk) => chunk.replaceAll("\\", "\\\\").replaceAll("-", "\\-"))
    .join("-");
  return buildClass(stuff);
}

/** Wrap a class body, applying `fnmatch`'s empty/negation rules. */
function buildClass(stuff: string): string {
  if (stuff === "") return "(?!)";
  if (stuff === "!") return ".";
  if (stuff[0] === "!") return `[^${stuff.slice(1)}]`;
  if (stuff[0] === "^" || stuff[0] === "[") return `[\\${stuff}]`;
  return `[${stuff}]`;
}

/** `true` when `name` matches `pattern` with `fnmatch` semantics. */
export function fnmatchCase(name: string, pattern: string): boolean {
  return compilePattern(fnmatchTranslate(pattern)).test(name);
}

/** Compile a translated pattern into an anchored, dot-matches-newline regex. */
function compilePattern(source: string): RegExp {
  return new RegExp(`^(?:${source})$`, "s");
}

/**
 * Escape the characters JavaScript's regex parser reads as syntax.
 *
 * Python's `re.escape` also escapes `&~#` and whitespace; those are identity
 * escapes in JavaScript and change nothing, so they are left alone rather than
 * reproduced for appearance.
 */
function escapeLiteral(char: string): string {
  return /[.*+?^${}()|[\]\\/-]/.test(char) ? `\\${char}` : char;
}
