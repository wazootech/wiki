/**
 * The port's own `fmt` goldens, replayed against the in-process route.
 *
 * `tests/fmt_test.ts` asserts against the *subprocess* formatter, so it stays
 * green whether or not the engine is swappable. These are the same inputs and
 * the same expected values, fed through the in-process route instead — the
 * contract a swap has to preserve. Each case names the test it mirrors.
 */

import { buildFaithfulRoute } from "./route.ts";

const route = buildFaithfulRoute({ htmlFencePostPass: true });
const format = (text: string) => route.format("Page.md", text);

let failures = 0;
function check(name: string, condition: boolean, detail = ""): void {
  if (!condition) failures++;
  console.log(`${condition ? "PASS" : "FAIL"}  ${name}${detail}`);
}

function checkEqual(name: string, actual: string, expected: string): void {
  check(
    name,
    actual === expected,
    actual === expected ? "" : `\n  expected ${JSON.stringify(expected)}\n  actual   ${JSON.stringify(actual)}`,
  );
}

// mirrors "format_markdown preserves wikilinks"
checkEqual(
  "wikilink survives",
  format("See [[Wiki_CLI]] for details.").trim(),
  "See [[Wiki_CLI]] for details.",
);
checkEqual(
  "wikilink with label survives",
  format("See [[Wiki_CLI|the CLI]] for details.").trim(),
  "See [[Wiki_CLI|the CLI]] for details.",
);

// mirrors "format_markdown pads a table to its widest cell" — exact bytes
checkEqual(
  "table pads to widest cell",
  format("| LongHeader | Short |\n|---|---|\n| cell | verylongcell |\n"),
  "| LongHeader | Short        |\n" +
    "| ---------- | ------------ |\n" +
    "| cell       | verylongcell |\n",
);

// mirrors "format_markdown preserves a SPARQL render block"
{
  const original = "<!-- sparql:start -->\n" +
    "```sparql\nSELECT ?class WHERE { ?class a owl:Class }\n```\n" +
    "| class |\n| --- |\n| owl:Class |\n" +
    "<!-- sparql:end -->\n";
  const out = format(original);
  for (
    const needle of [
      "<!-- sparql:start -->",
      "```sparql",
      "| owl:Class |",
      "<!-- sparql:end -->",
      "SELECT ?class WHERE { ?class a owl:Class }",
    ]
  ) {
    check(`sparql block keeps ${JSON.stringify(needle)}`, out.includes(needle));
  }
  check("sparql table header is not title-cased", !out.includes("| Class |"), JSON.stringify(out));
}

// mirrors "format_markdown preserves a hidden SPARQL render block"
{
  const original = "<!-- sparql:start\n" +
    "```sparql\nSELECT ?class WHERE { ?class a owl:Class }\n```\n" +
    "-->\n" +
    "| class |\n| --- |\n| owl:Class |\n" +
    "<!-- sparql:end -->\n";
  const out = format(original);
  for (
    const needle of ["<!-- sparql:start\n", "```sparql", "-->\n", "| owl:Class |"]
  ) {
    check(`hidden sparql block keeps ${JSON.stringify(needle)}`, out.includes(needle));
  }
  check("hidden sparql table header is not title-cased", !out.includes("| Class |"), JSON.stringify(out));
}

// mirrors "format_markdown strips a leading BOM"
{
  const bommed = "\uFEFF" +
    "---\ntype: schema:Person\nname: Bommed\n---\n\n# Bommed\n";
  const withoutBom = bommed.startsWith("\uFEFF") ? bommed.slice(1) : bommed;
  const out = format(withoutBom);
  check("BOM is gone", !out.includes("\uFEFF"));
  check("frontmatter is not a setext heading", !out.includes("## "), JSON.stringify(out));
  check(
    "frontmatter opener survives",
    out.startsWith("---\ntype: schema:Person"),
    JSON.stringify(out),
  );
}

// mirrors "fmt reformats a page in place" and "fmt tolerates a page saved with a UTF-8 BOM":
// both assert that a two-space hard break is rewritten.
{
  const out = format("---\ntype: schema:WebPage\nname: Test\n---\n\n# Header\n\nSome text  \nwith extra spaces.\n");
  check("two-space hard break is rewritten", !out.includes("Some text  \n"), JSON.stringify(out));
  check("hard break becomes a backslash", out.includes("Some text\\\n"), JSON.stringify(out));
}

console.log(`\n${failures} failing assertions`);
if (failures > 0) Deno.exit(1);
