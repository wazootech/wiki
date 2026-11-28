/**
 * The formatter's WebAssembly plugins, carried inside the engine so `wiki fmt`
 * reads nothing from `node_modules` or a package cache, on any runtime.
 */
import { Buffer } from "node:buffer";
import { brotliDecompressSync } from "node:zlib";
import { PLUGINS } from "./plugins.gen.ts";

export type PluginName = keyof typeof PLUGINS;

/** One plugin's WebAssembly bytes. */
export function pluginWasm(name: PluginName): Uint8Array<ArrayBuffer> {
  return new Uint8Array(
    brotliDecompressSync(Buffer.from(PLUGINS[name], "base64")),
  );
}
