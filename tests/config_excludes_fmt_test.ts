import { join, resolve } from "@std/path";
import { ValueError } from "../src/wiki/errors.ts";
import { assertEquals, assertStringIncludes, assertThrows } from "@std/assert";
import { Config } from "../src/wiki/config.ts";
import { SchemaValidationError } from "../src/wiki/schemas/validation.ts";
import { strings, withTempDir, writeFile } from "./config_support.ts";

Deno.test("exclude patterns match config-root-relative paths", () => {
  withTempDir((base) => {
    const root = resolve(base);
    const config = Config.forRoot(root, {
      wiki: { exclude: ["wiki/drafts/**", "**/.env*"] },
    });
    assertEquals(
      config.isExcluded(join(root, "wiki", "drafts", "note.md")),
      true,
    );
    assertEquals(
      config.isExcluded(join(root, "assets", ".env.local")),
      true,
    );
    assertEquals(
      config.isExcluded(join(root, "wiki", "published.md")),
      false,
    );
  });
});

Deno.test("link.style accepts the two styles and translates the legacy names", () => {
  assertEquals(
    new Config({ link: { style: "wikilink" } }).link.style,
    "wikilink",
  );
  assertEquals(
    new Config({ link: { style: "markdown" } }).link.style,
    "standard",
  );
  assertEquals(
    new Config({ link: { style: "obsidian" } }).link.style,
    "wikilink",
  );
  assertEquals(new Config().link.style, "standard");
  withTempDir((base) => {
    writeFile(base, "wiki.yaml", "link:\n  style: standard\n");
    assertEquals(Config.load(base).link.style, "standard");
  });
  const error = assertThrows(
    () => new Config({ link: { style: "not-a-style" } }),
    SchemaValidationError,
  );
  assertStringIncludes(
    error.message,
    'expected standard or wikilink, got "not-a-style"',
  );
});

Deno.test("graph.implicit_types defaults and policy are validated", () => {
  const config = new Config();
  assertEquals([...config.graph.implicit_types], []);
  assertEquals(config.graph.implicit_types_policy, "fallback");
  withTempDir((base) => {
    writeFile(
      base,
      "wiki.yaml",
      "graph:\n  implicit_types: [schema:TechArticle]\n  implicit_types_policy: append\n",
    );
    const loaded = Config.load(base);
    assertEquals([...loaded.graph.implicit_types], ["schema:TechArticle"]);
    assertEquals(loaded.graph.implicit_types_policy, "append");
  });
  const error = assertThrows(
    () => new Config({ graph: { implicit_types_policy: "replace" } }),
    SchemaValidationError,
  );
  assertStringIncludes(
    error.message,
    'expected fallback or append, got "replace"',
  );
});

Deno.test("base_iri follows graph.context.wiki unless overridden", () => {
  assertEquals(
    new Config({ graph: { context: { wiki: "https://example.org/wiki/" } } })
      .base_iri,
    "https://example.org/wiki/",
  );
  assertEquals(
    new Config({
      graph: {
        context: { wiki: "https://example.org/wiki/" },
        base_iri: "https://example.org/docs/",
      },
    }).base_iri,
    "https://example.org/docs/",
  );
  assertThrows(
    () => new Config({ graph: { wiki_base: "https://example.org/wiki/" } }),
    SchemaValidationError,
  );
});

Deno.test("wiki.json loads, and @context is accepted as an alias", () => {
  withTempDir((base) => {
    writeFile(
      base,
      "wiki.json",
      JSON.stringify({
        wiki: { input: "json_wiki" },
        graph: { "@context": { json_pref: "http://json-pref.org/" } },
      }),
    );
    const config = Config.load(base);
    assertEquals(strings(config.wiki.input), [
      join(resolve(base), "json_wiki"),
    ]);
    assertEquals(config.namespaces.has("json_pref"), true);
  });
});

Deno.test("config invalid at construction is refused without a file", () => {
  assertThrows(
    () => new Config({ check: { filename_pattern: "[A-Za-z]+" } }),
    SchemaValidationError,
  );
  assertThrows(
    () => new Config({ check: { broken_links: "error" } }),
    SchemaValidationError,
  );
  assertThrows(
    () => new Config({ lint: { broken_links: "maybe" } }),
    SchemaValidationError,
  );
});

Deno.test("a validation failure renders a plain report", () => {
  const error = assertThrows(
    () => new Config({ lint: { broken_links: "maybe" } }),
    SchemaValidationError,
  );
  assertEquals(
    error.message,
    [
      "1 problem in Config",
      '  lint.broken_links: expected error, warning, or off, got "maybe"',
    ].join("\n"),
  );
});

Deno.test("a yaml syntax error names the file it came from", () => {
  withTempDir((base) => {
    writeFile(base, "wiki.yaml", "[invalid_yaml");
    const error = assertThrows(() => Config.load(base), ValueError);
    assertStringIncludes(error.message, "Failed to load config file wiki.yaml");
  });
});

