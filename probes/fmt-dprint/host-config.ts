/**
 * Each host plugin's resolved config under the defaults deno would give it.
 *
 * `deno fmt` does not run these plugins with their own defaults — it builds a
 * config for each from `FmtOptionsConfig`. Printing the plugin defaults next to
 * deno's values is how the remaining tuning is decided rather than guessed.
 */

import { createContext } from "@dprint/formatter";

import { jsonWasm, typescriptWasm, yamlWasm } from "./plugins.ts";

const context = createContext({ lineWidth: 80 });

for (
  const [name, wasm] of [
    ["json", jsonWasm],
    ["typescript", typescriptWasm],
    ["yaml", yamlWasm],
  ] as const
) {
  const formatter = context.addPlugin(wasm(), {});
  console.log(`\n===== ${name} =====`);
  console.log(JSON.stringify(formatter.getResolvedConfig(), null, 1));
  console.log("diagnostics:", JSON.stringify(formatter.getConfigDiagnostics()));
}
