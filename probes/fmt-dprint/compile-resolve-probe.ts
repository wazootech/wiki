/**
 * Can the production loading path work inside a compiled binary?
 *
 * `compile-probe.ts` proved the *formatting* survives `deno compile`, but only
 * after copying a plugin to `vendor/` and `--include`ing it. If the npm-resolved
 * paths (`getPath()`, `import.meta.resolve("…/plugin.wasm")`) are readable from
 * an embedded `node_modules`, nothing has to be vendored and the cutover is just
 * a dependency. Compile this with no `--include` and run it with no permissions.
 */

import { buildFaithfulRoute } from "./route.ts";
import {
  jsonWasm,
  laxCssWasm,
  laxMarkupWasm,
  markdownWasm,
  typescriptWasm,
  yamlWasm,
} from "./plugins.ts";

console.log(`standalone: ${Deno.build.standalone}`);

for (
  const [name, load] of [
    ["markdown", markdownWasm],
    ["json", jsonWasm],
    ["typescript", typescriptWasm],
    ["yaml", yamlWasm],
    ["lax-css", laxCssWasm],
    ["lax-markup", laxMarkupWasm],
  ] as const
) {
  try {
    console.log(`  ${name}: ${load().length} bytes`);
  } catch (error) {
    console.log(`  ${name}: FAILED to read — ${String(error)}`);
    Deno.exit(1);
  }
}

const route = buildFaithfulRoute({ htmlFencePostPass: true });
const output = route.format(
  "Page.md",
  "# Header\n\nSome text  \nwith *emphasis*.\n\n| a | b |\n|---|---|\n| c | d |\n\n```zebra\n  keep\n```\n",
);
console.log("--- formatted ---");
console.log(output);

const expected = "# Header\n\nSome text\\\nwith _emphasis_.\n\n| a | b |\n| - | - |\n| c | d |\n\n```zebra\n  keep\n```\n";
console.log(`matches expected: ${output === expected}`);
if (output !== expected) Deno.exit(1);
