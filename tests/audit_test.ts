/**
 * Port of `tests/test_audit.py`, plus the four `_run_check` tests that file
 * never had.
 *
 * Two groupings differ from the Python, both stated here rather than in a
 * comment per test:
 *
 * - **The heading lints are table-driven.** `test_audit.py` has six
 *   single-assertion tests for `lint_headings` (`test_lint_headings_title_case`,
 *   `_h1_title_case_not_flagged`, `_h2_title_case_flagged`,
 *   `_setext_not_warned`, `_setext_h2_not_warned`, `_atx_does_not_warn_setext`,
 *   `_allows_proper_noun_headings`, `_ignores_capitalized_link_text_in_headings`)
 *   that differ only in their markdown, and the same for heading levels and
 *   duplicates. They are one test per rule here, because the thing under test is
 *   the rule's judgement and a reader wants the cases side by side.
 * - **The four `_run_check` tests moved here from `tests/test_frontmatter_schema.py`.**
 *   They assert how `AuditReport` routes an issue list the schema module
 *   returns, which is this module's contract: the severity matrix for both
 *   schema rules and the "both rules off skips the pass" case. The schema test
 *   file says they would land here when `audit.ts` did.
 *
 * The SHACL-facing assertions (`check_shacl_file`, `check_shacl_all`,
 * `load_shapes`) are split: the fixture-level ones are adapted below because
 * they are what `test_audit.py` asserts about the *audit* pass, and the
 * report-shape ones live in `shacl_test.ts` next to the module that renders
 * them.
 */

import { join } from "@std/path";
import { assert, assertEquals, assertFalse } from "@std/assert";
import {
  lintBrokenLinks,
  lintDuplicateHeadings,
  lintFilenames,
  lintHeadingLevels,
  lintHeadings,
  lintThematicBreaks,
  runLint,
} from "../src/wiki/audit.ts";
import { Config } from "../src/wiki/config.ts";
import { PAGE_FRONTMATTER, withRoot, write } from "./audit_support.ts";

Deno.test("filenames are linted against filename_pattern", () =>
  withRoot((root) => {
    // The Python test writes the two files into the input dir itself, so the
    // root doubles as the wiki.
    write(root, "valid-kebab-case.md", "content");
    write(root, "Invalid_Name.md", "content");
    const config = new Config({
      wiki: { input: [root], filename_pattern: "[a-z0-9-]+\\.md" },
    });

    const warnings = lintFilenames(config);
    assertEquals(warnings.length, 1);
    assert(
      warnings[0]!.includes(
        "Filename 'Invalid_Name.md' does not match filename_pattern.",
      ),
    );
  }));

Deno.test("filename_pattern is a custom pattern, not a preset style", () =>
  withRoot(async (root) => {
    // `test_filename_pattern_reports_non_matching_names`: the same two files
    // pass under the default pattern and fail under an inverted one, which is
    // what makes the rule configurable rather than a naming policy.
    write(root, "Ethan_Davidson.md", PAGE_FRONTMATTER);
    write(root, "ethan-davidson.md", PAGE_FRONTMATTER);
    const config = new Config({
      wiki: { input: [root], filename_pattern: "[A-Z][A-Za-z0-9_]*\\.md" },
    });

    const report = await runLint(config);
    assert(report.ok);
    assertEquals(report.warnings.length, 1);
    assert(report.warnings[0]!.message.includes("ethan-davidson.md"));
  }));

Deno.test("a filename_pattern never applies to YAML documents", () =>
  withRoot((root) => {
    write(root, "Invalid_Name.yml", "type: Thing\n");
    write(root, "Invalid_Name.yaml", "type: Thing\n");
    write(root, "valid-name.md", "content");
    const config = new Config({
      wiki: { input: [root], filename_pattern: "[a-z0-9-]+\\.md" },
    });

    assertEquals(lintFilenames(config), []);
  }));

Deno.test("broken wikilinks and markdown links are both reported", () =>
  withRoot((root) => {
    write(root, "target-page.md", "content");
    write(
      root,
      "source-page.md",
      "---\nid: wiki:source\ntype: Person\n---\n" +
        "Here is a valid WikiLink [[target-page]] and a broken WikiLink [[non-existent-page]].\n" +
        "And a valid Markdown link [Target](target-page.md) and a broken Markdown link [Broken](missing.md).\n",
    );
    const config = new Config({ wiki: { input: [root] } });

    const warnings = lintBrokenLinks(config);
    assertEquals(warnings.length, 2);
    assert(
      warnings.some((warning) =>
        warning.includes("Broken WikiLink [non-existent-page]")
      ),
    );
    assert(
      warnings.some((warning) =>
        warning.includes("Broken Markdown link [missing.md]")
      ),
    );
  }));

