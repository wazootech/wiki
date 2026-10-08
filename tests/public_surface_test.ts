import { join } from "@std/path";
import { assert, assertEquals } from "@std/assert";
import { fromFileUrl } from "@std/path";

import * as wiki from "../src/wiki/mod.ts";

const CLI_ENTRY = fromFileUrl(new URL("../src/wiki/cli.ts", import.meta.url));
const DECODER = new TextDecoder();

interface CliResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

async function runCliIn(
  args: readonly string[],
  cwd: string,
): Promise<CliResult> {
  const { code, stdout, stderr } = await new Deno.Command(Deno.execPath(), {
    args: ["run", "--quiet", "--allow-all", CLI_ENTRY, ...args],
    cwd,
    stdout: "piped",
    stderr: "piped",
  }).output();
  return {
    code,
    stdout: DECODER.decode(stdout),
    stderr: DECODER.decode(stderr),
  };
}

function makeRoot(prefix: string): string {
  return Deno.makeTempDirSync({ prefix });
}

function removeRoot(root: string): void {
  try {
    Deno.removeSync(root, { recursive: true });
  } catch {
    // Windows keeps a handle open long enough to lose this race occasionally.
  }
}

// ---------------------------------------------------------------------------
// The published surface
// ---------------------------------------------------------------------------

/**
 * The internal helpers must not be reachable from the package entrypoint.
 *
 * `deno.json` maps "." to `src/wiki/mod.ts`, and JSR treats every export of the
 * entrypoint as a semver commitment. These answer implementation questions --
 * how a diagnostic renders a value, whether a heading word is uppercase, how
 * two strings differ -- rather than describing the domain, so a consumer should
 * not build on them. Exporting one would make removing it later a breaking
 * change to a released package.
 *
 * This pins the intent: if someone re-exports one "for convenience", the
 * internals leak back onto the public API and this test fails.
 */
const INTERNAL_HELPERS: readonly string[] = [
  "describeValue",
  "quoteString",
  "describeText",
  "describeType",
  "isDigit",
  "isLowercase",
  "isUppercase",
  "splitWhitespace",
  "stripChars",
];

Deno.test("the entrypoint does not export internal helpers", () => {
  const exported = Object.keys(wiki);
  for (const name of INTERNAL_HELPERS) {
    assert(
      !exported.includes(name),
      `'${name}' is exported from mod.ts. These helpers are internal; ` +
        "exporting them commits the package to them under JSR semver.",
    );
  }
});

Deno.test("the entrypoint still exports the documented domain API", () => {
  const exported = Object.keys(wiki);
  // A representative sample, not an exhaustive lock: the point is that the
  // entrypoint keeps its real surface after the parity removals.
  for (
    const name of [
      "Wiki",
      "Config",
      "VERSION",
      "RdfGraph",
      "runCheck",
      "runLint",
      "scaffoldWiki",
      "parseRdf",
      "serializeRdf",
      "formatMarkdown",
    ]
  ) {
    assert(
      exported.includes(name),
      `'${name}' should still be exported from mod.ts.`,
    );
  }
});

// ---------------------------------------------------------------------------
// The CLI and the config file must agree on which link styles are legal
// ---------------------------------------------------------------------------

/**
 * `link.style` in a config file has always honoured the retired spellings
 * (`markdown`, `obsidian`) and rewrites them with a deprecation warning. The
 * `--link-style` flag used to reject the same values, so one spelling was
 * simultaneously supported and refused depending on where it appeared. The flag
 * now accepts them too.
 */
Deno.test(
  "init accepts a retired --link-style spelling and rewrites it",
  { permissions: { run: true, read: true, write: true } },
  async () => {
    const root = makeRoot("wiki-linkstyle-");
    try {
      const result = await runCliIn(
        ["init", "--link-style", "obsidian"],
        root,
      );
      assertEquals(result.code, 0);
      assert(
        result.stderr.includes("obsidian") &&
          result.stderr.includes("wikilink"),
        `expected a deprecation warning naming both spellings, got: ${result.stderr}`,
      );

      const config = await Deno.readTextFile(join(root, "wiki.yml"));
      assert(
        config.includes('style: "wikilink"'),
        `scaffolded config should use the modern spelling, got:\n${config}`,
      );
      assert(
        !config.includes("obsidian"),
        "scaffolded config must not persist the retired spelling.",
      );
    } finally {
      removeRoot(root);
    }
  },
);

/**
 * A retired spelling is accepted but never advertised: the error for a genuinely
 * unknown value must still point at the canonical names only, or it would nudge
 * people back onto the spelling we are retiring.
 */
Deno.test(
  "an invalid --link-style error advertises only canonical names",
  { permissions: { run: true, read: true, write: true } },
  async () => {
    const root = makeRoot("wiki-linkstyle-bad-");
    try {
      const result = await runCliIn(
        ["init", "--link-style", "bogus"],
        root,
      );
      assertEquals(result.code, 2);
      assert(
        result.stderr.includes("'standard'") &&
          result.stderr.includes("'wikilink'"),
        `error should name the canonical styles, got: ${result.stderr}`,
      );
      assert(
        !result.stderr.includes("obsidian") &&
          !result.stderr.includes("markdown"),
        `error must not advertise retired spellings, got: ${result.stderr}`,
      );
    } finally {
      removeRoot(root);
    }
  },
);
