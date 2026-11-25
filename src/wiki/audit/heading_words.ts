import { headingPlainText } from "../headings.ts";
import {
  isDigit,
  isLowercase,
  isUppercase,
  splitWhitespace,
  stripChars,
} from "../text.ts";

/** An ATX heading line, as `re.MULTILINE` sees one. */
const HEADING_LINE_RE = /^(#{1,6})\s+(.+?)\s*$/m;

/** A heading whose text begins with an ordinal — `1. First step`. */
export const NUMBERED_HEADING_RE = /^\d+[.)]\s+/;

/** A thematic break: three or more `-`, `*`, or `_` alone on a line. */
export const THEMATIC_BREAK_RE = /^(-{3,}|\*{3,}|_{3,})\s*$/m;

/** The `---` underline that turns the line above it into a Setext H2. */
export const SETEXT_H2_UNDERLINE_RE = /^-{3,}\s*$/;

/** A word stripped of the sentence punctuation a heading attaches to it. */
function normalizeHeadingWord(word: string): string {
  return stripChars(word, ".,;:!?");
}

/**
 * Whether a heading word is a name this lint should leave alone.
 *
 * The three cases are `isupper` (an acronym: `CLI`), anything with a digit or a
 * hyphen (`H2`, `kebab-case`), and an internal capital (`GitHub`). A word that
 * is merely capitalized is *not* a proper noun here — which is what makes
 * `## Agent Memory Filesystems` a title-case warning while `## Deploying to
 * GitHub Pages` is not.
 */
function isProperNounToken(word: string): boolean {
  const token = normalizeHeadingWord(word);
  if (token === "") return true;
  // Code points, not UTF-16 units: `token[0]` on an astral character is half a
  // surrogate pair, and `isupper` on half a character is not a question with an
  // answer.
  const chars = [...token];
  if (isUppercase(token) && chars.length > 1) return true;
  if (chars.some((char) => isDigit(char)) || token.includes("-")) {
    return true;
  }
  const [first, ...rest] = chars;
  return isUppercase(first as string) &&
    chars.some((char) => isLowercase(char)) &&
    rest.some((char) => isUppercase(char));
}

/** A line that can be the text row of a Setext heading: not ATX, not a rule. */
export function isSetextTextLine(line: string): boolean {
  const stripped = line.trim();
  if (stripped === "") return false;
  if (HEADING_LINE_RE.test(line)) return false;
  if (THEMATIC_BREAK_RE.test(stripped)) return false;
  return true;
}

/**
 * The words after the first that make a heading read as title case.
 *
 * `title case` is diagnosed by *counting*, not by a dictionary: two or more
 * capitalized words past the first, each longer than three characters and not a
 * proper noun, is the signal. The threshold is why `## Related Standards Guide`
 * is flagged and `## Deploying to GitHub Pages` is not.
 */
export function titleCaseWordsAfterFirst(text: string): string[] {
  const words = splitWhitespace(headingPlainText(text))
    .map(normalizeHeadingWord)
    .filter((word) => word !== "");
  if (words.length < 2) return [];
  return words.slice(1).filter((word) => {
    const chars = [...word];
    return chars.length > 2 &&
      isUppercase(chars[0] as string) &&
      chars.some((char) => isLowercase(char)) &&
      !isProperNounToken(word);
  });
}
