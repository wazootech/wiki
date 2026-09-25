/**
 * Differential harness: in-process dprint markdown vs. the `deno fmt` subprocess.
 *
 * Both sides are asked to format the *same string* with the same effective
 * configuration (`wrap = "no"` → prose never wrapped, line width 80, deno's
 * ignore directives), and the two outputs are compared byte for byte.
 *
 * The `deno fmt` side replicates `runFormatter` in `src/wiki/fmt_util.ts`
 * exactly: the same argv, the same stdin/stdout wiring. The dprint side
 * replicates what `get_resolved_markdown_config` does for `--prose-wrap never`:
 * the `deno()` preset plus `textWrap: "never"`, on a global config of
 * `lineWidth: 80`.
 *
 * The inner-fence question is the interesting one. `deno fmt` routes fenced
 * code blocks in `ts`/`js`/`json`/`css`/`html`/`yaml`/`sql` through its own
 * host formatters; dprint's markdown plugin asks the *host* for them. With no
 * host formatter registered here, whatever the plugin does on its own is what
 * the diff shows — which is the measurement.
 */

import { createContext, createFromBuffer } from "@dprint/formatter";

import {
  denoJsonConfig,
  denoTypescriptConfig,
  denoYamlConfig,
} from "./host-configs.ts";
import {
  jsonWasm,
  laxCssWasm,
  laxMarkupWasm,
  markdownWasm,
  typescriptWasm,
  yamlWasm,
} from "./plugins.ts";

export const LINE_WIDTH = 80;

/** The plugin config `deno()` + `--prose-wrap never` resolves to. */
export function denoProseNeverConfig(): Record<string, unknown> {
  return {
    textWrap: "never",
    ignoreDirective: "deno-fmt-ignore",
    ignoreStartDirective: "deno-fmt-ignore-start",
    ignoreEndDirective: "deno-fmt-ignore-end",
    ignoreFileDirective: "deno-fmt-ignore-file",
  };
}

export interface DprintRoute {
  format(filePath: string, fileText: string): string;
  resolvedConfig: Record<string, unknown>;
  diagnostics: unknown;
}

/** Which host plugins the markdown plugin is allowed to delegate to. */
export interface HostSet {
  json?: boolean;
  typescript?: boolean;
  yaml?: boolean;
  /**
   * `lax-markup`, registered to make the reachability trap visible.
   *
   * Deno formats `html` fences with lax-markup and leaves `xml` alone — the
   * markdown plugin's wasm gate never asks about `html`, so the in-process
   * route cannot format it, while lax-markup *does* claim `xml` and would
   * silently start formatting fences deno never touched.
   */
  markup?: boolean;
  /** `lax-css` — deno does format css/scss/less, so this one is wanted. */
  css?: boolean;
}

/**
 * The in-process route with the host plugins deno pairs with markdown.
 *
 * Registration order is irrelevant for this corpus — the extensions are
 * disjoint — but it is not irrelevant in general: the context picks the first
 * plugin whose extension matches, so two plugins claiming `md` would resolve by
 * insertion order.
 */
export function buildContextRoute(hosts: HostSet): DprintRoute {
  const context = createContext({ lineWidth: LINE_WIDTH });
  const markdownFormatter = context.addPlugin(
    markdownWasm(),
    denoProseNeverConfig(),
  );
  if (hosts.yaml) context.addPlugin(yamlWasm(), denoYamlConfig());
  if (hosts.json) context.addPlugin(jsonWasm(), denoJsonConfig());
  if (hosts.typescript) {
    context.addPlugin(typescriptWasm(), denoTypescriptConfig());
  }
  if (hosts.css) context.addPlugin(laxCssWasm(), {});
  if (hosts.markup) context.addPlugin(laxMarkupWasm(), {});
  return {
    format: (filePath, fileText) =>
      markdownFormatter.formatText({ filePath, fileText }),
    resolvedConfig: markdownFormatter.getResolvedConfig(),
    diagnostics: context.getConfigDiagnostics(),
  };
}

/**
 * The bare route: the markdown plugin with no host formatter at all.
 *
 * This is the baseline the differential run is measured against. Answering
 * every host request with the text unchanged is what "no host formatter" means
 * semantically — it is exactly what the context API does when no registered
 * plugin matches the fake `file.yaml` / `file.json` path — but it also makes the
 * requests observable, which is how the inner-fence gap was found.
 */
export function buildBareRoute(): DprintRoute {
  const formatter = createFromBuffer(markdownWasm());
  formatter.setConfig({ lineWidth: LINE_WIDTH }, denoProseNeverConfig());
  formatter.setHostFormatter((request) => request.fileText);
  return {
    format: (filePath, fileText) =>
      formatter.formatText({ filePath, fileText }),
    resolvedConfig: formatter.getResolvedConfig(),
    diagnostics: formatter.getConfigDiagnostics(),
  };
}

/**
 * Exactly `runFormatter` from `src/wiki/fmt_util.ts`.
 *
 * `wrapArgs` is `proseWrapArgs(opts.wrap)`: `["--prose-wrap","never"]` for
 * `wrap = "no"`, `["--prose-wrap","preserve"]` for `"keep"`, and
 * `["--prose-wrap","always","--line-width",N]` for an integer.
 */
export async function denoFmtRoute(
  text: string,
  wrapArgs: readonly string[] = ["--prose-wrap", "never"],
): Promise<string> {
  const args = [
    "fmt",
    "--no-config",
    "--no-editorconfig",
    "--ext",
    "md",
    ...wrapArgs,
    "-",
  ];
  const command = new Deno.Command(Deno.execPath(), {
    args,
    stdin: "piped",
    stdout: "piped",
    stderr: "piped",
  });
  const child = command.spawn();
  const writer = child.stdin.getWriter();
  const written = writer.write(new TextEncoder().encode(text)).then(() =>
    writer.close()
  );
  const output = await child.output();
  await written;
  if (output.code !== 0) {
    throw new Error(
      `deno fmt failed: ${new TextDecoder().decode(output.stderr).trim()}`,
    );
  }
  return new TextDecoder().decode(output.stdout);
}

/** A minimal line diff, enough to name what moved. */
export function firstDifference(a: string, b: string): string | null {
  if (a === b) return null;
  const aLines = a.split("\n");
  const bLines = b.split("\n");
  const count = Math.max(aLines.length, bLines.length);
  for (let index = 0; index < count; index++) {
    if (aLines[index] !== bLines[index]) {
      return `line ${index + 1}: deno fmt ${JSON.stringify(aLines[index] ?? null)} != dprint ${
        JSON.stringify(bLines[index] ?? null)
      }`;
    }
  }
  return "byte difference without a line difference";
}
