/**
 * The faithful in-process route: deno's host dispatch, reproduced exactly.
 *
 * The context API (`createContext` + `addPlugin`) routes host formatting by
 * *file extension* over whatever plugins are registered. That is close to what
 * deno does but not equal to it, and the difference is not academic:
 *
 * - **deno calls the plugin library, not the wasm build.** `format_markdown` in
 *   `cli/tools/fmt.rs` calls `dprint_plugin_markdown::format_text` with its own
 *   closure, so *deno* decides which tags reach a formatter.
 * - **the wasm build filters tags first.** `wasm_plugin.rs`'s
 *   `tag_to_extension` maps a tag to a fake filename and returns `None` for
 *   anything absent — the callback is never reached for those. `html` is absent
 *   from that table (as are `cjs`, `cts`, `mjs`, `mts`, `sql`, `vto`, `njk`),
 *   so an ` ```html ` fence *cannot* be delegated through the JS plugin host no
 *   matter what is registered. Conversely `xml`, `toml`, `py`, `rs` and friends
 *   *can* be delegated even though deno would leave them alone.
 *
 * So the dispatcher below is written by hand rather than assembled from a
 * plugin list: it reproduces deno's tag table, and its `default` arm keeps the
 * wasm gate's extra reachability from leaking into the output.
 *
 * Two widths matter, and deno uses different ones:
 *
 * - `json` / `typescript` get the width the markdown plugin computed for the
 *   block, which the wasm shim forwards as `overrideConfig.lineWidth`.
 * - `yaml` / `css` / `html` ignore the block width and use the file-level
 *   `options.line_width` (80 here).
 */

import { createFromBuffer, type Formatter } from "@dprint/formatter";

import {
  denoJsonConfig,
  denoTypescriptConfig,
  denoYamlConfig,
} from "./host-configs.ts";
import {
  jsonWasm,
  laxCssWasm,
  laxMarkupWasm,
  markdownWasm,
  typescriptWasm,
  type WasmBytes,
  yamlWasm,
} from "./plugins.ts";
import { denoProseNeverConfig, LINE_WIDTH, type DprintRoute } from "./harness.ts";

/**
 * The extensions `dprint-plugin-markdown`'s **wasm** wrapper will delegate.
 *
 * Transcribed from `tag_to_extension` in `wasm_plugin.rs` at 0.20.0. It is the
 * hard ceiling on what the in-process route can ever format, which is why it is
 * recorded here rather than discovered at run time.
 */
export const WASM_REACHABLE_EXTENSIONS: readonly string[] = [
  "ts",
  "tsx",
  "js",
  "jsx",
  "json",
  "jsonc",
  "rs",
  "cs",
  "vb",
  "css",
  "less",
  "toml",
  "scss",
  "svelte",
  "vue",
  "astro",
  "xml",
  "yaml",
  "graphql",
  "py",
  "dockerfile",
];

/** The subset of the above that `deno fmt` actually formats. */
export const DENO_FORMATTED_EXTENSIONS: readonly string[] = [
  "ts",
  "tsx",
  "js",
  "jsx",
  "json",
  "jsonc",
  "css",
  "scss",
  "less",
  "yaml",
];

export interface FaithfulOptions {
  /**
   * `unstable_options.component` / `unstable_options.sql` in deno — both off by
   * default, so `svelte`/`vue`/`astro`/`sql` fences are left alone unless asked
   * for. They are unreachable through the wasm gate anyway.
   */
  unstable?: { component?: boolean; sql?: boolean };
  /**
   * Post-process ` ```html ` fences with lax-markup.
   *
   * This exists only to measure the size of the one gap the wasm gate creates:
   * deno formats html fences and the in-process route cannot ask for them. The
   * post-pass is not a candidate implementation, it is a probe of whether the
   * difference is confinable to "fence bodies that lax-markup would touch".
   */
  htmlFencePostPass?: boolean;
}

