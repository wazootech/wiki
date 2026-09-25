/**
 * The markdown formatter: `dprint-plugin-markdown`, called in process.
 *
 * `fmt_util.ts` owns *which* options apply and where they came from; this module
 * owns applying them. It replaces everything `deno fmt` used to do on the port's
 * behalf when `wiki fmt` shelled out to it: which plugin formats markdown, how
 * that plugin is configured, and which other formatters its fenced code blocks
 * are handed to.
 *
 * That last part is most of the module, and it is not mechanical. `deno fmt`
 * calls `dprint_plugin_markdown::format_text` — the *library* — with its own
 * closure, so **deno** decides which fence tags reach a formatter. The WASM build
 * we load filters tags itself, in `wasm_plugin.rs`'s `tag_to_extension`, before
 * any host callback is consulted. The two tables disagree in both directions:
 *
 * - `html` is absent from `tag_to_extension`, so an ` ```html ` fence can never
 *   be delegated through the WASM plugin. Deno formats them. `formatHtmlFences`
 *   closes that one from the outside; see its comment.
 * - `xml`, `toml`, `py`, `rs`, `cs`, `vb`, `graphql` and `dockerfile` are
 *   present in `tag_to_extension` and absent from deno's tag list, so a
 *   formatter registered for them would start restyling fences `deno fmt`
 *   deliberately leaves alone. `dispatch`'s default arm refuses them.
 *
 * Registering plugins through `@dprint/formatter`'s `createContext()` — which
 * routes by file extension over whatever is registered — gets both of those
 * wrong, so `dispatch` is written by hand instead. Measured before the cutover:
 * `probes/fmt-dprint/`.
 *
 * Two widths are in play and deno uses different ones per language: `json` and
 * `typescript` get the width the markdown plugin computed for the block, which
 * arrives as `overrideConfig.lineWidth`; `yaml`, `css` and `html` ignore that
 * and use the file-level width. Both are reproduced below.
 *
 * The plugins are loaded lazily, on the first format. That keeps `import` free of
 * permissions — `cli.ts` must stay importable for `--version` — and keeps `wiki
 * check` from paying to instantiate ~8 MB of WebAssembly it will never call.
 */

import { createFromBuffer, type Formatter } from "@dprint/formatter";
import * as markdownPlugin from "@dprint/markdown";
import * as jsonPlugin from "@dprint/json";
import * as typescriptPlugin from "@dprint/typescript";
import { type Path, ValueError } from "./fspath.ts";
import { pyReprString } from "./pyrepr.ts";

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

/**
 * The line width `--line-width` defaults to, and the width the plugin uses when
 * `wrap` is not a number.
 */
export const DEFAULT_LINE_WIDTH = 80;

/** The `markdown` plugin config, minus `textWrap`. */
function markdownPluginConfig(textWrap: string): Record<string, unknown> {
  return {
    textWrap,
    ignoreDirective: "deno-fmt-ignore",
    ignoreStartDirective: "deno-fmt-ignore-start",
    ignoreEndDirective: "deno-fmt-ignore-end",
    ignoreFileDirective: "deno-fmt-ignore-file",
  };
}

/** `dprint_plugin_json::configuration::ConfigurationBuilder::deno()`. */
function denoJsonConfig(): Record<string, unknown> {
  return {
    ignoreNodeCommentText: "deno-fmt-ignore",
    "commentLine.forceSpaceAfterSlashes": false,
    trailingCommas: "never",
  };
}

