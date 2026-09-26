/**
 * What does the markdown plugin ask the *host* to format?
 *
 * The differential run says the only byte differences are inner code fences.
 * `deno fmt` routes `yaml`/`json`/`ts`/`js` blocks through its own formatters;
 * dprint's markdown plugin delegates them to the host. This script registers a
 * logging host formatter, formats the three documents that differed, and prints
 * every request so the protocol is visible: which path, which text, and whether
 * the language is recoverable from the path.
 */

import { createFromBuffer } from "@dprint/formatter";

import { denoProseNeverConfig, LINE_WIDTH } from "./harness.ts";
import { markdownWasm } from "./plugins.ts";

const ROOT = new URL("../../", import.meta.url);

const SUBJECTS = [
  "docs/wiki/Wiki_Configuration.md",
  "docs/wiki/wiki_mcp.md",
  "docs/wiki/Wiki_Page_Layouts.md",
];

const formatter = createFromBuffer(markdownWasm());
formatter.setConfig({ lineWidth: LINE_WIDTH }, denoProseNeverConfig());

const requests: Array<{ filePath: string; fileText: string }> = [];
formatter.setHostFormatter((request) => {
  requests.push(request);
  return request.fileText;
});

for (const subject of SUBJECTS) {
  requests.length = 0;
  const text = await Deno.readTextFile(new URL(subject, ROOT));
  const result = formatter.formatText({ filePath: subject, fileText: text });
  console.log(`\n===== ${subject} unchanged=${result === text} =====`);
  for (const request of requests) {
    console.log(`  host request: filePath=${JSON.stringify(request.filePath)}`);
    console.log(`    text=${JSON.stringify(request.fileText.slice(0, 200))}`);
  }
}

console.log(
  "\nresolved config:",
  JSON.stringify(formatter.getResolvedConfig()),
);
