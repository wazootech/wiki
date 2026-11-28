/**
 * Where each embedded formatter plugin comes from. Only the generator and its
 * test read these packages; the engine never does.
 */
import * as json from "@dprint/json";
import * as markdown from "@dprint/markdown";
import * as typescript from "@dprint/typescript";
import * as css from "lax-css";
import * as markup from "lax-markup";
import { fromFileUrl } from "@std/path";
import type { PluginName } from "../src/wiki/dprint/embedded.ts";

export interface PluginSource {
  readonly name: PluginName;
  /** The `deno.json` import that pins the package. */
  readonly specifier: string;
  readonly path: string;
}

export function pluginSources(): PluginSource[] {
  // `dprint-plugin-yaml` ships only the wasm; the others export its path.
  const yaml = fromFileUrl(
    import.meta.resolve("dprint-plugin-yaml/plugin.wasm"),
  );
  return [
    {
      name: "markdown",
      specifier: "@dprint/markdown",
      path: markdown.getPath(),
    },
    {
      name: "typescript",
      specifier: "@dprint/typescript",
      path: typescript.getPath(),
    },
    { name: "json", specifier: "@dprint/json", path: json.getPath() },
    { name: "yaml", specifier: "dprint-plugin-yaml", path: yaml },
    { name: "css", specifier: "lax-css", path: css.getPath() },
    { name: "markup", specifier: "lax-markup", path: markup.getPath() },
  ];
}
