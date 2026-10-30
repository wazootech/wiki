import { ValueError } from "../src/wiki/errors.ts";
import { assertEquals, assertStringIncludes, assertThrows } from "@std/assert";
import {
  Config,
  formatConfigValidationError,
  normalizeApiPath,
  normalizeUrlStyle,
} from "../src/wiki/config.ts";
import {
  SchemaValidationError,
  type ValidationIssue,
  valueError,
} from "../src/wiki/schemas/validation.ts";
import { withTempDir, writeFile } from "./config_support.ts";

Deno.test("fmt accepts only an inline options mapping", () => {
  withTempDir((base) => {
    writeFile(
      base,
      "wiki.yaml",
      "wiki:\n  input: wiki\nfmt:\n  textWrap: never\n",
    );
    assertEquals(Config.load(base).fmt?.options?.["textWrap"], "never");
  });
  withTempDir((base) => {
    writeFile(base, "wiki.yaml", "wiki:\n  input: wiki\nfmt: custom.toml\n");
    assertThrows(
      () => Config.load(base),
      ValueError,
      "fmt must be a mapping",
    );
  });
  withTempDir((base) => {
    writeFile(base, "wiki.yaml", "wiki:\n  input: wiki\nfmt: true\n");
    assertThrows(
      () => Config.load(base),
      ValueError,
      "fmt must be a mapping",
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
    'Invalid config file wiki.yml: Invalid lint.broken_links severity: "maybe" ' +
      "(expected error, warning, or off)",
  );
  assertEquals(
    route([
      valueError(
        ["check", "filename_pattern"],
        'expected error, warning, or off, got "[a-z]+"',
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
        'expected standard or wikilink, got "nope"',
        "nope",
      ),
    ]),
    'Invalid config file wiki.yml: Invalid link_style: "nope" (expected standard or wikilink)',
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
  // A failure that matches no branch falls back to the plain report.
  assertStringIncludes(
    route([valueError(["sources"], "Duplicate source name: 'a'", [])]),
    "1 problem in Config",
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
