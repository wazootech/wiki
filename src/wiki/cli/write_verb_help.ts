/** Options every write verb takes, listed once for the help texts. */
export const WRITE_VERB_OPTIONS = [
  "  --expect HASH  Refuse unless the file's SHA-256 still matches (from wiki",
  "                 show), so a stale read never clobbers a newer write.",
  "  --apply        Write the edit. Without it, validate and report only.",
  "  --force        Write even if the edit introduces errors.",
  "  -f, --format [text|json]",
  "                 Output format (default: text). json writes the edit",
  "                 report to stdout.",
  "  --json         Shorthand for --format json.",
  "  --help         Show this message and exit.",
];

export const WRITE_VERB_EXIT_CODES =
  "  Exit codes: 0 valid (or applied), 1 rejected, 2 usage, 3 conflict.";

export const NEW_HELP = [
  "Usage: wiki file new [OPTIONS] PATH",
  "",
  "  Create a file of a known type, as a wiki edit (see wiki edit).",
  "",
  "  The type's required fields (SHACL sh:minCount, JSON Schema required) come",
  "  first in the frontmatter, then the other --set fields, then an H1 from",
  "  headline or name. A required field you do not --set is left out, so the",
  "  edit is rejected and the report names it. When PATH is a directory, the",
  "  filename comes from the title (Opal Security -> Opal_Security.md).",
  "",
  WRITE_VERB_EXIT_CODES,
  "",
  "Options:",
  "  --type CLASS   The page's type, e.g. schema:Purchase.",
  "  --set KEY=VALUE",
  "                 A frontmatter field; VALUE is YAML (repeatable).",
  "  --body TEXT    Markdown to put under the H1.",
  ...WRITE_VERB_OPTIONS.filter((line) =>
    !line.startsWith("  --expect") && !line.startsWith("                 show)")
  ),
].join("\n");

export const SET_HELP = [
  "Usage: wiki file set [OPTIONS] PATH FIELD [VALUE]",
  "",
  "  Set one frontmatter field, as a wiki edit (see wiki edit).",
  "",
  "  VALUE is YAML and is written as given (12.00 stays 12.00). FIELD is taken",
  "  literally (schema:price is one key). Comments and key order are kept.",
  "",
  WRITE_VERB_EXIT_CODES,
  "",
  "Options:",
  "  --unset        Remove FIELD instead of setting it.",
  ...WRITE_VERB_OPTIONS,
].join("\n");

export const PATCH_HELP = [
  "Usage: wiki file patch [OPTIONS] PATH",
  "",
  "  Append to, prepend to, or replace a section of a page, as a wiki edit.",
  "",
  "  The target is the lines under a heading (up to the next heading at the",
  "  same or a higher level), the body, or the frontmatter. Headings match on",
  "  their text or anchor slug; a heading that matches twice is an error.",
  "  Content comes from --content, or stdin.",
  "",
  WRITE_VERB_EXIT_CODES,
  "",
  "Options:",
  "  --heading TEXT  Target the section under this heading.",
  "  --body          Target the whole body.",
  "  --frontmatter   Target the frontmatter YAML.",
  "  --append | --prepend | --replace",
  "                  Where the content goes (exactly one).",
  "  --content TEXT  The content (default: read stdin).",
  ...WRITE_VERB_OPTIONS,
].join("\n");
