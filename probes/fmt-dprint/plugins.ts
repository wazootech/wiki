/**
 * Locating each plugin's wasm.
 *
 * `@dprint/*` packages export a `getPath()` helper; `dprint-plugin-yaml` does
 * not (it publishes only `plugin.wasm` next to its `package.json`), so its wasm
 * is reached through the package's export map instead. Both routes end at a
 * file on disk inside `node_modules`, which is what makes the probe's version
 * pinning meaningful: nothing is fetched at run time.
 */

import * as markdown from "@dprint/markdown";
import * as json from "@dprint/json";
import * as typescript from "@dprint/typescript";


/**
 * `getPath()` hands back a *filesystem* path (on Windows, a drive-letter path),
 * not a URL — wrapping it in `new URL` would read it as a `c:` scheme. Only the
 * package-export route yields a `file:` URL, so both shapes are accepted.
 */
function wasmBytes(pathOrUrl: string): Uint8Array<ArrayBuffer> {
  const bytes = Deno.readFileSync(
    pathOrUrl.startsWith("file:") ? new URL(pathOrUrl) : pathOrUrl,
  );
  // A copy, not a view: `Deno.readFileSync` is typed `Uint8Array<ArrayBufferLike>`
  // and `BufferSource` wants a plain `ArrayBuffer`, so passing it straight
  // through does not type-check.
  return new Uint8Array(bytes);
}

export type WasmBytes = Uint8Array<ArrayBuffer>;

export function markdownWasm(): WasmBytes {
  return wasmBytes(markdown.getPath());
}

export function jsonWasm(): WasmBytes {
  return wasmBytes(json.getPath());
}

export function typescriptWasm(): WasmBytes {
  return wasmBytes(typescript.getPath());
}

export function yamlWasm(): WasmBytes {
  return wasmBytes(import.meta.resolve("dprint-plugin-yaml/plugin.wasm"));
}

/** `lax-markup`, `lax-css`, `lax-sql` publish only `plugin.wasm`, like yaml. */
export function laxMarkupWasm(): WasmBytes {
  return wasmBytes(import.meta.resolve("lax-markup/plugin.wasm"));
}

export function laxCssWasm(): WasmBytes {
  return wasmBytes(import.meta.resolve("lax-css/plugin.wasm"));
}

export function laxSqlWasm(): WasmBytes {
  return wasmBytes(import.meta.resolve("lax-sql/plugin.wasm"));
}
