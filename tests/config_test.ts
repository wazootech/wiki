/**
 * Config tests, ported case-for-case from `tests/test_config.py`.
 *
 * The Python suite is the spec: every assertion below exists in the oracle's
 * tests, so a divergence is a port bug rather than a judgement call. The
 * `formatConfigValidationError` case at the end is the exception — it is new,
 * and it pins the validation-error *routing* directly, which the
 * filesystem cases only reach indirectly.
 */

import { join, resolve } from "@std/path";
import { ValueError } from "../src/wiki/errors.ts";
import { assertEquals, assertStringIncludes, assertThrows } from "@std/assert";
import {
  Config,
  DEFAULT_CHECK_CONFIG,
  DEFAULT_LINT_CONFIG,
  DEFAULT_NAMESPACES,
} from "../src/wiki/config.ts";
import {
  MINIMAL_WIKI_YAML,
  strings,
  withTempDir,
  writeFile,
} from "./config_support.ts";

Deno.test("Config has the documented defaults", () => {
  const config = new Config();
  assertEquals(
    strings(config.wiki.input),
    [join(resolve(config.config_root), "wiki")],
  );
  assertEquals(config.wiki.assets.length, 0);
  assertEquals(config.graph.include_file_extension, false);
  assertEquals(config.site.base_url, "/wiki");
  assertEquals(config.site.url_style, "dir");
  assertEquals(config.wiki.filename_pattern, null);
  assertEquals(config.check, DEFAULT_CHECK_CONFIG);
  assertEquals(config.lint, DEFAULT_LINT_CONFIG);
  assertEquals(config.sparql_service.enabled, false);
  assertEquals(config.sparql_service.path, "/api/sparql");
  assertEquals(config.link.style, "standard");
  assertEquals(config.fmt, null);
  assertEquals(config.namespaces.get("schema"), DEFAULT_NAMESPACES["schema"]);
});

Deno.test("graph.include_file_extension coerces quoted YAML booleans", () => {
  withTempDir((base) => {
    writeFile(base, "wiki.yaml", "graph:\n  include_file_extension: 'false'\n");
    assertEquals(Config.load(base).graph.include_file_extension, false);
  });
  withTempDir((base) => {
    writeFile(base, "wiki.yaml", "graph:\n  include_file_extension: 'true'\n");
    assertEquals(Config.load(base).graph.include_file_extension, true);
  });
  withTempDir((base) => {
    writeFile(base, "wiki.yaml", "graph:\n  include_file_extension: 'maybe'\n");
    assertThrows(
      () => Config.load(base),
      ValueError,
      "expected boolean include_file_extension",
    );
  });
  withTempDir((base) => {
    writeFile(base, "wiki.yaml", "graph:\n  include_file_extension: null\n");
    assertThrows(
      () => Config.load(base),
      ValueError,
      "expected boolean include_file_extension",
    );
  });
});

Deno.test("Config.load tolerates a UTF-8 BOM in yaml and json (wiki#312)", () => {
  withTempDir((base) => {
    writeFile(base, "wiki.yml", `\uFEFF${MINIMAL_WIKI_YAML}`);
    assertEquals(
      strings(Config.load(base).wiki.input),
      [join(resolve(base), "wiki")],
    );
  });
  withTempDir((base) => {
    // JSON is strict about a BOM, so this used to fail to parse at all.
    writeFile(
      base,
      "wiki.json",
      `\uFEFF${JSON.stringify({ wiki: { input: ["wiki"] } })}`,
    );
    assertEquals(
      strings(Config.load(base).wiki.input),
      [join(resolve(base), "wiki")],
    );
  });
});

Deno.test("Config.load falls back to defaults when no config file exists", () => {
  withTempDir((base) => {
    const config = Config.load(base);
    assertEquals(
      strings(config.wiki.input),
      [join(resolve(config.config_root), "wiki")],
    );
  });
});

Deno.test("Config.load parses a full wiki.yaml", () => {
  withTempDir((base) => {
    writeFile(
      base,
      "wiki.yaml",
      [
        "wiki:",
        "  input: custom_wiki",
        "  assets: [assets, media/photos]",
        "  exclude: ['wiki/drafts/**', 'assets/private/**']",
        "  filename_pattern: '[A-Za-z0-9_()-]+\\.md'",
        "site:",
        "  base_url: /docs",
        "  url_style: file",
        "graph:",
        "  context:",
        "    custom_pref: http://custom-pref.org/",
        "check:",
        "  missing_layout_file: error",
        "  frontmatter_schema: error",
        "  missing_schema_ref: warning",
        "lint:",
        "  broken_links: error",
        "  filename_pattern: error",
        "sparql_service:",
        "  enabled: false",
        "  path: /sparql",
        "",
      ].join("\n"),
    );

    const config = Config.load(base);
    assertEquals(strings(config.wiki.input), [
      join(resolve(base), "custom_wiki"),
    ]);
    assertEquals(strings(config.wiki.assets), [
      join(resolve(base), "assets"),
      join(resolve(base), "media/photos"),
    ]);
    assertEquals([...config.wiki.exclude], [
      "wiki/drafts/**",
      "assets/private/**",
    ]);
    assertEquals(config.check.missing_layout_file, "error");
    assertEquals(config.check.frontmatter_schema, "error");
    assertEquals(config.check.missing_schema_ref, "warning");
    assertEquals(config.lint.broken_links, "error");
    assertEquals(config.lint.filename_pattern, "error");
    assertEquals(config.wiki.filename_pattern, "[A-Za-z0-9_()-]+\\.md");
    assertEquals(config.site.base_url, "/docs");
    assertEquals(config.site.url_style, "file");
    assertEquals(config.sparql_service.enabled, false);
    assertEquals(config.sparql_service.path, "/sparql");
    assertEquals(config.namespaces.has("custom_pref"), true);
  });
});

