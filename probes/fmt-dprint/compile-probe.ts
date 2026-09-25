/**
 * Does the in-process route survive `deno compile`?
 *
 * This is the entire reason the subprocess is being questioned. `Deno.execPath()`
 * inside a compiled binary is the *binary*, not a Deno interpreter, and denort —
 * the runtime `deno compile` embeds — ships "none of the tooling subcommands",
 * so `deno fmt` is not linked in. A formatter that is a WASM module called
 * through V8 has no such dependency: V8 is in denort, and the module can be
 * embedded with `--include`.
 *
 * The test is deliberately narrow: read the embedded wasm, load it, format a
 * document, print the result. It says nothing about npm resolution, which is a
 * separate question — `vendor/markdown.wasm` is a copy precisely so that the
 * experiment does not depend on `node_modules` existing next to the binary.
 *
 * `vendor/` is not committed (2.1 MB for one of the seven plugins). Recreate it
 * before compiling:
 *
 * ```sh
 * mkdir -p vendor
 * cp node_modules/.deno/@dprint+markdown@0.20.0/node_modules/@dprint/markdown/plugin.wasm \
 *    vendor/markdown.wasm
 * deno compile --allow-read --include ./vendor/markdown.wasm \
 *    -o ./dprint-probe.exe ./compile-probe.ts
 * ./dprint-probe.exe
 * ```
 */

import { createFromBuffer } from "@dprint/formatter";

import { denoProseNeverConfig, LINE_WIDTH } from "./harness.ts";

const wasmUrl = new URL("./vendor/markdown.wasm", import.meta.url);
console.log(`standalone: ${Deno.build.standalone}`);
console.log(`reading ${wasmUrl.pathname}`);

let bytes: Uint8Array<ArrayBuffer>;
try {
  bytes = new Uint8Array(Deno.readFileSync(wasmUrl));
} catch (error) {
  console.log(`FAILED to read embedded wasm: ${String(error)}`);
  Deno.exit(1);
}
console.log(`wasm bytes: ${bytes.length}`);

const formatter = createFromBuffer(bytes);
formatter.setConfig({ lineWidth: LINE_WIDTH }, denoProseNeverConfig());
const output = formatter.formatText({
  filePath: "Page.md",
  fileText: "# Header\n\nSome text  \nwith a hard break, and *emphasis*.\n\n| a | b |\n|---|---|\n| c | d |\n",
});
console.log("--- formatted ---");
console.log(output);

const expected = "# Header\n\nSome text\\\nwith a hard break, and _emphasis_.\n\n| a | b |\n| - | - |\n| c | d |\n";
console.log(`matches expected: ${output === expected}`);
if (output !== expected) Deno.exit(1);
