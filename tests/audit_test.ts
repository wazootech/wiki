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

import { assert, assertEquals, assertFalse } from "@std/assert";
import {
  checkLayoutFrontmatter,
  lintBrokenLinks,
  lintDuplicateHeadings,
  lintFilenames,
  lintHeadingLevels,
  lintHeadings,
  lintLinkStyle,
  lintThematicBreaks,
  runCheck,
  runLint,
} from "../src/wiki/audit.ts";
import { Config } from "../src/wiki/config.ts";
import { Path } from "../src/wiki/fspath.ts";
import { loadGraph } from "../src/wiki/graph.ts";
import { RdfGraph } from "../src/wiki/rdf.ts";
import {
  checkShaclAll,
  checkShaclFile,
  loadShapes,
} from "../src/wiki/shacl.ts";

function tempRoot(): Path {
  return Path.of(Deno.makeTempDirSync({ prefix: "wiki-audit-" }));
}

function cleanup(root: Path): void {
  try {
    Deno.removeSync(root.toString(), { recursive: true });
  } catch {
    // Windows keeps a handle open long enough to lose this race occasionally.
  }
}

function write(root: Path, relative: string, content: string): Path {
  const target = root.joinpath(...relative.split("/"));
  Deno.mkdirSync(target.parent.toString(), { recursive: true });
  Deno.writeTextFileSync(target.toString(), content);
  return target;
}

/** Run `body` against a fresh temp root and always clean it up. */
function withRoot(run: (root: Path) => void | Promise<void>): Promise<void> {
  const root = tempRoot();
  return Promise.resolve(run(root)).finally(() => cleanup(root));
}

