/**
 * Smoke test: the `createContext` API, with the two configs `deno fmt` can
 * produce (`--prose-wrap never` and the default).
 */

import { createContext } from "@dprint/formatter";
import * as markdown from "@dprint/markdown";

const sample = [
  "---",
  "title: Sample",
  "---",
  "",
  "# Heading",
  "",
  "This is a paragraph that is long enough to be a candidate for wrapping if",
  "the formatter is configured to wrap prose at eighty columns like some do.",
  "",
  "*emphasis* and ***strong emphasis*** and `code`.",
  "",
  "- item one",
  "- item two",
  "",
  "| LongHeader | Short |",
  "|---|---|",
  "| cell | verylongcell |",
  "",
  "```yaml",
  "a:   1",
  "bb:  2",
  "```",
  "",
].join("\n");

for (const pluginConfig of [{ textWrap: "never" }, { textWrap: "preserve" }]) {
  const context = createContext({ lineWidth: 80 });
  const formatter = context.addPlugin(
    Deno.readFileSync(markdown.getPath()) as Uint8Array,
    pluginConfig,
  );
  console.log(
    `\n===== plugin ${JSON.stringify(pluginConfig)} resolved:`,
    JSON.stringify(formatter.getResolvedConfig()),
  );
  console.log(
    "diagnostics:",
    JSON.stringify(formatter.getConfigDiagnostics()),
  );
  const result = formatter.formatText({
    filePath: "sample.md",
    fileText: sample,
  });
  console.log(result);
}
