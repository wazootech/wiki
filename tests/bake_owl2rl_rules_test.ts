/**
 * Tests for `scripts/bake_owl2rl_rules.ts`.
 *
 * The script's own docstring names its whole risk: the ruleset is written as a
 * single template literal, so a backslash, backtick, or `${` in the upstream
 * Notation3 would end the literal early or interpolate. A broken bake produces
 * a module that still type-checks and still exports a string -- it just
 * silently carries the wrong OWL 2 RL rules, and the reasoning closure quietly
 * loses inferences. Nothing downstream would fail, which is why this is pinned
 * here rather than left to the one time someone regenerates.
 */

import { assertEquals, assertStringIncludes } from "@std/assert";
import { dirname, fromFileUrl, join } from "@std/path";
import { OWL2RL_N3 } from "../src/wiki/owl2rl_rules.ts";

const SCRIPT = join(
  dirname(dirname(fromFileUrl(import.meta.url))),
  "scripts",
  "bake_owl2rl_rules.ts",
);

/** Run the bake script over `rules`, returning the module text it wrote. */
function bake(rules: string): string {
  const dir = Deno.makeTempDirSync();
  try {
    const rulesPath = join(dir, "rules.n3");
    const outPath = join(dir, "baked.ts");
    Deno.writeTextFileSync(rulesPath, rules);
    const command = new Deno.Command(Deno.execPath(), {
      args: [
        "run",
        "--allow-read",
        "--allow-write",
        SCRIPT,
        rulesPath,
        outPath,
      ],
      stdout: "null",
      stderr: "null",
    });
    const { code } = command.outputSync();
    if (code !== 0) throw new Error(`bake exited ${code}`);
    return Deno.readTextFileSync(outPath);
  } finally {
    Deno.removeSync(dir, { recursive: true });
  }
}

/** Evaluate a baked module and return the rules string it exports. */
async function bakedValue(moduleText: string): Promise<string> {
  const bytes = new TextEncoder().encode(moduleText);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const dataUrl = `data:text/javascript;base64,${btoa(binary)}`;
  return (await import(dataUrl)).OWL2RL_N3;
}

Deno.test("baked rules round-trip through the template literal unchanged", async () => {
  // Each of these three is a literal terminator or interpolation trigger.
  // If any survives unescaped, the constant is truncated or interpolated and
  // the reasoning engine loads a different ruleset than upstream ships.
  const hostile = [
    "a backslash: \\",
    "a backtick: `",
    "an interpolation: ${process}",
    "all three: \\` ${x} ${",
    "",
  ].join("\n");

  const moduleText = bake(hostile);
  assertEquals(await bakedValue(moduleText), hostile);
});

Deno.test("the checked-in ruleset still matches what the bake script produces", () => {
  // Guards a stale constant: someone upgrades rdfjs-inference-engine without
  // re-running `deno task bake:rules`, and the shipped rules silently diverge
  // from the dependency the engine actually loads them from.
  assertStringIncludes(OWL2RL_N3, "# OWL 2 RL/RDF rules");
  assertEquals(OWL2RL_N3.length > 30_000, true);
  // The upstream ruleset's own terminator. Its absence would mean the constant
  // is truncated mid-file, which still type-checks and still exports a string.
  assertStringIncludes(OWL2RL_N3, "# End of OWL 2 RL/RDF N3 ruleset");
});
