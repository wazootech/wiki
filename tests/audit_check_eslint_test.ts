import { basename, join } from "@std/path";
import { assert, assertEquals, assertFalse } from "@std/assert";
import { lintHeadingLevels, runCheck, runLint } from "../src/wiki/audit.ts";
import { Config } from "../src/wiki/config.ts";
import {
  ARTICLE_SCHEMA,
  issueMessages,
  withRoot,
  write,
  writeSchema,
  writeSeverityFixture,
} from "./audit_support.ts";

Deno.test("run_check reports frontmatter schema errors", () =>
  withRoot(async (root) => {
    const wiki = join(root, "wiki");
    Deno.mkdirSync(wiki, { recursive: true });
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
    assertEquals(basename(results.errors[0]!.path!), "Plain.md");
  }));

Deno.test("ESLint heading findings preserve Wiki report severity and body line numbers", () =>
  withRoot(async (root) => {
    write(
      root,
      "Page.md",
      "---\nheadline: Page\ntype: TechArticle\n---\n# A\n\n### C\n",
    );
    write(
      root,
      "Metadata_Title.md",
      "---\ntitle: A metadata title\ntype: TechArticle\n---\n### Deep\n",
    );
    const config = new Config({
      wiki: { input: [root] },
      lint: { heading_levels: "warning" },
    });

    const direct = await lintHeadingLevels(config);
    assertEquals(direct.length, 1);
    assert(direct[0]!.includes("Page.md:4:"), direct[0]);
    assert(direct[0]!.includes("Heading h3 skips level h2"));

    const report = await runLint(config);
    assert(report.ok);
    assertEquals(report.warnings.length, 1);
    assertEquals(report.warnings[0]!.code, "heading_levels");
    assertEquals(report.warnings[0]!.severity, "warning");
  }));
