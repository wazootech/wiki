/**
 * The host-plugin configs `deno fmt` builds, transcribed for the JS plugins.
 *
 * `deno fmt` does not run the host plugins at their own defaults: it calls a
 * `deno()` preset on each plugin's Rust configuration builder, then overrides
 * `line_width` with the width the markdown plugin computed for the code block.
 * The JS packages have no `deno()` method, so the presets are transcribed here
 * key by key from `dprint-plugin-json` 0.21.3, `dprint-plugin-typescript`
 * 0.96.1, and `pretty_yaml` 0.5.0 — the exact versions `Cargo.toml` pins for
 * Deno 2.9.6.
 *
 * Two of the three are not "defaults with a twist":
 *
 * - **json** — the plugin's own defaults are `trailingCommas: "jsonc"`,
 *   `commentLine.forceSpaceAfterSlashes: true`, and the `dprint-ignore`
 *   directives; deno wants `never`, `false`, and `deno-fmt-ignore`.
 * - **typescript** — the plugin's defaults are `quoteStyle: "alwaysDouble"`,
 *   `semiColons: "prefer"`, sorting on, and a `sameLineUnlessHanging` brace
 *   position; deno wants `preferDouble`, per-node `sameLine` braces,
 *   `maintain` sort order, and `force` arrow parentheses.
 * - **yaml** — deno's values are the plugin defaults except
 *   `ignore_comment_directive`, which is `deno-fmt-ignore` rather than
 *   `pretty-yaml-ignore`. Verified by printing the resolved config.
 */

/** `dprint_plugin_json::configuration::ConfigurationBuilder::deno()`. */
export function denoJsonConfig(): Record<string, unknown> {
  return {
    lineWidth: 80,
    ignoreNodeCommentText: "deno-fmt-ignore",
    "commentLine.forceSpaceAfterSlashes": false,
    trailingCommas: "never",
  };
}

/** `dprint_plugin_typescript::configuration::ConfigurationBuilder::deno()`. */
export function denoTypescriptConfig(): Record<string, unknown> {
  return {
    lineWidth: 80,
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

/** `get_resolved_yaml_config()` — plugin defaults plus the deno directive. */
export function denoYamlConfig(): Record<string, unknown> {
  return {
    ignore_comment_directive: "deno-fmt-ignore",
  };
}
