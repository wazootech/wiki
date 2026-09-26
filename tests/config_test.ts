/**
 * Config tests, ported case-for-case from `tests/test_config.py`.
 *
 * The Python suite is the spec: every assertion below exists in the oracle's
 * tests, so a divergence is a port bug rather than a judgement call. The
 * `formatConfigValidationError` case at the end is the exception — it is new,
 * and it pins the pydantic-shaped error *routing* directly, which the
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
  formatConfigValidationError,
  normalizeApiPath,
  normalizeUrlStyle,
} from "../src/wiki/config.ts";
import {
  SchemaValidationError,
  type ValidationIssue,
  valueError,
} from "../src/wiki/schemas/validation.ts";

const MINIMAL_WIKI_YAML = "wiki:\n  input: [wiki]\n";

/** Run `body` with a fresh temp directory, cleaning up afterwards. */
function withTempDir(body: (root: string) => void): void {
  const dir = Deno.makeTempDirSync({ prefix: "wiki-config-" });
  try {
    body(dir);
  } finally {
    Deno.removeSync(dir, { recursive: true });
  }
}

/** Write `content` to `root/name` and hand back the file path. */
function writeFile(root: string, name: string, content: string): string {
  const file = join(root, name);
  Deno.writeTextFileSync(file, content);
  return file;
}

/** Render a path list for comparison, so assertions read like the Python ones. */
function strings(paths: readonly string[]): string[] {
  return paths.map((path) => path);
}

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
    "expected standard or wikilink, got 'not-a-style'",
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
    "expected fallback or append, got 'replace'",
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