/** `dprint_plugin_typescript::configuration::ConfigurationBuilder::deno()`. */
function denoTypescriptConfig(): Record<string, unknown> {
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
 * is already the plugin default, which `probes/fmt-dprint/host-config.ts` prints
 * rather than assumes.
 */
function denoYamlConfig(): Record<string, unknown> {
  return { ignore_comment_directive: "deno-fmt-ignore" };
}

/** `dprint-plugin-yaml` and `lax-markup` publish only `plugin.wasm`. */
function wasmFromPackage(specifier: string): Uint8Array<ArrayBuffer> {
  return new Uint8Array(
    Deno.readFileSync(new URL(import.meta.resolve(specifier))),
  );
}

/** `@dprint/*` packages export a `getPath()` helper instead. */
function wasmFromPath(path: string): Uint8Array<ArrayBuffer> {
  return new Uint8Array(Deno.readFileSync(path));
}

/** The loaded plugin graph. Built once per process, on the first format. */
interface Plugins {
  readonly markdown: Formatter;
  readonly typescript: Formatter;
  readonly json: Formatter;
  readonly yaml: Formatter;
  readonly css: Formatter;
  readonly markup: Formatter;
}

let plugins: Plugins | null = null;

/**
 * The one plugin graph, built on first use.
 *
 * A process-wide singleton, and safe as one only because
 * {@link formatMarkdownText} is synchronous: it configures the markdown plugin
 * and formats with it without yielding, so two pages can never interleave a
 * `setConfig` and a `formatText`. An `async` version of this function would have
 * to hold one markdown plugin per concurrent call instead.
 */
function loadPlugins(): Plugins {
  const build = (
    wasm: Uint8Array<ArrayBuffer>,
    pluginConfig: Record<string, unknown>,
  ): Formatter => {
    const formatter = createFromBuffer(wasm);
    // Two arguments is the whole contract: `setConfig(globalConfig,
    // pluginConfig)`. Calling it with one panics inside the plugin
    // (`RuntimeError: unreachable` out of `register_config`) with no hint as to
    // why, so the empty configs below are explicit rather than omitted.
    formatter.setConfig({ lineWidth: DEFAULT_LINE_WIDTH }, pluginConfig);
    return formatter;
  };

  return {
    markdown: build(
      wasmFromPath(markdownPlugin.getPath()),
      markdownPluginConfig("never"),
    ),
    typescript: build(
      wasmFromPath(typescriptPlugin.getPath()),
      denoTypescriptConfig(),
    ),
    json: build(wasmFromPath(jsonPlugin.getPath()), denoJsonConfig()),
    yaml: build(
      wasmFromPackage("dprint-plugin-yaml/plugin.wasm"),
      denoYamlConfig(),
    ),
    css: build(wasmFromPackage("lax-css/plugin.wasm"), {}),
    markup: build(wasmFromPackage("lax-markup/plugin.wasm"), {}),
  };
}

function loaded(): Plugins {
  plugins ??= loadPlugins();
  return plugins;
}

/** The extension of the fake `file.<ext>` path the markdown plugin hands over. */
function extensionOf(filePath: string): string {
  const name = filePath.slice(
    Math.max(filePath.lastIndexOf("/"), filePath.lastIndexOf("\\")) + 1,
  );
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

function widthOf(overrideConfig: unknown): number {
  const value = (overrideConfig as { lineWidth?: unknown } | undefined)
    ?.lineWidth;
  return typeof value === "number" ? value : DEFAULT_LINE_WIDTH;
}

/**
 * Route one fenced code block to the formatter deno would have routed it to.
 *
 * The `default` arm is load-bearing twice over: it is what leaves `bash`,
 * `sparql`, `python`, `toml` and friends verbatim — matching mdformat, and
 * matching what the shielding probe measured — and it is what stops the WASM
 * gate's wider reachability from leaking into the output.
 */
function dispatch(host: Plugins, request: {
  readonly filePath: string;
  readonly fileText: string;
  readonly overrideConfig?: unknown;
}): string {
  const tag = extensionOf(request.filePath);
  const at = (lineWidth: number) => ({
    filePath: request.filePath,
    fileText: request.fileText,
    overrideConfig: { lineWidth },
  });
  switch (tag) {
    case "ts":
    case "tsx":
    case "js":
    case "jsx":
      return host.typescript.formatText(at(widthOf(request.overrideConfig)));
    case "json":
    case "jsonc":
      return host.json.formatText(at(widthOf(request.overrideConfig)));
    case "css":
    case "scss":
    case "less":
      return host.css.formatText(at(DEFAULT_LINE_WIDTH));
    case "yaml":
      return host.yaml.formatText(at(DEFAULT_LINE_WIDTH));
    default:
      return request.fileText;
  }
}

/**
 * Format the body of every ` ```html ` fence with `lax-markup`.
 *
 * The one gap the hand-written dispatcher cannot close from the inside: deno
 * formats ` ```html ` fences, and `tag_to_extension` never asks, so no host
 * formatter can be registered for them. Doing it after the fact is the same
 * formatter at the same width, one layer too late.
 *
 * The body the plugin emits is the source text, trimmed and unindented — the
 * same text deno hands to `format_html` — and deno applies
 * `unindent(trim_end())` to whatever the host returns. So the body is
 * de-indented to column 0, formatted, trimmed, and re-indented to the fence's
 * own indentation; a fence inside a list item keeps its alignment rather than
 * being flattened to the left margin.
 *
 * An unterminated fence is left exactly as the plugin produced it.
 */
function formatHtmlFences(text: string, markup: Formatter): string {
  const lines = text.split("\n");
  const out: string[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index] ?? "";
    const opening = /^(\s*)(`{3,})html\s*$/.exec(line);
    if (opening === null) {
      out.push(line);
      index += 1;
      continue;
    }
    const indent = opening[1] ?? "";
    const fence = new RegExp(`^\\s*\`{${(opening[2] ?? "").length},}\\s*$`);
    const body: string[] = [];
    let end = index + 1;
    while (end < lines.length) {
      const candidate = lines[end] ?? "";
      if (fence.test(candidate)) break;
      body.push(
        candidate.startsWith(indent)
          ? candidate.slice(indent.length)
          : candidate,
      );
      end += 1;
    }
    if (end >= lines.length) {
      // Unterminated: leave the fence exactly as the plugin produced it.
      out.push(line);
      index += 1;
      continue;
    }
    const formatted = markup.formatText({
      filePath: "file.html",
      fileText: body.join("\n"),
      overrideConfig: { lineWidth: DEFAULT_LINE_WIDTH },
    }).trimEnd();
    out.push(
      line,
      ...formatted.split("\n").map((bodyLine) =>
        bodyLine === "" ? "" : indent + bodyLine
      ),
      lines[end] ?? "",
    );
    index = end + 1;
  }
  return out.join("\n");
}

/**
 * The `textWrap` and `lineWidth` a config's `wrap` value asks for.
 *
 * The three spellings are worth stating together because each belongs to a
 * different layer: the config says `no` / `keep` / a column number, the CLI flag
 * this replaced said `never` / `preserve` / `always`, and the plugin says
 * `never` / `maintain` / `always`. Only `maintain` differs from the flag — and
 * `"preserve"` is *accepted* by the plugin, diagnosed, and silently replaced by
 * its default, which is `maintain`. That coincidence is why the wrong value
 * would look right; `tests/formatter_test.ts` asserts the diagnostics stay empty.
 */
function resolveWrap(
  wrap: unknown,
): { readonly textWrap: string; readonly lineWidth: number } {
  if (wrap === "no" || wrap === undefined) {
    return { textWrap: "never", lineWidth: DEFAULT_LINE_WIDTH };
  }
  if (wrap === "keep") {
    return { textWrap: "maintain", lineWidth: DEFAULT_LINE_WIDTH };
  }
  if (typeof wrap === "number" && Number.isInteger(wrap)) {
    return { textWrap: "always", lineWidth: wrap };
  }
  // `mdformat_conf.validateValues` rejected anything else, so this is
  // unreachable for a config that came through the loader; a hand-built mapping
  // is the only way here, and failing loudly beats guessing.
  throw new ValueError(`Invalid 'wrap' value: ${pyReprString(String(wrap))}`);
}

/**
 * Format `text` with the `wrap` value from the wiki's fmt config.
 *
 * Synchronous by design: there is no child process left to await, which is what
 * lets `DocumentBatch.format` and `Wiki.format` be synchronous too.
 */
export function formatMarkdownText(
  text: string,
  filePath: Path,
  wrap: unknown,
): string {
  const host = loaded();
  const { textWrap, lineWidth } = resolveWrap(wrap);
  host.markdown.setConfig(
    { lineWidth },
    markdownPluginConfig(textWrap),
  );
  host.markdown.setHostFormatter((request) => dispatch(host, request));

  let formatted: string;
  try {
    formatted = host.markdown.formatText({
      filePath: filePath.name,
      fileText: text,
    });
  } catch (error) {
    throw new ValueError(
      `dprint-plugin-markdown failed on ${filePath.name}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  return formatHtmlFences(formatted, host.markup);
}