const PAGE_FRONTMATTER = "---\ntype: TechArticle\n---\n";

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
  withRoot((root) => {
    // `test_filename_pattern_reports_non_matching_names`: the same two files
    // pass under the default pattern and fail under an inverted one, which is
    // what makes the rule configurable rather than a naming policy.
    write(root, "Ethan_Davidson.md", PAGE_FRONTMATTER);
    write(root, "ethan-davidson.md", PAGE_FRONTMATTER);
    const config = new Config({
      wiki: { input: [root], filename_pattern: "[A-Z][A-Za-z0-9_]*\\.md" },
    });

    const report = runLint(config);
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
  withRoot((root) => {
    // `[[Ethan Davidson]]` is not `[[Ethan_Davidson]]`: wikilink resolution does
    // not space-normalize, so the pretty spelling is a broken link.
    write(root, "Ethan_Davidson.md", PAGE_FRONTMATTER);
    write(
      root,
      "Source.md",
      "---\ntype: schema:CreativeWork\n---\n\nSee [[Ethan Davidson]].",
    );
    const config = new Config({ wiki: { input: [root] } });

    const report = runLint(config);
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
      const caseRoot = root.joinpath(`case-${index}`);
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
    const yamlRoot = root.joinpath("yaml-fence");
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
  withRoot((root) => {
    const cases: readonly [string, number][] = [
      ["# A\n\n### C\n", 1],
      ["# A\n\n## B\n\n### C\n", 0],
      // A page may open at H2: there is no previous level to skip from.
      ["## Intro\n", 0],
      // Fenced headings are content, so they do not participate.
      ["## Real\n\n```md\n# Fake\n### Also fake\n```\n", 0],
    ];
    cases.forEach(([body, expected], index) => {
      const caseRoot = root.joinpath(`case-${index}`);
      write(caseRoot, "Page.md", `${PAGE_FRONTMATTER}${body}`);
      const warnings = lintHeadingLevels(
        new Config({ wiki: { input: [caseRoot] } }),
      );
      assertEquals(warnings.length, expected, JSON.stringify(body));
      if (expected > 0) assert(warnings[0]!.includes("skips level h2"));
    });
  }));

Deno.test("duplicate heading text is reported from H2 down, case-insensitively", () =>
  withRoot((root) => {
    const cases: readonly [string, number][] = [
      ["## Foo\n\nBody.\n\n## Foo\n", 1],
      // Two H1s are how a page states its title twice; markdownlint MD024
      // exempts them and so does this.
      ["# Foo\n\n# Foo\n", 0],
      ["## Foo\n\n## foo\n", 1],
      ["## Foo\n\n```\n## Foo\n```\n", 0],
    ];
    cases.forEach(([body, expected], index) => {
      const caseRoot = root.joinpath(`case-${index}`);
      write(caseRoot, "Page.md", `${PAGE_FRONTMATTER}${body}`);
      const warnings = lintDuplicateHeadings(
        new Config({ wiki: { input: [caseRoot] } }),
      );
      assertEquals(warnings.length, expected, JSON.stringify(body));
      if (expected > 0) {
        assert(warnings[0]!.includes("Duplicate heading"));
        assert(warnings[0]!.includes("first at line"));
      }
    });
  }));

Deno.test("link_style flags wikilinks in prose, and only in prose", () =>
  withRoot((root) => {
    const wiki = root.joinpath("wiki");
    Deno.mkdirSync(wiki.toString(), { recursive: true });
    write(root, "wiki/Target.md", "# Target\n");
    write(root, "wiki/Guide.md", "# Guide\n\nSee [[Target]] for details.\n");
    const config = new Config({
      wiki: { input: [wiki] },
      config_root: root,
    });

    const warnings = lintLinkStyle(config);
    assertEquals(warnings.length, 1);
    assert(warnings[0]!.includes("Wikilink '[[Target]]'"));

    // An inline code span and a fence are examples, not links.
    write(
      root,
      "wiki/Guide.md",
      "# Guide\n\nLiteral `[[Target]]` and fenced:\n\n```\n[[Target]]\n```\n",
    );
    assertEquals(lintLinkStyle(config), []);

    // And a wiki that prefers wikilinks is not told to use markdown links.
    write(root, "wiki/Guide.md", "# Guide\n\nSee [[Target]] for details.\n");
    assertEquals(
      lintLinkStyle(
        new Config({
          wiki: { input: [wiki] },
          config_root: root,
          link: { style: "wikilink" },
        }),
      ),
      [],
    );
  }));

Deno.test("fenced wikilinks are broken links but not style violations", () =>
  withRoot((root) => {
    // Verified against the oracle on the differential fixture, and the finding
    // is an asymmetry between two rules rather than a bug in either: the link
    // audit protects *inline* code only, so a `[[Missing]]` inside a fence is a
    // broken link; the style lint protects fences too, so the same occurrence is
    // not also a style violation. A wiki that puts examples in fences gets one
    // finding per example, not two.
    write(
      root,
      "Guide.md",
      "---\ntype: TechArticle\nimage: ../assets/nope.png\n---\n" +
        "# Guide\n\nLiteral `[[Missing]]` inline and:\n\n```md\n[[Missing]]\n```\n",
    );
    const config = new Config({ wiki: { input: [root] } });

    const broken = lintBrokenLinks(config);
    // The message names the route (`Guide`) while the asset one names the file
    // (`Guide.md`) — the oracle does both, so the port does too.
    assert(
      broken.includes(
        "In Guide: Broken WikiLink [Missing] points to non-existent document.",
      ),
      broken.join(" | "),
    );
    assert(
      broken.some((warning) =>
        warning.startsWith("In Guide.md: Broken frontmatter asset")
      ),
      broken.join(" | "),
    );
    assertEquals(lintLinkStyle(config), []);
  }));

Deno.test("run_lint routes each rule at its configured severity", () =>
  withRoot((root) => {
    // `test_run_lint_severity_and_promotion`, for one rule across all three
    // severities — the same routing every other rule shares.
    write(root, "Invalid_Name.md", "---\ntype: schema:WebPage\n---\n");
    const base = { input: [root], filename_pattern: "[a-z0-9-]+\\.md" };
    const severities = ["warning", "error", "off"] as const;
    const expected = {
      warning: { ok: true, warnings: 1, errors: 0 },
      error: { ok: false, warnings: 0, errors: 1 },
      off: { ok: true, warnings: 0, errors: 0 },
    };

    for (const severity of severities) {
      const report = runLint(
        new Config({ wiki: base, lint: { filename_pattern: severity } }),
      );
      assertEquals(report.ok, expected[severity].ok, severity);
      assertEquals(
        report.warnings.length,
        expected[severity].warnings,
        severity,
      );
      assertEquals(report.errors.length, expected[severity].errors, severity);
    }
  }));

Deno.test("run_lint severity applies to the style rules too", () =>
  withRoot((root) => {
    // The four `test_run_lint_*_severity` tests: each rule reports into
    // `errors` and flips `ok` when it is configured as an error.
    const cases: readonly [string, string, string, string][] = [
      // rule, page body, expected message fragment, config
      [
        "link_style",
        "# Guide\n\nSee [[Target]].\n",
        "Wikilink",
        '{"link_style":"error"}',
      ],
      ["headings", "## 1. Bad\n", "Numbered heading", '{"headings":"error"}'],
      [
        "heading_levels",
        "# A\n\n### C\n",
        "skips level",
        '{"heading_levels":"error"}',
      ],
      [
        "duplicate_headings",
        "## Foo\n\n## Foo\n",
        "Duplicate heading",
        '{"duplicate_headings":"error"}',
      ],
    ];

    for (const [rule, body, fragment, lintConfig] of cases) {
      const wiki = root.joinpath("wiki");
      Deno.mkdirSync(wiki.toString(), { recursive: true });
      write(root, "wiki/x.md", `${PAGE_FRONTMATTER}${body}`);
      const report = runLint(
        new Config({
          wiki: { input: [wiki] },
          config_root: root,
          lint: JSON.parse(lintConfig),
        }),
      );
      assertFalse(report.ok, rule);
      assert(
        report.errors.some((issue) => issue.message.includes(fragment)),
        `${rule}: ${report.errors.map((issue) => issue.message).join(" | ")}`,
      );
    }
  }));

Deno.test("run_lint stops at an unsafe route instead of linting it", () =>
  withRoot((root) => {
    // A route the site could not serve makes every link finding speculative, so
    // the safety error is the whole report. A space is the unsafe character
    // `test_paths.py` uses for this rule, because Windows will not create the
    // `?` variant of the same fixture.
    write(root, "Bad Name.md", PAGE_FRONTMATTER);
    const report = runLint(new Config({ wiki: { input: [root] } }));
    assertFalse(report.ok);
    assertEquals(report.errors.length, 1);
    assertEquals(report.errors[0]!.code, "route_safety");
    assertEquals(report.warnings.length, 0);
  }));

Deno.test("load_shapes survives a missing input directory", () =>
  withRoot(async (root) => {
    assertEquals(loadShapes(new RdfGraph()).size, 0);
    const config = new Config({
      wiki: { input: [root.joinpath("non-existent")] },
    });
    const graph = await loadGraph(config, { infer: false });
    assertEquals(loadShapes(graph).size, 0);
  }));

Deno.test("a .ttl shape file constrains the pages beside it", () =>
  withRoot(async (root) => {
    const wiki = root.joinpath("wiki");
    Deno.mkdirSync(wiki.toString(), { recursive: true });
    write(
      root,
      "wiki/person-shape.ttl",
      `
@prefix sh: <http://www.w3.org/ns/shacl#> .
@prefix schema: <https://schema.org/> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

schema:PersonShape
    a sh:NodeShape ;
    sh:targetClass schema:Person ;
    sh:property [
        sh:path schema:givenName ;
        sh:minCount 1 ;
        sh:datatype xsd:string ;
    ] .
`,
    );
    const config = new Config({ wiki: { input: [wiki] } });
    write(root, "wiki/no-fm.md", "just text");
    write(
      root,
      "wiki/valid-person.md",
      "---\ntype: Person\ngivenName: Gregory\n---\n",
    );
    write(root, "wiki/invalid-person.md", "---\ntype: Person\n---\n");

    // No metadata is `null`, which `audit` turns into `missing_metadata` —
    // distinct from "conforms".
    assertEquals(
      await checkShaclFile(wiki.joinpath("no-fm.md"), config),
      null,
    );
    const valid = await checkShaclFile(
      wiki.joinpath("valid-person.md"),
      config,
    );
    assert(valid !== null && valid.conforms);
    const invalid = await checkShaclFile(
      wiki.joinpath("invalid-person.md"),
      config,
    );
    assert(invalid !== null && !invalid.conforms);

    // The whole-corpus pass sees the invalid page too.
    assertFalse((await checkShaclAll(config)).conforms);
  }));

Deno.test("shapes can be declared in markdown frontmatter", () =>
  withRoot(async (root) => {
    const wiki = root.joinpath("wiki");
    Deno.mkdirSync(wiki.toString(), { recursive: true });
    const config = new Config({ wiki: { input: [wiki] } });
    write(
      root,
      "wiki/project-shape.md",
      "---\n" +
        "id: wiki:ProjectShape\n" +
        "type: sh:NodeShape\n" +
        "sh:targetClass: schema:Project\n" +
        "sh:property:\n" +
        "  - sh:path: schema:name\n" +
        "    sh:minCount: 1\n" +
        "    sh:datatype: xsd:string\n" +
        "---\n" +
        "# Project Shape\n",
    );
    write(root, "wiki/invalid-project.md", "---\ntype: Project\n---\n");
    write(
      root,
      "wiki/valid-project.md",
      "---\ntype: Project\nname: Wiki CLI\n---\n",
    );

    const invalid = await checkShaclFile(
      wiki.joinpath("invalid-project.md"),
      config,
    );
    assert(invalid !== null && !invalid.conforms);
    const valid = await checkShaclFile(
      wiki.joinpath("valid-project.md"),
      config,
    );
    assert(valid !== null && valid.conforms);
  }));

Deno.test("wazoo:layout must resolve to a readable .html file", () =>
  withRoot((root) => {
    const wiki = root.joinpath("wiki");
    Deno.mkdirSync(wiki.toString(), { recursive: true });
    write(
      root,
      "wiki/page.md",
      "---\ntype: TechArticle\nwazoo:layout: layouts/missing.html\n---\n",
    );
    const config = new Config({
      wiki: { input: [wiki] },
      config_root: root,
    });

    const issues = checkLayoutFrontmatter(config);
    assertEquals(issues.length, 1);
    assert(issues[0]!.includes("layouts/missing.html"));

    // `test_check_layout_frontmatter_accepts_html_layout` points the same page
    // at a layout that exists — the `.html` suffix is required, but a missing
    // file and a wrong extension are one finding, not two.
    write(root, "layouts/plain.html", "<html>%wiki.body%</html>");
    write(
      root,
      "wiki/page.md",
      "---\ntype: TechArticle\nwazoo:layout: layouts/plain.html\n---\n",
    );
    assertEquals(checkLayoutFrontmatter(config), []);
  }));

/*
 * The four `_run_check` tests, moved from `tests/test_frontmatter_schema.py`.
 * They need a schema that binds a type, a shape document that points at it, and
 * a page that fails it — which is the same fixture for all four, so it is built
 * once here.
 */

function writeSchema(root: Path, relative: string, schema: unknown): void {
  write(root, relative, `${JSON.stringify(schema, null, 2)}\n`);
}

const ARTICLE_SCHEMA = {
  type: "object",
  required: ["headline", "description"],
  properties: {
    headline: { type: "string" },
    description: { type: "string" },
  },
};

/** A wiki whose `Broken.md` fails a required-field schema, and a missing ref. */
function writeSeverityFixture(root: Path): Path {
  const wiki = root.joinpath("wiki");
  Deno.mkdirSync(wiki.toString(), { recursive: true });
  writeSchema(root, "schemas/article.json", ARTICLE_SCHEMA);
  write(
    root,
    "wiki/Article_Shape.md",
    "---\n" +
      "type: sh:NodeShape\n" +
      "sh:targetClass: schema:TechArticle\n" +
      "wazoo:jsonSchema: schemas/article.json\n" +
      "---\n",
  );
  write(
    root,
    "wiki/Gadget_Shape.md",
    "---\n" +
      "type: sh:NodeShape\n" +
      "sh:targetClass: schema:Product\n" +
      "wazoo:jsonSchema: schemas/missing.json\n" +
      "---\n",
  );
  write(
    root,
    "wiki/Broken.md",
    "---\ntype: TechArticle\nheadline: Only\n---\n",
  );
  write(
    root,
    "wiki/Product.md",
    "---\ntype: schema:Product\nname: Gadget\n---\n",
  );
  return wiki;
}

/** `AuditReport.messages()` flattened, as the Python helpers do it. */
function issueMessages(report: {
  messages(): [string[], string[]];
}): string[] {
  const [errors, warnings] = report.messages();
  return [...errors, ...warnings];
}

Deno.test("run_check reports frontmatter schema errors", () =>
  withRoot(async (root) => {
    const wiki = root.joinpath("wiki");
    Deno.mkdirSync(wiki.toString(), { recursive: true });
    writeSchema(root, "schemas/article.json", ARTICLE_SCHEMA);
    write(
      root,
      "wiki/Article_Shape.md",
      "---\n" +
        "type: sh:NodeShape\n" +
        "sh:targetClass: schema:TechArticle\n" +
        "wazoo:jsonSchema: schemas/article.json\n" +
        "---\n",
    );
    write(
      root,
      "wiki/Broken.md",
      "---\ntype: TechArticle\nheadline: Only\n---\n",
    );
    const config = new Config({
      wiki: { input: [wiki] },
      config_root: root,
    });

    const results = await runCheck(config);
    assertFalse(results.ok);
    assert(
      results.errors.some((issue) => issue.message.includes("description")),
    );
  }));

Deno.test("run_check routes both schema rules at their severity", () =>
  withRoot(async (root) => {
    const wiki = writeSeverityFixture(root);
    const base = { wiki: { input: [wiki] }, config_root: root };
    // (severity, validation errors, validation warnings, ok)
    const matrix: readonly [string, number, number, boolean][] = [
      ["off", 0, 0, true],
      ["warning", 0, 1, true],
      ["error", 1, 0, false],
    ];

    for (const [severity, errors, warnings, ok] of matrix) {
      const results = await runCheck(
        new Config({
          ...base,
          check: { frontmatter_schema: severity, missing_schema_ref: "off" },
        }),
      );
      assertEquals(
        results.errors.filter((issue) => issue.message.includes("description"))
          .length,
        errors,
        `frontmatter_schema=${severity} errors`,
      );
      assertEquals(
        results.warnings.filter((issue) =>
          issue.message.includes("description")
        ).length,
        warnings,
        `frontmatter_schema=${severity} warnings`,
      );
      assertEquals(results.ok, ok, `frontmatter_schema=${severity} ok`);
    }

    for (const [severity, , , ok] of matrix) {
      const results = await runCheck(
        new Config({
          ...base,
          check: { frontmatter_schema: "off", missing_schema_ref: severity },
        }),
      );
      const missing = issueMessages(results).filter((message) =>
        message.includes("missing.json")
      );
      const missingErrors = results.errors.filter((issue) =>
        issue.message.includes("missing.json")
      );
      if (severity === "off") {
        assertEquals(missing, [], "missing_schema_ref=off");
      } else if (severity === "warning") {
        assertEquals(missingErrors.length, 0, "missing_schema_ref=warning");
        assert(missing.length > 0, "missing_schema_ref=warning reports");
      } else {
        assert(missingErrors.length > 0, "missing_schema_ref=error reports");
        assertEquals(
          results.warnings.filter((issue) =>
            issue.message.includes("missing.json")
          ).length,
          0,
          "missing_schema_ref=error is not also a warning",
        );
      }
      assertEquals(results.ok, ok, `missing_schema_ref=${severity} ok`);
    }
  }));

Deno.test("run_check skips the schema pass when both rules are off", () =>
  withRoot(async (root) => {
    const wiki = writeSeverityFixture(root);
    const results = await runCheck(
      new Config({
        wiki: { input: [wiki] },
        config_root: root,
        check: { frontmatter_schema: "off", missing_schema_ref: "off" },
      }),
    );

    assert(results.ok);
    assertEquals(
      issueMessages(results).filter((message) =>
        message.includes("missing.json")
      ),
      [],
    );
    assertEquals(
      issueMessages(results).filter((message) =>
        message.includes("description")
      ),
      [],
    );
  }));

Deno.test("run_check in scoped mode reports per-file findings", () =>
  withRoot(async (root) => {
    // `build --only` and the watcher call `_run_check(file_paths=[...])`, which
    // skips the whole-wiki SHACL pass and reports a file with no metadata at all
    // as `missing_metadata`.
    const wiki = writeSeverityFixture(root);
    const plain = write(root, "wiki/Plain.md", "Just prose.\n");
    const config = new Config({
      wiki: { input: [wiki] },
      config_root: root,
    });

    const results = await runCheck(config, { filePaths: [plain] });
    assertFalse(results.ok);
    assertEquals(results.errors.length, 1);
    assertEquals(results.errors[0]!.code, "missing_metadata");
    assertEquals(results.errors[0]!.path?.name, "Plain.md");
  }));