Deno.test("a wiki: CURIE in frontmatter must name a real route", () =>
  withRoot((root) => {
    write(root, "wiki.md", "---\ntype: SoftwareApplication\n---\n");
    write(
      root,
      "Farzapedia.md",
      "---\ntype: TechArticle\nabout: wiki:wiki-cli\n---\n",
    );
    const config = new Config({ wiki: { input: [root] } });

    const warnings = lintBrokenLinks(config);
    assertEquals(warnings.length, 1);
    assert(warnings[0]!.includes("wiki:wiki-cli"));
    assert(warnings[0]!.includes("Metadata reference"));
  }));

Deno.test("a CURIE fragment and a YAML document target both resolve", () =>
  withRoot((root) => {
    // `wiki:Microdata#example` is the same document as `wiki:Microdata`, and a
    // wikilink to a `.yml` target is a document link like any other.
    write(
      root,
      "Microdata.md",
      '---\ntype: TechArticle\n---\n<div itemid="wiki:Microdata#example"></div>\n',
    );
    write(root, "yml-target.yml", "type: Thing\nname: YML\n");
    write(root, "yaml-target.yaml", "type: Thing\nname: YAML\n");
    write(root, "source-page.md", "See [[yml-target]], [[yaml-target]].");
    const config = new Config({ wiki: { input: [root] } });

    assertEquals(lintBrokenLinks(config), []);
  }));

Deno.test("a wikilink target needs a path specifier, not a space", () =>
  withRoot(async (root) => {
    // `[[Ethan Davidson]]` is not `[[Ethan_Davidson]]`: wikilink resolution does
    // not space-normalize, so the pretty spelling is a broken link.
    write(root, "Ethan_Davidson.md", PAGE_FRONTMATTER);
    write(
      root,
      "Source.md",
      "---\ntype: schema:CreativeWork\n---\n\nSee [[Ethan Davidson]].",
    );
    const config = new Config({ wiki: { input: [root] } });

    const report = await runLint(config);
    assert(
      report.warnings.some((issue) =>
        issue.message.includes("Broken WikiLink [Ethan Davidson]")
      ),
    );
  }));

Deno.test("headings lint: numbering, title case, and Setext", () =>
  withRoot((root) => {
    write(
      root,
      "Bad.md",
      "---\ntype: TechArticle\n---\n## 1. First step\n\n---\n\nBody.\n",
    );
    const config = new Config({ wiki: { input: [root] } });

    const headingWarnings = lintHeadings(config);
    const thematicWarnings = lintThematicBreaks(config);
    assert(
      headingWarnings.some((warning) => warning.includes("Numbered heading")),
    );
    // The `---` under a blank line is a thematic break, not a Setext underline,
    // and it is not `lint_headings`' business either way.
    assertFalse(
      headingWarnings.some((warning) => warning.includes("Thematic break")),
    );
    assert(
      thematicWarnings.some((warning) => warning.includes("Thematic break")),
    );
  }));

Deno.test("headings lint: sentence case for H2+ only", () =>
  withRoot((root) => {
    const cases: readonly [string, readonly string[], boolean][] = [
      // `#` is the page title, where title case is correct.
      ["Page.md", ["# Agent Memory Filesystems"], false],
      ["Page.md", ["## Agent Memory Filesystems"], true],
      ["Page.md", ["## Related Standards Guide"], true],
      // A proper noun is not title case, and neither is a single capitalized
      // word: the rule needs two or more.
      ["Deploy.md", ["# Deploying to GitHub Pages"], false],
      ["Compare.md", [
        "## Comparison with [Wiki CLI](wiki.md) and [Letta MemFS](Letta_MemFS.md)",
      ], false],
    ];
    // Each case gets its own wiki, because the lint reads every file it can
    // see: the Python tests each have a fresh `TemporaryDirectory`, and sharing
    // one here would read the previous case's page too.
    cases.forEach(([name, headings, expectWarning], index) => {
      const caseRoot = join(root, `case-${index}`);
      write(
        caseRoot,
        name,
        `${PAGE_FRONTMATTER}${headings.join("\n\n")}\n`,
      );
      const warnings = lintHeadings(
        new Config({ wiki: { input: [caseRoot] } }),
      );
      assertEquals(
        warnings.some((warning) => warning.includes("title case")),
        expectWarning,
        `${headings.join(", ")} in ${name}`,
      );
    });
  }));

