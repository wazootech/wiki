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
 * `probes/fmt-dprint/FINDINGS.md`.
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

import { basename } from "@std/path";
import { errorText, ValueError } from "./errors.ts";
// Side-effect import: `dprint-plugin-yaml` publishes only `plugin.wasm`
// (plus this package.json), so nothing statically references the package
// otherwise — and `deno compile --exclude-unused-npm` drops packages it
// cannot see, which broke `wiki fmt` in every standalone release asset.
// The import keeps the package in the binary's npm snapshot; the wasm bytes
// themselves ride along via `--include` (see the compile invocations).
import "dprint-plugin-yaml/package.json" with { type: "json" };
import {
  DEFAULT_FMT_OPTIONS,
  DEFAULT_LINE_WIDTH,
  type FmtOptions,
  validateFmtOptions,
} from "./fmt_config.ts";
import { markdownPluginConfig } from "./formatter/plugin_config.ts";
import { loaded } from "./formatter/plugins.ts";
import { dispatch, formatHtmlFences } from "./formatter/dispatch.ts";

/** The default Deno/dprint Markdown line width. */
export { DEFAULT_LINE_WIDTH };
export {
  FORMATTER_PLUGIN_VERSIONS,
  YAML_PLUGIN_PACKAGE_JSON,
} from "./formatter/plugin_config.ts";

export function formatMarkdownText(
  text: string,
  filePath: string,
  options: FmtOptions = {},
): string {
  try {
    validateFmtOptions(options as Record<string, unknown>, "fmt");
  } catch (error) {
    throw new ValueError(
      errorText(error),
    );
  }
  const resolved = { ...DEFAULT_FMT_OPTIONS, ...options };
  const host = loaded();
  host.markdown.setConfig(
    { lineWidth: resolved.lineWidth, newLineKind: resolved.newLineKind },
    markdownPluginConfig(resolved.textWrap),
  );
  host.markdown.setHostFormatter((request) => dispatch(host, request));

  let formatted: string;
  try {
    formatted = host.markdown.formatText({
      filePath: basename(filePath),
      fileText: text,
    });
  } catch (error) {
    throw new ValueError(
      `dprint-plugin-markdown failed on ${basename(filePath)}: ${
        errorText(error)
      }`,
    );
  }
  return formatHtmlFences(formatted, host.markup);
}