Deno.test("Config.load resolves a custom page layout against the config file", () => {
  withTempDir((base) => {
    Deno.mkdirSync(join(base, "layouts"));
    writeFile(join(base, "layouts"), "custom.html", "<html></html>");
    writeFile(base, "wiki.yaml", "site:\n  layout: layouts/custom.html\n");
    const config = Config.load(base);
    assertEquals(
      config.page_layout,
      resolve(join(join(base, "layouts"), "custom.html")),
    );
  });
});

Deno.test("unknown or removed keys are refused with a routed message", () => {
  const cases: [string, string][] = [
    [
      "site:\n  manifest:\n    name: Acme Docs\n",
      "unknown site keys: manifest",
    ],
    ["site:\n  title: Acme Docs\n", "unknown site keys: title"],
    ["site:\n  theme_color: '#f00'\n", "unknown site keys: theme_color"],
    ["site:\n  favicon: /icon.png\n", "unknown site keys: favicon"],
    ["serve_api:\n  enabled: true\n", "unknown top-level keys: serve_api"],
  ];
  for (const [content, expected] of cases) {
    withTempDir((base) => {
      writeFile(base, "wiki.yaml", content);
      const error = assertThrows(() => Config.load(base), ValueError);
      assertEquals(error.message, `Invalid config file wiki.yaml: ${expected}`);
    });
  }
});

Deno.test("removed flat top-level keys are reported together", () => {
  withTempDir((base) => {
    writeFile(
      base,
      "wiki.yaml",
      "inputs: wiki\nlink_style: markdown\nwiki_base: https://example.org/wiki/\n",
    );
    const error = assertThrows(() => Config.load(base), ValueError);
    assertStringIncludes(error.message, "unknown top-level keys");
    assertStringIncludes(error.message, "inputs");
    assertStringIncludes(error.message, "link_style");
    assertStringIncludes(error.message, "wiki_base");
  });
});

Deno.test("camelCase top-level keys are unknown keys, not silent no-ops", () => {
  withTempDir((base) => {
    Deno.mkdirSync(join(base, "assets"));
    writeFile(
      base,
      "wiki.yaml",
      [
        "inputDirs: camel_wiki",
        "assetDirs: [assets]",
        "wikiBase: https://example.org/wiki/",
        "baseUrl: /docs",
        "urlStyle: file",
        "contentPredicate: schema:text",
        "uriExt: true",
        "filenamePattern: '[a-z]+'",
        "serveApi:",
        "  enabled: true",
        "  path: /sparql",
        "",
      ].join("\n"),
    );
    assertThrows(() => Config.load(base), ValueError, "unknown top-level keys");
  });
});

Deno.test("wiki.allow_unknown_keys accepts unknown top-level keys", () => {
  withTempDir((base) => {
    writeFile(
      base,
      "wiki.yaml",
      "name: Acme\nnavigation: [a, b]\nwiki:\n  allow_unknown_keys: true\n  input: pages\n",
    );
    const config = Config.load(base);
    assertEquals(config.wiki.input, [join(base, "pages")]);
  });
});

Deno.test("wiki.allow_unknown_keys still rejects unknown keys inside a block", () => {
  withTempDir((base) => {
    writeFile(
      base,
      "wiki.yaml",
      "name: Acme\nwiki:\n  allow_unknown_keys: true\nsite:\n  title: Acme\n",
    );
    const error = assertThrows(() => Config.load(base), ValueError);
    assertEquals(
      error.message,
      "Invalid config file wiki.yaml: unknown site keys: title",
    );
  });
});

Deno.test("wiki.allow_unknown_keys defaults to rejecting unknown keys", () => {
  withTempDir((base) => {
    writeFile(
      base,
      "wiki.yaml",
      "name: Acme\nwiki:\n  allow_unknown_keys: false\n",
    );
    assertThrows(
      () => Config.load(base),
      ValueError,
      "unknown top-level keys: name",
    );
  });
});

Deno.test("unknown keys inside a block name the block", () => {
  const cases: [string, string][] = [
    [
      "wiki:\n  input: wiki\ncheck:\n  brokenLinks: error\n",
      "unknown check keys: brokenLinks",
    ],
    [
      "wiki:\n  input: wiki\nsparql_service:\n  enable: true\n",
      "unknown sparql_service keys: enable",
    ],
    [
      "wiki:\n  input: wiki\nlint:\n  brokenLinks: error\n",
      "unknown lint keys: brokenLinks",
    ],
    [
      "wiki:\n  input: wiki\ncheck:\n  filename_pattern: warning\n  broken_links: warning\n",
      "unknown check keys: broken_links, filename_pattern",
    ],
  ];
  for (const [content, expected] of cases) {
    withTempDir((base) => {
      writeFile(base, "wiki.yaml", content);
      assertThrows(() => Config.load(base), ValueError, expected);
    });
  }
});

Deno.test("the assets default only kicks in when the directory exists", () => {
  withTempDir((base) => {
    Deno.mkdirSync(join(base, "assets"));
    writeFile(base, "wiki.yaml", MINIMAL_WIKI_YAML);
    const config = Config.load(base);
    assertEquals(strings(config.wiki.assets), [
      join(resolve(base), "assets"),
    ]);
  });
});
