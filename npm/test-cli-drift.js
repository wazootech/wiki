/* CLI manifest drift detector.
 *
 * Generates a Python CLI manifest via Click introspection, then compares
 * it against the TypeScript Wiki class binding surface. CI fails when the
 * CLI gains / removes / renames a subcommand or option without a matching
 * TypeScript binding update.
 */

const assert = require("assert");
const { execSync } = require("child_process");
const { Wiki } = require("./dist/index.js");

// --------------------------------------------------------------------------
// Expected TS method → options mapping
// --------------------------------------------------------------------------
// Source of truth for what the TypeScript Wiki class should expose per
// subcommand.  Each list entry is the camelCase option name as it appears
// in the TS interface (the `options` parameter of the method).
//
// When adding a new CLI option, add its camelCase name here.  When the
// manifest detects an option not in this map, the test fails.

const EXPECTED_OPTIONS = {
  check: ["strict", "verbose", "files"],
  lint: ["strict", "verbose", "files"],
  build: ["outputDir", "baseUrl", "urlStyle", "render", "reload", "cache", "noCheck", "verbose"],
  fmt: ["check", "verbose", "files"],
  render: ["check", "reload", "cache", "noInference", "verbose", "files"],
  export: ["output", "format", "mode", "parseJson", "files"],
  link: ["apply", "fixBroken", "dryRun", "check", "verbose", "files"],
  query: ["query", "format", "output", "noInference", "reload", "cache", "jq", "pretty", "verbose", "parseJson"],
  serve: ["host", "port", "baseUrl", "urlStyle", "watch"],
  init: [
    "git", "repo", "graphContextWiki", "siteBaseUrl", "siteUrlStyle",
    "graphContentPredicate", "linkStyle", "wikiInputs", "graphBaseIri",
    "graphImplicitTypes", "graphImplicitTypesPolicy", "graphIncludeFileExtension",
  ],
  upgrade: ["check", "yes", "verbose"],
};

// Per-command rename maps from Python snake_case param names to their
// TypeScript camelCase equivalents.  Params not listed here use the
// convention-based fallback (snake_case → camelCase).
const RENAME_MAP = {
  default: {
    disk_cache: "cache",
    no_check: "noCheck",
    fix_broken: "fixBroken",
    dry_run: "dryRun",
    no_inference: "noInference",
    wiki_inputs: "wikiInputs",
    config_path: "config",
    graph_context_wiki: "graphContextWiki",
    graph_content_predicate: "graphContentPredicate",
    graph_base_iri: "graphBaseIri",
    graph_implicit_types: "graphImplicitTypes",
    graph_implicit_types_policy: "graphImplicitTypesPolicy",
    graph_include_file_extension: "graphIncludeFileExtension",
  },
  build: { site_base_url: "baseUrl", site_url_style: "urlStyle" },
  serve: { site_base_url: "baseUrl", site_url_style: "urlStyle" },
  init: {
    init_git: "git",
    site_base_url: "siteBaseUrl",
    site_url_style: "siteUrlStyle",
  },
  query: { output_format: "format", query_args: "query" },
  export: { rdf_format: "format" },
  upgrade: { check_only: "check", auto_yes: "yes" },
};

// Positional argument names that appear in the CLI but map differently in TS.
const POSITIONAL_ARGS = new Set(["files", "query_args"]);

// TS-only methods that have no corresponding Python subcommand.
const TS_ONLY_METHODS = new Set(["preflight", "format"]);

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

function snakeToCamel(name) {
  return name.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

function toTsOptionName(cmdName, pythonName) {
  const cmdMap = RENAME_MAP[cmdName];
  if (cmdMap && cmdMap[pythonName]) return cmdMap[pythonName];
  if (RENAME_MAP.default[pythonName]) return RENAME_MAP.default[pythonName];
  return snakeToCamel(pythonName);
}

// --------------------------------------------------------------------------
// Main
// --------------------------------------------------------------------------

async function main() {
  let exitCode = 0;
  const errors = [];

  function fail(msg) {
    errors.push(msg);
    exitCode = 1;
  }

  // 1. Generate Python CLI manifest
  let manifest;
  try {
    const raw = execSync("uv run python scripts/export_cli_manifest.py", {
      encoding: "utf-8",
      timeout: 30_000,
    });
    manifest = JSON.parse(raw);
  } catch (err) {
    fail(`Failed to generate CLI manifest: ${err.message}`);
    console.error(errors.join("\n"));
    process.exit(1);
  }

  console.log(`CLI manifest: ${manifest.tool} v${manifest.version}`);

  // 2. Verify each command
  const tsProto = Wiki.prototype;
  const tsMethods = new Set(
    Object.getOwnPropertyNames(tsProto).filter(
      (n) => typeof tsProto[n] === "function" && n !== "constructor",
    ),
  );

  for (const cmd of manifest.commands) {
    const cmdName = cmd.name;

    if (!tsMethods.has(cmdName)) {
      fail(`Missing TS method: Wiki.prototype.${cmdName}() — add it to npm/src/wiki.ts`);
      continue;
    }

    const tsOptions = EXPECTED_OPTIONS[cmdName];
    if (!tsOptions) {
      fail(`Missing EXPECTED_OPTIONS entry for "${cmdName}" — add to npm/test-cli-drift.js`);
      continue;
    }

    const tsOptionSet = new Set(tsOptions);

    for (const opt of cmd.options) {
      if (POSITIONAL_ARGS.has(opt.name)) continue;

      const tsName = toTsOptionName(cmdName, opt.name);
      if (!tsOptionSet.has(tsName)) {
        fail(
          `Missing TS option: ${cmdName}() → "${tsName}" (Python param "${opt.name}") — expected one of: ${tsOptions.join(", ")}`,
        );
      }
    }
  }

  // 3. Check known TS-only methods still exist
  for (const method of TS_ONLY_METHODS) {
    if (!tsMethods.has(method)) {
      fail(`Missing TS-only method: Wiki.prototype.${method}() — expected convenience method`);
    }
  }

  // 4. Report
  if (exitCode === 0) {
    const cmdCount = manifest.commands.length;
    const optCount = manifest.commands.reduce((n, c) => n + c.options.length, 0);
    console.log(`Drift check passed: ${cmdCount} commands, ${optCount} options match TS bindings.`);
  } else {
    console.error(`Drift check FAILED (${errors.length} issue(s)):\n`);
    for (const err of errors) {
      console.error(`  ✖  ${err}`);
    }
  }

  process.exit(exitCode);
}

main().catch((err) => {
  console.error("Drift check crashed:", err);
  process.exit(1);
});
