import type { TextWrap } from "../fmt_config.ts";

/**
 * The plugin versions this module was written against.
 *
 * Each is the exact version Deno 2.9.6 pins for the same plugin in its
 * `Cargo.toml` (`dprint-plugin-markdown = "=0.20.0"`,
 * `dprint-plugin-json = "=0.21.3"`, `dprint-plugin-typescript = "=0.96.1"`,
 * `pretty_yaml = "=0.5.0"`, `lax-css = "=0.3.0"`, `lax-markup = "=0.3.2"`), and
 * the published package carries the same number as the crate. Pinned exactly
 * rather than with a caret in `deno.json`, because a patch bump is a formatting
 * change: `tests/formatter_test.ts` asserts the loaded plugin agrees with the
 * table, so a drift is a failing test rather than a silently reflowed wiki.
 */
export const FORMATTER_PLUGIN_VERSIONS = {
  markdown: "0.20.0",
  json: "0.21.3",
  typescript: "0.96.1",
  yaml: "0.5.0",
  laxCss: "0.3.0",
  laxMarkup: "0.3.2",
} as const;

/** The `markdown` plugin config, minus `textWrap`. */
export function markdownPluginConfig(
  textWrap: TextWrap,
): Record<string, unknown> {
  return {
    textWrap,
    ignoreDirective: "deno-fmt-ignore",
    ignoreStartDirective: "deno-fmt-ignore-start",
    ignoreEndDirective: "deno-fmt-ignore-end",
    ignoreFileDirective: "deno-fmt-ignore-file",
  };
}

/** `dprint_plugin_json::configuration::ConfigurationBuilder::deno()`. */
export function denoJsonConfig(): Record<string, unknown> {
  return {
    ignoreNodeCommentText: "deno-fmt-ignore",
    "commentLine.forceSpaceAfterSlashes": false,
    trailingCommas: "never",
  };
}

/** `dprint_plugin_typescript::configuration::ConfigurationBuilder::deno()`. */
export function denoTypescriptConfig(): Record<string, unknown> {
  return {
    indentWidth: 2,
    nextControlFlowPosition: "sameLine",
    "binaryExpression.operatorPosition": "sameLine",
    "conditionalExpression.operatorPosition": "nextLine",
    "conditionalType.operatorPosition": "nextLine",
    bracePosition: "sameLine",
    "commentLine.forceSpaceAfterSlashes": false,
    "constructSignature.spaceAfterNewKeyword": true,
    "constructorType.spaceAfterNewKeyword": true,
    "arrowFunction.useParentheses": "force",
    newLineKind: "lf",
    "functionExpression.spaceAfterFunctionKeyword": true,
    "taggedTemplate.spaceBeforeLiteral": false,
    "conditionalExpression.preferSingleLine": true,
    quoteStyle: "preferDouble",
    "jsx.multiLineParens": "prefer",
    ignoreNodeCommentText: "deno-fmt-ignore",
    ignoreFileCommentText: "deno-fmt-ignore-file",
    "module.sortImportDeclarations": "maintain",
    "module.sortExportDeclarations": "maintain",
    "exportDeclaration.sortTypeOnlyExports": "none",
    "importDeclaration.sortTypeOnlyImports": "none",
  };
}

/**
 * `get_resolved_yaml_config()` — `pretty_yaml` at its own defaults except the
 * ignore directive, which deno renames. Every other key deno sets (`print_width`
 * 80, `indent_width` 2, `line_break` lf, `quotes` prefer-double,
 * `trailing_comma` true, `format_comments` false,
 * `indent_block_sequence_in_map` true, `brace_spacing` true,
 * `bracket_spacing` false, `dash_spacing` one-space, `prefer_single_line` false)
 * is already the plugin default, which `probes/fmt-dprint/FINDINGS.md` records
 * rather than assumes.
 */
/**
 * The `dprint-plugin-yaml` package.json, as a full `npm:` specifier.
 *
 * Not the bare `dprint-plugin-yaml/package.json` alias: JSR rewrites bare
 * specifiers in import statements on publish, but never in
 * `import.meta.resolve` arguments, so run from JSR the bare alias fails with
 * "not a dependency" and `wiki fmt` crashes. `formatter_test.ts` pins this
 * version to deno.json's.
 */
export const YAML_PLUGIN_PACKAGE_JSON =
  "npm:dprint-plugin-yaml@0.5.0/package.json";

export function denoYamlConfig(): Record<string, unknown> {
  return { ignore_comment_directive: "deno-fmt-ignore" };
}
