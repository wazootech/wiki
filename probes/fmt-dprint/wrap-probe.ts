/**
 * The three `wrap` values, in-process vs. `deno fmt`.
 *
 * Only `wrap = "no"` is oracle-verified and only `"no"` is used by every shipped
 * config, so the other two are the unexercised half of `proseWrapArgs`. They
 * matter for a swap because the *name* changes across the boundary: deno's CLI
 * flag is `--prose-wrap preserve`, the Rust enum is `TextWrap::Maintain`, and
 * the JS plugin's config value is `"maintain"`. Passing `"preserve"` to the JS
 * plugin is accepted but diagnostic'd and silently falls back to the default,
 * which happens to be `maintain` — so a wrong mapping here would look correct
 * until the plugin's default changed.
 */

import { createFromBuffer } from "@dprint/formatter";

import { denoFmtRoute, denoProseNeverConfig, LINE_WIDTH } from "./harness.ts";
import { markdownWasm } from "./plugins.ts";

const PROSE = [
  "# Wrapping",
  "",
  "This is a paragraph long enough that its wrapping behaviour is observable when",
  "the formatter is allowed to reflow it at a given column, which is the whole",
  "point of the exercise and not a coincidence at all.",
  "",
  "- a list item that is also long enough to be reflowed by a wrapping formatter",
  "",
  "```txt",
  "a code block whose lines must never be reflowed regardless of the setting",
  "```",
  "",
].join("\n");

interface Mode {
  label: string;
  wrapArgs: string[];
  textWrap: string;
  lineWidth: number;
}

const MODES: Mode[] = [
  { label: "no", wrapArgs: ["--prose-wrap", "never"], textWrap: "never", lineWidth: LINE_WIDTH },
  { label: "keep", wrapArgs: ["--prose-wrap", "preserve"], textWrap: "maintain", lineWidth: LINE_WIDTH },
  { label: "40", wrapArgs: ["--prose-wrap", "always", "--line-width", "40"], textWrap: "always", lineWidth: 40 },
  { label: "120", wrapArgs: ["--prose-wrap", "always", "--line-width", "120"], textWrap: "always", lineWidth: 120 },
];

let failures = 0;
for (const mode of MODES) {
  const formatter = createFromBuffer(markdownWasm());
  const pluginConfig = { ...denoProseNeverConfig(), textWrap: mode.textWrap };
  formatter.setConfig({ lineWidth: mode.lineWidth }, pluginConfig);
  const diagnostics = formatter.getConfigDiagnostics();
  const dprintOut = formatter.formatText({
    filePath: "prose.md",
    fileText: PROSE,
  });
  const denoOut = await denoFmtRoute(PROSE, mode.wrapArgs);
  const same = dprintOut === denoOut;
  if (!same) failures++;
  console.log(
    `${same ? "SAME" : "DIFF"}  wrap=${mode.label.padEnd(4)} ` +
      `textWrap=${mode.textWrap} lineWidth=${mode.lineWidth} ` +
      `diagnostics=${JSON.stringify(diagnostics)}`,
  );
  if (!same) {
    const a = denoOut.split("\n");
    const b = dprintOut.split("\n");
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      if (a[i] !== b[i]) {
        console.log(`   line ${i + 1}: deno ${JSON.stringify(a[i])}`);
        console.log(`              dprint ${JSON.stringify(b[i])}`);
      }
    }
  }
}
console.log(`\n${failures} of ${MODES.length} wrap modes differ`);