Deno.test("a null block is refused rather than defaulted", () => {
  // `wiki:` with no content is an empty mapping, but `wiki: null` is a type
  // error — and the router turns that into a sentence naming the block.
  for (
    const block of [
      "wiki",
      "site",
      "graph",
      "link",
      "check",
      "lint",
      "sparql_service",
    ]
  ) {
    withTempDir((base) => {
      writeFile(base, "wiki.yaml", `${block}: null\n`);
      const error = assertThrows(() => Config.load(base), ValueError);
      assertEquals(
        error.message,
        `Invalid config file wiki.yaml: ${block} must be a mapping`,
      );
    });
  }
  // `sources: null` and `fmt: null` are *accepted* — both have a coercer that
  // reads None as "nothing declared" rather than as a typed block.
  for (const block of ["sources", "fmt"]) {
    withTempDir((base) => {
      writeFile(base, "wiki.yaml", `${block}: null\n`);
      assertEquals(Config.load(base) !== null, true);
    });
  }
  // A *bare* block key is not an empty block: YAML reads `wiki:` as null, so
  // two of them produce two model_type failures and the router, which handles
  // a single one, falls through to the plain report.
  withTempDir((base) => {
    writeFile(base, "wiki.yaml", "wiki:\nsite:\n");
    const error = assertThrows(() => Config.load(base), ValueError);
    assertEquals(
      error.message,
      [
        "Invalid config file wiki.yaml: 2 problems in Config",
        "  wiki: expected a mapping or WikiConfig",
        "  site: expected a mapping or SiteConfig",
      ].join("\n"),
    );
  });
});

Deno.test("top-level content must be a mapping", () => {
  withTempDir((base) => {
    writeFile(base, "wiki.yaml", "- one\n- two\n");
    const error = assertThrows(() => Config.load(base), ValueError);
    assertEquals(
      error.message,
      "Invalid config file wiki.yaml: top-level content must be a mapping",
    );
  });
});

Deno.test("inline fmt options are validated against Deno/dprint's surface", () => {
  withTempDir((base) => {
    writeFile(
      base,
      "wiki.yaml",
      [
        "wiki:",
        "  input: wiki",
        "fmt:",
        "  textWrap: never",
        "  lineWidth: 80",
        "  newLineKind: lf",
        "",
      ].join("\n"),
    );
    const config = Config.load(base);
    assertEquals(config.fmt?.options?.["textWrap"], "never");
  });
  withTempDir((base) => {
    writeFile(
      base,
      "wiki.json",
      JSON.stringify({
        wiki: { input: ["wiki"] },
        fmt: { textWrap: "never", lineWidth: 80, newLineKind: "lf" },
      }),
    );
    const config = Config.load(base);
    assertEquals(config.fmt?.options?.["lineWidth"], 80);
  });
  withTempDir((base) => {
    writeFile(
      base,
      "wiki.yaml",
      "wiki:\n  input: wiki\nfmt:\n  typo_key: true\n",
    );
    assertThrows(() => Config.load(base), ValueError, "Invalid key 'typo_key'");
  });
});

Deno.test("unknown fmt keys are listed together, without rename hints", () => {
  // A vault carrying both retired keys is the common case, and reporting only
  // the first one made the user edit, re-run, and discover the second.
  //
  // There are deliberately no per-key rename hints: AGENTS.md forbids them, and
  // the CHANGELOG's Migration section documents the key moves instead.
  withTempDir((base) => {
    writeFile(
      base,
      "wiki.yaml",
      'wiki:\n  input: wiki\nfmt:\n  wrap: "no"\n  end_of_line: lf\n',
    );
    const error = assertThrows(
      () => Config.load(base),
      ValueError,
    ) as ValueError;
    const message = error.message;
    // Both keys in one report.
    assertStringIncludes(message, "'wrap' and 'end_of_line'");
    // And the accepted surface is named.
    assertStringIncludes(message, "{'textWrap', 'lineWidth', 'newLineKind'}");
    // No per-key mapping is offered for either key.
    assertEquals(message.includes("is now"), false);
    assertEquals(message.includes("has no equivalent"), false);
  });
  withTempDir((base) => {
    writeFile(
      base,
      "wiki.yaml",
      'wiki:\n  input: wiki\nfmt:\n  extensions:\n    - "*.md"\n',
    );
    const error = assertThrows(
      () => Config.load(base),
      ValueError,
    ) as ValueError;
    assertStringIncludes(error.message, "Invalid key 'extensions'");
    assertStringIncludes(
      error.message,
      "{'textWrap', 'lineWidth', 'newLineKind'}",
    );
  });
  withTempDir((base) => {
    // A genuine typo is reported the same way: named, and never mapped onto a
    // nearest retired key that would send the user to a fix that does not apply.
    writeFile(base, "wiki.yaml", "wiki:\n  input: wiki\nfmt:\n  zzz: 1\n");
    const error = assertThrows(
      () => Config.load(base),
      ValueError,
    ) as ValueError;
    assertStringIncludes(error.message, "Invalid key 'zzz'");
    assertEquals(error.message.includes("is now"), false);
    assertEquals(error.message.includes("has no equivalent"), false);
  });
});
