/**
 * Does the markdown plugin hand the host the *code block's* line width?
 *
 * `deno fmt` overrides `line_width` with the width the markdown plugin computed
 * for the block, for json and typescript (but not for yaml/css/html). The Rust
 * host callback receives that width as a third argument; the JS shim has no
 * such parameter, so if the width is to survive it has to arrive inside
 * `overrideConfig`. This script prints every request in full to find out.
 */

import { createFromBuffer } from "@dprint/formatter";

import { denoProseNeverConfig, LINE_WIDTH } from "./harness.ts";
import { markdownWasm } from "./plugins.ts";

const sample = [
  "# Sample",
  "",
  "```json",
  '{ "a": 1 }',
  "```",
  "",
  "```ts",
  "const x = 1;",
  "```",
  "",
  "```yaml",
  "a:   1",
  "```",
  "",
  "```html",
  "<div><span>x</span></div>",
  "```",
  "",
  "```css",
  "a{color:red}",
  "```",
  "",
  "```sql",
  "select * from t",
  "```",
  "",
  "```xml",
  "<a><b/></a>",
  "```",
  "",
].join("\n");

const formatter = createFromBuffer(markdownWasm());
formatter.setConfig({ lineWidth: LINE_WIDTH }, denoProseNeverConfig());
formatter.setHostFormatter((request) => {
  console.log(`\nrequest for ${request.filePath}`);
  console.log(`  keys: ${Object.keys(request).join(", ")}`);
  console.log(`  overrideConfig: ${JSON.stringify(request.overrideConfig)}`);
  console.log(`  bytesRange: ${JSON.stringify(request.bytesRange)}`);
  console.log(`  fileText: ${JSON.stringify(request.fileText)}`);
  return request.fileText;
});

formatter.formatText({ filePath: "sample.md", fileText: sample });
console.log("\ndone");
