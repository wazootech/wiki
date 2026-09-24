/**
 * Output normalisation for the differential harness (issue #273, Phase 2).
 *
 * The migration targets a *differential*, not byte parity — see
 * `docs/adr/0001-deno-rewrite.md`. Where a difference carries no semantic
 * meaning, the harness folds it away so that only real behavioural differences
 * survive to the comparison. Each rule below exists because a concrete
 * divergence was observed without it; nothing is normalised on a hunch:
 *
 * - **BOM** — the Python CLI strips UTF-8 BOMs on every read (#312), so output
 *   never carries one, but a committed fixture written on Windows might.
 * - **Line endings** — Click writes CRLF through text-mode stdout on Windows
 *   while `console.log` writes LF. Observed on the very first case: `wiki
 *   --version` emits `0.1.23\r\n`.
 * - **ANSI escapes** — the Python CLI renders through `rich`, which colours
 *   output; `@std/colors` decides independently. Colour is not contract.
 * - **Scratch root path** — every case runs in a fresh copy of its corpus, so
 *   absolute paths differ per run *and* per machine. Observed in
 *   `lint --strict -v`, which prints the absolute path of a missing asset
 *   directory.
 *
 * Rules that were observed but are deliberately **not** enabled yet, with the
 * case that would need them, are recorded in `parity/README.md`.
 */

/** Placeholder substituted for the absolute path of a case's scratch copy. */
export const CORPUS_PLACEHOLDER = "<CORPUS>";

const BOM = "\uFEFF";

// The ESC is built from its code point rather than written into the pattern, so
// the source carries no control character and deno lint's `no-control-regex`
// has nothing to flag — here the control character is what is being matched.
const ESC = String.fromCharCode(0x1b);
const ANSI_ESCAPE = new RegExp(`${ESC}\\[[0-9;]*[A-Za-z]`, "g");

/** Remove a leading UTF-8 BOM, mirroring the engine's own BOM tolerance. */
export function stripBom(text: string): string {
  return text.startsWith(BOM) ? text.slice(BOM.length) : text;
}

/** Fold CRLF and lone CR to LF. */
export function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}

/** Remove ANSI CSI escape sequences. */
export function stripAnsi(text: string): string {
  return text.replace(ANSI_ESCAPE, "");
}

/**
 * Replace the absolute path of a case's scratch directory with
 * `CORPUS_PLACEHOLDER`, in both native and forward-slash spelling.
 *
 * Longest variant first, so a path that is a prefix of another is never
 * partially rewritten.
 */
export function normalizeScratchRoot(text: string, root: string): string {
  const variants = [...new Set([root, root.replaceAll("\\", "/")])]
    .filter((variant) => variant.length > 0)
    .sort((a, b) => b.length - a.length);
  let out = text;
  for (const variant of variants) {
    out = out.replaceAll(variant, CORPUS_PLACEHOLDER);
  }
  return out;
}

/**
 * Collapse a run of trailing newlines to exactly one, so that a tool which
 * ends with `\n\n` compares equal to one that ends with `\n`. A missing final
 * newline is left alone — that is a real difference between two CLIs.
 */
export function normalizeTrailingBlankLines(text: string): string {
  return text.replace(/\n+$/, "\n");
}

export interface NormalizeOptions {
  /** Absolute path of the scratch directory the run happened in. */
  readonly scratchRoot?: string;
}

/** Normalise a captured CLI stream for comparison. */
export function normalizeOutput(
  text: string,
  options: NormalizeOptions = {},
): string {
  let out = normalizeLineEndings(stripAnsi(stripBom(text)));
  if (options.scratchRoot !== undefined) {
    out = normalizeScratchRoot(out, options.scratchRoot);
  }
  return normalizeTrailingBlankLines(out);
}

/**
 * Normalise a committed fixture read from disk.
 *
 * `.gitattributes` sets `* text=auto eol=lf`, so a fixture written with CRLF
 * on Windows is stored as LF and read back as LF. Normalising on read is what
 * keeps a fresh clone agreeing with the machine that produced the fixture.
 */
export function normalizeFixture(text: string): string {
  return normalizeTrailingBlankLines(normalizeLineEndings(stripBom(text)));
}