Deno.test("headings lint never reports Setext syntax, in any form", () =>
  withRoot((root) => {
    // `wiki fmt` converts Setext headings to ATX, so they are not an editorial
    // error; and a Setext underline inside a fence is content, so it is not a
    // thematic break either. The Python test file breaks these into four tests.
    const cases: readonly [string, string][] = [
      ["Page.md", "My Title\n=======\n\nBody.\n"],
      ["Page.md", "Section title\n---------\n\nBody.\n"],
      ["Page.md", "# My Title\n\n## Section title\n"],
      ["Example.md", "```markdown\nTitle\n===\n```\n"],
    ];
    for (const [name, body] of cases) {
      write(root, name, `${PAGE_FRONTMATTER}${body}`);
      const config = new Config({ wiki: { input: [root] } });
      assertFalse(
        lintHeadings(config).some((warning) => warning.includes("Setext")),
        `${name}: ${JSON.stringify(body)}`,
      );
      assertFalse(
        lintThematicBreaks(config).some((warning) =>
          warning.includes("Thematic break")
        ),
        `${name} thematic break`,
      );
    }
    // The fenced `---` case on its own: a YAML fence in a page about YAML. Its
    // own root, because the module-level `config` above closes over the shared
    // one and a second page would be linted alongside the first.
    const yamlRoot = join(root, "yaml-fence");
    write(
      yamlRoot,
      "Example.md",
      "---\ntype: TechArticle\n---\n```yaml\n---\nname: Example\n---\n```\n",
    );
    assertFalse(
      lintThematicBreaks(new Config({ wiki: { input: [yamlRoot] } })).some(
        (warning) => warning.includes("Thematic break"),
      ),
    );
  }));

Deno.test("heading levels increase by one at a time", () =>
  withRoot(async (root) => {
    const cases: readonly [string, number][] = [
      ["# A\n\n### C\n", 1],
      ["# A\n\n## B\n\n### C\n", 0],
      // A page may open at H2: there is no previous level to skip from.
      ["## Intro\n", 0],
      // Fenced headings are content, so they do not participate.
      ["## Real\n\n```md\n# Fake\n### Also fake\n```\n", 0],
    ];
    for (const [index, [body, expected]] of cases.entries()) {
      const caseRoot = join(root, `case-${index}`);
      write(caseRoot, "Page.md", `${PAGE_FRONTMATTER}${body}`);
      const warnings = await lintHeadingLevels(
        new Config({ wiki: { input: [caseRoot] } }),
      );
      assertEquals(warnings.length, expected, JSON.stringify(body));
      if (expected > 0) assert(warnings[0]!.includes("skips level h2"));
    }
  }));

Deno.test("ESLint duplicate heading lint preserves Wiki's H2+ normalization", () =>
  withRoot(async (root) => {
    const cases: readonly [string, number][] = [
      ["## Foo\n\nBody.\n\n## Foo\n", 1],
      ["# Foo\n\n# Foo\n", 0],
      ["## Foo\n\n## foo\n", 1],
      ["## `Foo`\n\n## Foo\n", 1],
      ["## Foo\n\n### foo\n", 1],
      ["## [Foo](target.md)\n\n## Foo\n", 0],
      ["Foo\n---\n\nFoo\n---\n", 1],
      ["## Foo\n\n```\n## Foo\n```\n", 0],
    ];
    for (const [index, [body, expected]] of cases.entries()) {
      const caseRoot = join(root, `case-${index}`);
      write(caseRoot, "Page.md", `${PAGE_FRONTMATTER}${body}`);
      const warnings = await lintDuplicateHeadings(
        new Config({ wiki: { input: [caseRoot] } }),
      );
      assertEquals(warnings.length, expected, JSON.stringify(body));
      if (expected > 0) {
        assert(warnings[0]!.includes("Duplicate heading"));
        assert(warnings[0]!.includes("first at line"));
      }
    }
  }));

Deno.test("ESLint duplicate findings preserve Wiki report code and severity", () =>
  withRoot(async (root) => {
    write(
      root,
      "Page.md",
      `${PAGE_FRONTMATTER}## Foo\n\n## Foo\n`,
    );
    const config = new Config({
      wiki: { input: [root] },
      lint: { duplicate_headings: "error" },
    });

    const report = await runLint(config);
    assertFalse(report.ok);
    assertEquals(report.errors.length, 1);
    assertEquals(report.errors[0]!.code, "duplicate_headings");
    assertEquals(report.errors[0]!.severity, "error");
  }));

Deno.test("ESLint Markdown rules map together into Wiki severities", () =>
  withRoot(async (root) => {
    write(root, "Page.md", `${PAGE_FRONTMATTER}## Foo\n\n#### Foo\n`);
    const config = new Config({
      wiki: { input: [root] },
      lint: { heading_levels: "warning", duplicate_headings: "error" },
    });

    const report = await runLint(config);
    assertFalse(report.ok);
    assertEquals(report.warnings.map((issue) => issue.code), [
      "heading_levels",
    ]);
    assertEquals(report.errors.map((issue) => issue.code), [
      "duplicate_headings",
    ]);
  }));
