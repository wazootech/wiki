import type { Formatter } from "@dprint/formatter";
import { DEFAULT_LINE_WIDTH } from "../fmt_config.ts";
import type { Plugins } from "./plugins.ts";

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
export function dispatch(host: Plugins, request: {
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
    case "yml":
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
export function formatHtmlFences(text: string, markup: Formatter): string {
  const lineEnding = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.split(/\r\n|\n/);
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
  return out.join(lineEnding);
}
