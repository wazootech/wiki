import { createFromBuffer, type Formatter } from "@dprint/formatter";
import * as markdownPlugin from "@dprint/markdown";
import * as jsonPlugin from "@dprint/json";
import * as typescriptPlugin from "@dprint/typescript";
import * as cssPlugin from "lax-css";
import * as markupPlugin from "lax-markup";
import { DEFAULT_LINE_WIDTH } from "../fmt_config.ts";
import {
  denoJsonConfig,
  denoTypescriptConfig,
  denoYamlConfig,
  markdownPluginConfig,
  YAML_PLUGIN_PACKAGE_JSON,
} from "./plugin_config.ts";

/**
 * `dprint-plugin-yaml` publishes only `plugin.wasm`, next to its package.json.
 *
 * The package.json specifier is statically imported above, so
 * `import.meta.resolve` finds the package in the compiled binary's npm
 * snapshot; without that import `--exclude-unused-npm` drops it and the
 * resolve fails with "Could not find constraint ... in the list of packages".
 */
function wasmAdjacentToPackageJson(
  packageJsonSpecifier: string,
): Uint8Array<ArrayBuffer> {
  const url = new URL(
    "./plugin.wasm",
    import.meta.resolve(packageJsonSpecifier),
  );
  return new Uint8Array(Deno.readFileSync(url));
}

/** `@dprint/*` packages export a `getPath()` helper instead. */
function wasmFromPath(path: string): Uint8Array<ArrayBuffer> {
  return new Uint8Array(Deno.readFileSync(path));
}

/** The loaded plugin graph. Built once per process, on the first format. */
export interface Plugins {
  readonly markdown: Formatter;
  readonly typescript: Formatter;
  readonly json: Formatter;
  readonly yaml: Formatter;
  readonly css: Formatter;
  readonly markup: Formatter;
}

let plugins: Plugins | null = null;

/**
 * The one plugin graph, built on first use.
 *
 * A process-wide singleton, and safe as one only because
 * {@link formatMarkdownText} is synchronous: it configures the markdown plugin
 * and formats with it without yielding, so two pages can never interleave a
 * `setConfig` and a `formatText`. An `async` version of this function would have
 * to hold one markdown plugin per concurrent call instead.
 */
function loadPlugins(): Plugins {
  const build = (
    wasm: Uint8Array<ArrayBuffer>,
    pluginConfig: Record<string, unknown>,
  ): Formatter => {
    const formatter = createFromBuffer(wasm);
    // Two arguments is the whole contract: `setConfig(globalConfig,
    // pluginConfig)`. Calling it with one panics inside the plugin
    // (`RuntimeError: unreachable` out of `register_config`) with no hint as to
    // why, so the empty configs below are explicit rather than omitted.
    formatter.setConfig({ lineWidth: DEFAULT_LINE_WIDTH }, pluginConfig);
    return formatter;
  };

  return {
    markdown: build(
      wasmFromPath(markdownPlugin.getPath()),
      markdownPluginConfig("never"),
    ),
    typescript: build(
      wasmFromPath(typescriptPlugin.getPath()),
      denoTypescriptConfig(),
    ),
    json: build(wasmFromPath(jsonPlugin.getPath()), denoJsonConfig()),
    yaml: build(
      wasmAdjacentToPackageJson(YAML_PLUGIN_PACKAGE_JSON),
      denoYamlConfig(),
    ),
    css: build(wasmFromPath(cssPlugin.getPath()), {}),
    markup: build(wasmFromPath(markupPlugin.getPath()), {}),
  };
}

export function loaded(): Plugins {
  plugins ??= loadPlugins();
  return plugins;
}
