/**
 * CLI drift detector — verifies TypeScript bindings match Pydantic models.
 *
 * Generates a command→options map from Pydantic models, then checks
 * that every subcommand has a Wiki.prototype method and matching
 * expected option names.
 */

const { execSync } = require("child_process");
const { Wiki } = require("./dist/index.js");

const EXPECTED_OPTIONS = {
  build: ["baseUrl", "cache", "noCheck", "outputDir", "reload", "render", "urlStyle", "verbose"],
  check: ["files", "strict", "verbose"],
  export: ["files", "format", "mode", "output"],
  fmt: ["check", "files", "verbose"],
  init: ["baseUrl", "git", "graphBaseIri", "graphContentPredicate", "graphContextWiki", "graphImplicitTypes", "graphImplicitTypesPolicy", "graphIncludeFileExtension", "linkStyle", "repo", "urlStyle", "wikiInputs"],
  link: ["apply", "check", "dryRun", "files", "fixBroken", "verbose"],
  lint: ["files", "strict", "verbose"],
  query: ["cache", "format", "jq", "noInference", "output", "pretty", "query", "reload", "verbose"],
  render: ["cache", "check", "files", "noInference", "reload", "verbose"],
  serve: ["baseUrl", "host", "port", "urlStyle", "watch"],
  upgrade: ["check", "verbose", "yes"],
};

// TS methods without a corresponding subcommand.
const TS_ONLY = new Set(["preflight", "format"]);

function main() {
  let exitCode = 0;
  const errors = [];

  const manifest = JSON.parse(
    execSync("uv run python scripts/export_cli_shapes.py", {
      encoding: "utf-8",
      timeout: 30_000,
    })
  );

  const tsProto = Wiki.prototype;
  const tsMethods = new Set(
    Object.getOwnPropertyNames(tsProto).filter(
      (n) => typeof tsProto[n] === "function" && n !== "constructor"
    )
  );

  for (const [cmd, pyOptions] of Object.entries(manifest)) {
    if (!tsMethods.has(cmd)) {
      errors.push(`Missing TS method: Wiki.prototype.${cmd}()`);
      continue;
    }

    const tsOptions = EXPECTED_OPTIONS[cmd];
    if (!tsOptions) {
      errors.push(`Missing EXPECTED_OPTIONS entry for "${cmd}" — add to npm/test-cli-drift.js`);
      continue;
    }

    const tsSet = new Set(tsOptions);
    for (const opt of pyOptions) {
      if (!tsSet.has(opt)) {
        errors.push(`Missing TS option: ${cmd}() → "${opt}" — expected one of: [${tsOptions.join(", ")}]`);
      }
    }
  }

  for (const method of TS_ONLY) {
    if (!tsMethods.has(method)) {
      errors.push(`Missing TS-only method: Wiki.prototype.${method}()`);
    }
  }

  if (exitCode === 0 && errors.length === 0) {
    const cmdCount = Object.keys(manifest).length;
    console.log(`Drift check passed: ${cmdCount} commands, ${Object.values(manifest).flat().length} options match TS bindings.`);
  } else {
    exitCode = 1;
    console.error(`Drift check FAILED (${errors.length} issue(s)):\n`);
    for (const err of errors) {
      console.error(`  *  ${err}`);
    }
  }

  process.exit(exitCode);
}

main();