Deno.test("a validation failure renders the way pydantic renders it", () => {
  const error = assertThrows(
    () => new Config({ lint: { broken_links: "maybe" } }),
    SchemaValidationError,
  );
  assertEquals(
    error.message,
    [
      "1 validation error for Config",
      "lint.broken_links",
      "  Value error, expected error, warning, or off, got 'maybe' " +
      "[type=value_error, input_value='maybe', input_type=str]",
      "    For further information visit https://errors.pydantic.dev/2.13/v/value_error",
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
  // a single one, falls through to the pydantic rendering.
  withTempDir((base) => {
    writeFile(base, "wiki.yaml", "wiki:\nsite:\n");
    const error = assertThrows(() => Config.load(base), ValueError);
    assertEquals(
      error.message,
      [
        "Invalid config file wiki.yaml: 2 validation errors for Config",
        "wiki",
        "  Input should be a valid dictionary or instance of WikiConfig " +
        "[type=model_type, input_value=None, input_type=NoneType]",
        "    For further information visit https://errors.pydantic.dev/2.13/v/model_type",
        "site",
        "  Input should be a valid dictionary or instance of SiteConfig " +
        "[type=model_type, input_value=None, input_type=NoneType]",
        "    For further information visit https://errors.pydantic.dev/2.13/v/model_type",
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

Deno.test("inline fmt options are validated against mdformat's surface", () => {
  withTempDir((base) => {
    writeFile(
      base,
      "wiki.yaml",
      [
        "wiki:",
        "  input: wiki",
        "fmt:",
        "  wrap: 'no'",
        "  extensions: [gfm, front_matters, wikilink]",
        "",
      ].join("\n"),
    );
    const config = Config.load(base);
    assertEquals(config.fmt?.options?.["wrap"], "no");
    assertEquals(config.fmt?.toml, null);
  });
  withTempDir((base) => {
    writeFile(
      base,
      "wiki.json",
      JSON.stringify({
        wiki: { input: ["wiki"] },
        fmt: { wrap: "no", extensions: ["gfm", "front_matters", "wikilink"] },
      }),
    );
    const config = Config.load(base);
    assertEquals(config.fmt?.options?.["extensions"], [
      "gfm",
      "front_matters",
      "wikilink",
    ]);
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

Deno.test("fmt accepts a relative path pointer and refuses an absolute one", () => {
  withTempDir((base) => {
    writeFile(base, "wiki.yaml", "wiki:\n  input: wiki\nfmt: custom.toml\n");
    const config = Config.load(base);
    assertEquals(
      config.fmt?.toml,
      join(resolve(base), "custom.toml"),
    );
    assertEquals(config.fmt?.options, null);
  });
  withTempDir((base) => {
    writeFile(base, "wiki.yaml", "wiki:\n  input: wiki\nfmt:\n");
    // An empty `fmt:` block is not a pointer to anything.
    assertEquals(Config.load(base).fmt, null);
  });
  withTempDir((base) => {
    const absolute = Deno.build.os === "windows"
      ? "C:/etc/mdformat.toml"
      : "/etc/mdformat.toml";
    const pathFlavour = Deno.build.os === "windows"
      ? "WindowsPath"
      : "PosixPath";
    writeFile(base, "wiki.yaml", `wiki:\n  input: wiki\nfmt: ${absolute}\n`);
    const error = assertThrows(() => Config.load(base), ValueError);
    // This one has no router branch of its own, so it falls through to the
    // pydantic rendering — including the doubled prefix, which the oracle
    // produces too and which a reader would otherwise think was a bug.
    assertEquals(
      error.message,
      "Invalid config file wiki.yaml: 1 validation error for Config\n" +
        "  Value error, Invalid config file wiki.yaml: fmt path must be relative " +
        "to the config file [type=value_error, input_value={" +
        `'wiki': {'input': 'wiki'}, 'fmt': '${absolute}', ` +
        `'config_root': ${pathFlavour}('${
          (resolve(base)).replaceAll("\\", "/")
        }')}, input_type=dict]\n` +
        "    For further information visit https://errors.pydantic.dev/2.13/v/value_error",
    );
  });
});

Deno.test("fmt must be a mapping or path string", () => {
  withTempDir((base) => {
    writeFile(base, "wiki.yaml", "wiki:\n  input: wiki\nfmt: true\n");
    const error = assertThrows(() => Config.load(base), ValueError);
    // The router recognises this one and reports it as a single sentence.
    assertEquals(
      error.message,
      "Invalid config file wiki.yaml: fmt must be a mapping or path string",
    );
  });
});

Deno.test("check.remote_schema policy is coerced", () => {
  const config = Config.forRoot(".", {
    check: {
      remote_schema_refs: "allowlist",
      remote_schema_hosts: ["schemas.example.org"],
    },
  });
  assertEquals(config.check.remote_schema_refs, "allowlist");
  assertEquals([...config.check.remote_schema_hosts], ["schemas.example.org"]);
});

Deno.test("sparql_service.enabled accepts the string spellings yaml allows", () => {
  withTempDir((base) => {
    writeFile(base, "wiki.yaml", 'sparql_service:\n  enabled: "false"\n');
    assertEquals(Config.load(base).sparql_service.enabled, false);
  });
  const variants: [string, boolean][] = [
    ["0", false],
    ["no", false],
    ["off", false],
    ["true", true],
    ["1", true],
    ["yes", true],
    ["on", true],
  ];
  for (const [raw, expected] of variants) {
    assertEquals(
      Config.forRoot(".", { sparql_service: { enabled: raw } }).sparql_service
        .enabled,
      expected,
      `enabled: ${raw}`,
    );
  }
  assertThrows(
    () => Config.forRoot(".", { sparql_service: { enabled: "maybe" } }),
    ValueError,
  );
});

Deno.test("formatConfigValidationError routes each error shape to its sentence", () => {
  // Direct routing checks, one per branch the Python function has. They assert
  // the *terminal* sentence, which is the part users read and the part a
  // harness can compare byte-for-byte.
  const route = (issues: readonly ValidationIssue[]) =>
    formatConfigValidationError(
      "wiki.yml",
      new SchemaValidationError("Config", issues),
    ).message;

  assertEquals(
    route([
      valueError(
        ["lint", "broken_links"],
        "expected error, warning, or off, got 'maybe'",
        "maybe",
      ),
    ]),
    "Invalid config file wiki.yml: Invalid lint.broken_links severity: 'maybe' " +
      "(expected error, warning, or off)",
  );
  assertEquals(
    route([
      valueError(
        ["check", "filename_pattern"],
        "expected error, warning, or off, got '[a-z]+'",
        "[a-z]+",
      ),
    ]),
    "Invalid config file wiki.yml: check.filename_pattern must be error, warning, or off; " +
      "put the regex in wiki.filename_pattern",
  );
  assertEquals(
    route([
      valueError(
        ["link", "style"],
        "expected standard or wikilink, got 'nope'",
        "nope",
      ),
    ]),
    "Invalid config file wiki.yml: Invalid link_style: 'nope' (expected standard or wikilink)",
  );
  assertEquals(
    route([{
      type: "extra_forbidden",
      loc: ["graph", "zzz"],
      msg: "Extra inputs are not permitted",
    }]),
    "Invalid config file wiki.yml: unknown graph keys: zzz",
  );
  assertEquals(
    route([
      {
        type: "extra_forbidden",
        loc: ["serve_api"],
        msg: "Extra inputs are not permitted",
      },
      {
        type: "extra_forbidden",
        loc: ["inputs"],
        msg: "Extra inputs are not permitted",
      },
    ]),
    "Invalid config file wiki.yml: unknown top-level keys: inputs, serve_api",
  );
  assertEquals(
    route([{
      type: "model_type",
      loc: ["site"],
      msg: "Input should be a valid dictionary or instance of SiteConfig",
    }]),
    "Invalid config file wiki.yml: site must be a mapping",
  );
  // A failure that matches no branch falls back to the full pydantic rendering.
  assertStringIncludes(
    route([valueError(["sources"], "Duplicate source name: 'a'", [])]),
    "1 validation error for Config",
  );
});

Deno.test("url style and api path normalisation", () => {
  assertEquals(normalizeUrlStyle(undefined), "dir");
  assertEquals(normalizeUrlStyle("FILE"), "file");
  assertThrows(() => normalizeUrlStyle("flat"), ValueError);
  assertEquals(normalizeApiPath(undefined), "/api/sparql");
  assertEquals(normalizeApiPath("/sparql/"), "/sparql");
  assertEquals(normalizeApiPath("/"), "/");
  assertThrows(() => normalizeApiPath("api/sparql"), ValueError);
});