function extensionOf(filePath: string): string {
  const name = filePath.slice(
    Math.max(filePath.lastIndexOf("/"), filePath.lastIndexOf("\\")) + 1,
  );
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

function widthFrom(overrideConfig: unknown): number {
  const value = (overrideConfig as { lineWidth?: unknown } | undefined)
    ?.lineWidth;
  return typeof value === "number" ? value : LINE_WIDTH;
}

/** Build the route. */
export function buildFaithfulRoute(
  options: FaithfulOptions = {},
): DprintRoute {
  const configure = (wasm: WasmBytes, pluginConfig: Record<string, unknown>) => {
    const formatter = createFromBuffer(wasm);
    formatter.setConfig({ lineWidth: LINE_WIDTH }, pluginConfig);
    return formatter;
  };

  const jsonFormatter = configure(jsonWasm(), denoJsonConfig());
  const typescriptFormatter = configure(
    typescriptWasm(),
    denoTypescriptConfig(),
  );
  const yamlFormatter = configure(yamlWasm(), denoYamlConfig());
  const cssFormatter = configure(laxCssWasm(), {});
  const markupFormatter = configure(laxMarkupWasm(), {});

  const markdownFormatter = configure(markdownWasm(), denoProseNeverConfig());
  markdownFormatter.setHostFormatter((request) => {
    const tag = extensionOf(request.filePath);
    const blockWidth = widthFrom(request.overrideConfig);
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
        return typescriptFormatter.formatText(at(blockWidth));
      case "json":
      case "jsonc":
        return jsonFormatter.formatText(at(blockWidth));
      case "css":
      case "scss":
      case "less":
        return cssFormatter.formatText(at(LINE_WIDTH));
      case "yaml":
        return yamlFormatter.formatText(at(LINE_WIDTH));
      default:
        // Deno formats none of these, and the wasm gate is more permissive
        // than deno's tag list — so this arm is what keeps `xml`, `toml`,
        // `py`, `rs`, ... byte-identical to a formatter that never saw them.
        return request.fileText;
    }
  });

  return {
    format: (filePath, fileText) => {
      const formatted = markdownFormatter.formatText({ filePath, fileText });
      return options.htmlFencePostPass
        ? formatHtmlFences(formatted, markupFormatter)
        : formatted;
    },
    resolvedConfig: markdownFormatter.getResolvedConfig(),
    diagnostics: markdownFormatter.getConfigDiagnostics(),
  };
}

/**
 * Format the body of every top-level ` ```html ` fence with lax-markup.
 *
 * The markdown plugin emits a fence body as the source text, trimmed and
 * unindented — the same text deno hands to `format_html` — so replacing it with
 * lax-markup's output is what deno's callback would have done, one layer too
 * late. Fence marker length is preserved as the plugin chose it.
 *
 * The result is `trim_end`ed because deno's own `gen_code_block` applies
 * `unindent(code_text.trim_end())` to whatever the host returns; lax-markup ends
 * its output with a newline, which without the trim becomes a blank line before
 * the closing fence.
 */
export function formatHtmlFences(text: string, markup: Formatter): string {
  const lines = text.split("\n");
  const out: string[] = [];
  for (let index = 0; index < lines.length; index++) {
    const opening = /^(`{3,})html\s*$/.exec(lines[index]);
    if (!opening) {
      out.push(lines[index]);
      continue;
    }
    const marker = opening[1];
    const body: string[] = [];
    let end = index + 1;
    for (; end < lines.length; end++) {
      if (new RegExp(`^\`{${marker.length},}\\s*$`).test(lines[end])) break;
      body.push(lines[end]);
    }
    if (end >= lines.length) {
      // Unterminated: leave it exactly as the plugin produced it.
      out.push(lines[index]);
      continue;
    }
    const formatted = markup.formatText({
      filePath: "file.html",
      fileText: body.join("\n"),
      overrideConfig: { lineWidth: LINE_WIDTH },
    }).trimEnd();
    out.push(lines[index], ...formatted.split("\n"), lines[end]);
    index = end;
  }
  return out.join("\n");
}
