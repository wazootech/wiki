import { join } from "@std/path";
import { assert, assertEquals, assertFalse } from "@std/assert";
import {
  checkLayoutFrontmatter,
  lintBrokenLinks,
  lintLinkStyle,
  runLint,
} from "../src/wiki/audit.ts";
import { Config } from "../src/wiki/config.ts";
import { loadGraph } from "../src/wiki/graph.ts";
import { RdfGraph } from "../src/wiki/rdf.ts";
import {
  checkShaclAll,
  checkShaclFile,
  loadShapes,
  loadWikiShapes,
} from "../src/wiki/shacl.ts";
import { PAGE_FRONTMATTER, withRoot, write } from "./audit_support.ts";

Deno.test("link_style flags wikilinks in prose, and only in prose", () =>
  withRoot((root) => {
    const wiki = join(root, "wiki");
    Deno.mkdirSync(wiki, { recursive: true });
    write(root, "wiki/Target.md", "# Target\n");
    write(root, "wiki/Guide.md", "# Guide\n\nSee [[Target]] for details.\n");
    const config = new Config({
      wiki: { input: [wiki] },
      config_root: root,
    });

    const warnings = lintLinkStyle(config);
    assertEquals(warnings.length, 1);
    assert(warnings[0]!.includes('Wikilink "[[Target]]"'));

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

Deno.test("links inside fenced code are neither broken links nor style violations (#362)", () =>
  withRoot((root) => {
    // A fence holds examples, so a link inside one is code, not a link: the
    // link audit and the style lint agree on that, as they already did for
    // inline code. The oracle protected inline code only and reported fenced
    // examples as broken; that parity was dropped on purpose (#362).
    write(
      root,
      "Guide.md",
      "---\ntype: TechArticle\nimage: ../assets/nope.png\n---\n" +
        "# Guide\n\nLiteral `[[Missing]]` inline and:\n\n```md\n[[Missing]]\n```\n\n" +
        '```bash\necho "[x](Missing_Page.md)"\n```\n',
    );
    const config = new Config({ wiki: { input: [root] } });

    const broken = lintBrokenLinks(config);
    assertEquals(
      broken.filter((warning) => warning.startsWith("In Guide:")),
      [],
      broken.join(" | "),
    );
    // Real findings outside code are still reported.
    assert(
      broken.some((warning) =>
        warning.startsWith("In Guide.md: Broken frontmatter asset")
      ),
      broken.join(" | "),
    );
    assertEquals(lintLinkStyle(config), []);
  }));

Deno.test("run_lint routes each rule at its configured severity", () =>
  withRoot(async (root) => {
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
      const report = await runLint(
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
  withRoot(async (root) => {
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
      const wiki = join(root, "wiki");
      Deno.mkdirSync(wiki, { recursive: true });
      write(root, "wiki/x.md", `${PAGE_FRONTMATTER}${body}`);
      const report = await runLint(
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
  withRoot(async (root) => {
    // A route the site could not serve makes every link finding speculative, so
    // the safety error is the whole report. A space is the unsafe character
    // `test_paths.py` uses for this rule, because Windows will not create the
    // `?` variant of the same fixture.
    write(root, "Bad Name.md", PAGE_FRONTMATTER);
    const report = await runLint(new Config({ wiki: { input: [root] } }));
    assertFalse(report.ok);
    assertEquals(report.errors.length, 1);
    assertEquals(report.errors[0]!.code, "route_safety");
    assertEquals(report.warnings.length, 0);
  }));

Deno.test("load_shapes survives a missing input directory", () =>
  withRoot(async (root) => {
    assertEquals(loadShapes(new RdfGraph()).size, 0);
    const config = new Config({
      wiki: { input: [join(root, "non-existent")] },
    });
    const graph = await loadGraph(config, { infer: false });
    assertEquals(loadShapes(graph).size, 0);
  }));

Deno.test("a .ttl shape file constrains the pages beside it", () =>
  withRoot(async (root) => {
    const wiki = join(root, "wiki");
    Deno.mkdirSync(wiki, { recursive: true });
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
      await checkShaclFile(join(wiki, "no-fm.md"), config),
      null,
    );
    const valid = await checkShaclFile(
      join(wiki, "valid-person.md"),
      config,
    );
    assert(valid !== null && valid.conforms);
    const invalid = await checkShaclFile(
      join(wiki, "invalid-person.md"),
      config,
    );
    assert(invalid !== null && !invalid.conforms);

    // A caller-supplied shapes graph is used as given: the wiki's own shapes
    // decide as the default does, and an empty one has nothing to violate.
    const shapes = await loadWikiShapes(config);
    assert(shapes.size > 0);
    const reused = await checkShaclFile(
      join(wiki, "invalid-person.md"),
      config,
      shapes,
    );
    assertEquals(reused, invalid);
    const unshaped = await checkShaclFile(
      join(wiki, "invalid-person.md"),
      config,
      new RdfGraph(),
    );
    assert(unshaped !== null && unshaped.conforms);

    // The whole-corpus pass sees the invalid page too.
    assertFalse((await checkShaclAll(config)).conforms);
  }));

Deno.test("shapes can be declared in markdown frontmatter", () =>
  withRoot(async (root) => {
    const wiki = join(root, "wiki");
    Deno.mkdirSync(wiki, { recursive: true });
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
      join(wiki, "invalid-project.md"),
      config,
    );
    assert(invalid !== null && !invalid.conforms);
    const valid = await checkShaclFile(
      join(wiki, "valid-project.md"),
      config,
    );
    assert(valid !== null && valid.conforms);
  }));

Deno.test("wazoo:layout must resolve to a readable .html file", () =>
  withRoot((root) => {
    const wiki = join(root, "wiki");
    Deno.mkdirSync(wiki, { recursive: true });
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
