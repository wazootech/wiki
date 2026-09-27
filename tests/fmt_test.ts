/**
 * Port of `tests/test_fmt.py`.
 *
 * Three adaptations, each because the engine behind the formatter changed:
 *
 * - **The two `mdformat.text(...)` cases drive the engine instead.** The Python
 *   file calls the `mdformat` library directly to pin the *plugin* behaviour the
 *   wiki depends on — wikilinks survive, tables pad to their widest cell. There
 *   is no mdformat in the port, so the same inputs go through
 *   `formatMarkdown`. Both expected strings were kept as-is, and the dprint
 *   plugin reproduces them byte for byte.
 * - **The SPARQL-block cases assert survival, not layout.** Python could
 *   `assertIn("| class |", ...)` because mdformat left the block's table alone;
 *   the plugin pads it (`| class     |`), so the assertion is on what the case
 *   exists to protect — the query, the fence language, the block markers, and
 *   the fact that the header text is not title-cased. The padding is cosmetic
 *   and the probe measured it.
 * - **`test_read_view_uses_page_content_slot` is not ported.** It is a
 *   site/renderer test that happens to live in this file; it belongs to the
 *   milestone that ports `render.py`/`publish.py`.
 *
 * The formatter configuration is native to the Deno/dprint implementation.
 * These tests verify that mdformat-only keys and `.mdformat.toml` files are not
 * treated as compatibility inputs.
 *
 * The plugin's own guarantees — the version pin, the resolved configuration, and
 * which fence tags get delegated to which host formatter — live in
 * `formatter_test.ts`. This file stays the port of `test_fmt.py`'s behaviour.
 *
 * `await` on the now-synchronous `formatMarkdown` is deliberate: it reads the
 * same either way and keeps the cases honest if the call ever becomes
 * asynchronous again.
 *
 * The CLI cases stay in this file rather than moving to `cli_test.ts` so the
 * one-file-to-one-file correspondence with the oracle's suite survives: this
 * file answers "does `wiki fmt` do what `test_fmt.py` says it does?".
 */

import { dirname, join } from "@std/path";
import { ValueError } from "../src/wiki/errors.ts";
import {
  assert,
  assertEquals,
  assertStringIncludes,
  assertThrows,
} from "@std/assert";
import { fromFileUrl } from "@std/path";
import { Config } from "../src/wiki/config.ts";
import {
  describeFmtSource,
  formatMarkdown,
  resolveFmtOptions,
} from "../src/wiki/fmt_util.ts";

import { BOM, parseFrontmatter, readTextTolerant } from "../src/wiki/parser.ts";

const CLI_ENTRY = fromFileUrl(new URL("../src/wiki/cli.ts", import.meta.url));
const DECODER = new TextDecoder();

/** A unique temp directory, to be removed with {@link cleanup}. */
function tempRoot(): string {
  return Deno.makeTempDirSync({ prefix: "wiki-fmt-" });
}

function cleanup(root: string): void {
  try {
    Deno.removeSync(root, { recursive: true });
  } catch {
    // Windows keeps a handle open long enough to lose this race occasionally.
  }
}

/** Write a file below `root`, creating parent directories. */
function write(
  root: string,
  relative: string,
  content: string,
  options: { readonly bom?: boolean } = {},
): string {
  const target = join(root, ...relative.split("/"));
  Deno.mkdirSync(dirname(target), { recursive: true });
  Deno.writeTextFileSync(
    target,
    options.bom ? BOM + content : content,
  );
  return target;
}

/**
 * A wiki root whose pages are the markdown files beside its config.
 *
 * The Python tests author no config at all and rely on `--input` overriding the
 * default. The port writes one, so `config_root` is the temp directory whatever
 * the working directory is — the CLI tests otherwise depend on where the test
 * runner happened to start, and here the wiki root *is* the corpus.
 */
function wikiRoot(): string {
  const root = tempRoot();
  write(root, "wiki.yml", "wiki:\n  input: [.]\n");
  return root;
}

interface CliResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

/**
 * Run the real CLI as a subprocess, in `cwd`, with the permissions it needs:
 * `run` for the CLI itself, `env` for the RDF stack.
 *
 * Output is compared with `\n`. The Python CLI writes CRLF on Windows through
 * text-mode stdout; the migration targets normalised output rather than byte
 * parity, for the reason recorded in `docs/adr/0001-deno-rewrite.md`.
 */
async function runCli(
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

// ---------------------------------------------------------------------------
// What the formatter must not mangle
// ---------------------------------------------------------------------------

Deno.test("format_markdown preserves wikilinks", async () => {
  const root = tempRoot();
  try {
    const filePath = write(root, "Page.md", "See [[Wiki_CLI]] for details.\n");
    const config = new Config({ config_root: root });

    assertEquals(
      (
        await formatMarkdown(
          "See [[Wiki_CLI]] for details.",
          filePath,
          config,
        )
      ).trim(),
      "See [[Wiki_CLI]] for details.",
    );
    assertEquals(
      (
        await formatMarkdown(
          "See [[Wiki_CLI|the CLI]] for details.",
          filePath,
          config,
        )
      ).trim(),
      "See [[Wiki_CLI|the CLI]] for details.",
    );
  } finally {
    cleanup(root);
  }
});

Deno.test("format_markdown pads a table to its widest cell", async () => {
  const root = tempRoot();
  try {
    const filePath = write(root, "Page.md", "");
    const unaligned =
      "| LongHeader | Short |\n|---|---|\n| cell | verylongcell |\n";
    const expected = "| LongHeader | Short        |\n" +
      "| ---------- | ------------ |\n" +
      "| cell       | verylongcell |\n";
    assertEquals(
      await formatMarkdown(
        unaligned,
        filePath,
        new Config({ config_root: root }),
      ),
      expected,
    );
  } finally {
    cleanup(root);
  }
});

Deno.test("format_markdown preserves a SPARQL render block", async () => {
  const compactTable = "| class |\n| --- |\n| owl:Class |\n";
  const original = "<!-- sparql:start -->\n" +
    "```sparql\nSELECT ?class WHERE { ?class a owl:Class }\n```\n" +
    compactTable +
    "<!-- sparql:end -->\n";
  const root = tempRoot();
  try {
    const filePath = write(root, "Query.md", original);
    const formatted = await formatMarkdown(
      original,
      filePath,
      new Config({ config_root: root }),
    );
    assertStringIncludes(formatted, "<!-- sparql:start -->");
    assertStringIncludes(formatted, "```sparql");
    assertStringIncludes(formatted, "| owl:Class |");
    assertStringIncludes(formatted, "<!-- sparql:end -->");
    assertStringIncludes(
      formatted,
      "SELECT ?class WHERE { ?class a owl:Class }",
    );
    // The header is not title-cased, which is the corruption this guards.
    assert(!formatted.includes("| Class |"), formatted);
  } finally {
    cleanup(root);
  }
});

Deno.test("format_markdown preserves a hidden SPARQL render block", async () => {
  const compactTable = "| class |\n| --- |\n| owl:Class |\n";
  const original = "<!-- sparql:start\n" +
    "```sparql\nSELECT ?class WHERE { ?class a owl:Class }\n```\n" +
    "-->\n" +
    compactTable +
    "<!-- sparql:end -->\n";
  const root = tempRoot();
  try {
    const filePath = write(root, "Query.md", original);
    const formatted = await formatMarkdown(
      original,
      filePath,
      new Config({ config_root: root }),
    );
    assertStringIncludes(formatted, "<!-- sparql:start\n");
    assertStringIncludes(formatted, "```sparql");
    assertStringIncludes(formatted, "-->\n");
    assertStringIncludes(formatted, "| owl:Class |");
    assert(!formatted.includes("| Class |"), formatted);
  } finally {
    cleanup(root);
  }
});

Deno.test("format_markdown strips a leading BOM", async () => {
  // The corruption site of wiki#312: with mdformat a BOM-prefixed `---` opener
  // was not recognised as frontmatter and became a setext heading.
  const content = "---\ntype: schema:Person\nname: Bommed\n---\n\n# Bommed\n";
  const root = tempRoot();
  try {
    const filePath = write(root, "Bommed.md", content, { bom: true });
    const formatted = await formatMarkdown(
      readTextTolerant(filePath),
      filePath,
      new Config({ config_root: root }),
    );
    assert(!formatted.includes(BOM), formatted);
    assert(!formatted.includes("## "), formatted);
    assert(formatted.startsWith("---\ntype: schema:Person"), formatted);
  } finally {
    cleanup(root);
  }
});

Deno.test("fmt rejects mdformat-only options", () => {
  const root = tempRoot();
  try {
    write(
      root,
      "wiki.yml",
      "wiki:\n  input: [wiki]\nfmt:\n  extensions: [gfm]\n",
    );
    assertThrows(
      () => Config.load(root),
      ValueError,
      "Invalid key 'extensions' in wiki.yml fmt",
    );
  } finally {
    cleanup(root);
  }
});

// ---------------------------------------------------------------------------
// Where the fmt options come from
// ---------------------------------------------------------------------------

Deno.test("inline fmt options take precedence over ignored .mdformat.toml", () => {
  const root = tempRoot();
  try {
    write(root, ".mdformat.toml", "[broken\n");
    const config = new Config({
      config_root: root,
      fmt: { textWrap: "never" },
    });
    assertEquals(describeFmtSource(config), "inline fmt in wiki config");
  } finally {
    cleanup(root);
  }
});

Deno.test("Wiki fmt ignores .mdformat.toml", () => {
  const root = tempRoot();
  try {
    write(root, ".mdformat.toml", "[broken\n");
    write(root, "wiki.yml", "wiki:\n  input: [wiki]\n");
    const filePath = write(root, "wiki/page.md", "# Title\n\nSome text  \n");
    const config = Config.load(root);
    assertEquals(describeFmtSource(config), "Wiki CLI fmt defaults");
    const formatted = formatMarkdown(
      readTextTolerant(filePath),
      filePath,
      config,
    );
    assert(!formatted.includes("Some text  \n"), formatted);
  } finally {
    cleanup(root);
  }
});

Deno.test("native inline options and omitted fmt produce the same bytes", () => {
  const original = "# Title\n\nSome text  \n";
  const root = tempRoot();
  try {
    const filePath = write(root, "page.md", original);
    const inlineConfig = new Config({
      config_root: root,
      fmt: { textWrap: "never", lineWidth: 80, newLineKind: "lf" },
    });
    const inlineOut = formatMarkdown(original, filePath, inlineConfig);
    const defaultsOut = formatMarkdown(
      original,
      filePath,
      new Config({ config_root: root }),
    );
    assertEquals(inlineOut, defaultsOut);
  } finally {
    cleanup(root);
  }
});

Deno.test("a YAML fmt block accepts Deno/dprint option names", () => {
  const root = tempRoot();
  try {
    write(
      root,
      "wiki.yml",
      "wiki:\n  input: [wiki]\nfmt:\n  textWrap: maintain\n  lineWidth: 72\n  newLineKind: crlf\n",
    );
    assertEquals(Config.load(root).fmt?.options, {
      textWrap: "maintain",
      lineWidth: 72,
      newLineKind: "crlf",
    });
  } finally {
    cleanup(root);
  }
});

Deno.test("absent fmt uses the wiki Deno formatter defaults", () => {
  const original = "# Title\n\nSome text  \n";
  const root = tempRoot();
  try {
    write(root, "wiki.yml", "wiki:\n  input: [wiki]\n");
    const filePath = write(root, "page.md", original);
    const config = Config.load(root);
    assertEquals(describeFmtSource(config), "Wiki CLI fmt defaults");
    const formatted = formatMarkdown(original, filePath, config);
    assert(!formatted.includes("Some text  \n"), formatted);
    assertEquals(resolveFmtOptions(config)[0].textWrap, "never");
  } finally {
    cleanup(root);
  }
});

Deno.test("an empty inline fmt block merges the Deno formatter defaults", () => {
  const original = "# Title\n\nSome text  \n";
  const root = tempRoot();
  try {
    write(root, "wiki.yml", "wiki:\n  input: [wiki]\n");
    const filePath = write(root, "page.md", original);
    const absentConfig = Config.load(root);
    const emptyConfig = new Config({ config_root: root, fmt: {} });
    assertEquals(
      formatMarkdown(original, filePath, emptyConfig),
      formatMarkdown(original, filePath, absentConfig),
    );
    assertEquals(describeFmtSource(emptyConfig), "inline fmt in wiki config");
  } finally {
    cleanup(root);
  }
});

// ---------------------------------------------------------------------------
// The fmt command
// ---------------------------------------------------------------------------

Deno.test(
  "fmt reformats a page in place",
  { permissions: { run: true, read: true, write: true, env: true } },
  async () => {
    const root = wikiRoot();
    try {
      const filePath = write(
        root,
        "unformatted.md",
        "---\ntype: schema:WebPage\nname: Test\n---\n\n# Header\n\n" +
          "Some text  \nwith extra spaces.\n",
      );
      const result = await runCli(
        ["-c", "wiki.yml", "fmt", "-v"],
        root,
      );
      assertEquals(result.code, 0, result.stderr);
      assertStringIncludes(result.stdout, "Formatted unformatted.md");
      assertStringIncludes(result.stdout, "Using ");
      assert(
        !Deno.readTextFileSync(filePath).includes("Some text  \n"),
      );
    } finally {
      cleanup(root);
    }
  },
);

Deno.test(
  "fmt tolerates a page saved with a UTF-8 BOM",
  { permissions: { run: true, read: true, write: true, env: true } },
  async () => {
    const root = wikiRoot();
    try {
      const filePath = write(
        root,
        "Bommed.md",
        "---\ntype: schema:Person\nname: Bommed\n---\n\n# Bommed\n\nSome text  \n",
        { bom: true },
      );
      const result = await runCli(
        ["-c", "wiki.yml", "fmt", "-v"],
        root,
      );
      assertEquals(result.code, 0, result.stderr);

      // Read raw text: the BOM-tolerant parser strips a leading BOM, so
      // using it here would mask a retained BOM.
      const content = Deno.readTextFileSync(filePath);
      assert(!content.startsWith(BOM), JSON.stringify(content));
      assert(!content.includes("## "), content);
      assert(!content.includes("Some text  \n"), content);
      const data = parseFrontmatter(content);
      assertEquals(data?.["type"], "schema:Person");
    } finally {
      cleanup(root);
    }
  },
);

Deno.test(
  "fmt refuses a page whose frontmatter cannot be parsed",
  { permissions: { run: true, read: true, write: true, env: true } },
  async () => {
    const root = wikiRoot();
    try {
      const original = "---\ntype: [unterminated\nname: Broken\n---\n\n" +
        "# Broken\n\nSome text  \n";
      const filePath = write(root, "Broken.md", original);

      for (const args of [["fmt"], ["fmt", "--check"]]) {
        const result = await runCli(
          ["-c", "wiki.yml", ...args],
          root,
        );
        assertEquals(result.code, 1, result.stderr);
        assertStringIncludes(result.stderr, "Refusing to format Broken.md");
        assertEquals(Deno.readTextFileSync(filePath), original);
      }
    } finally {
      cleanup(root);
    }
  },
);

Deno.test(
  "fmt --check flags stale pages and passes once they are written",
  { permissions: { run: true, read: true, write: true, env: true } },
  async () => {
    const root = wikiRoot();
    try {
      const original = "---\ntype: schema:WebPage\nname: Test\n---\n\n" +
        "# Header\n\nSome text  \n";
      const filePath = write(root, "unformatted.md", original);

      const stale = await runCli(
        ["-c", "wiki.yml", "fmt", "--check", "-v"],
        root,
      );
      assertEquals(stale.code, 1);
      assertStringIncludes(
        stale.stderr,
        "Error: The following files are not correctly formatted:",
      );
      assertStringIncludes(stale.stderr, "unformatted.md");
      // --check reports; it must not write.
      assertEquals(Deno.readTextFileSync(filePath), original);

      const written = await runCli(
        ["-c", "wiki.yml", "fmt"],
        root,
      );
      assertEquals(written.code, 0, written.stderr);

      const clean = await runCli(
        ["-c", "wiki.yml", "fmt", "--check", "-v"],
        root,
      );
      assertEquals(clean.code, 0, clean.stderr);
      assertStringIncludes(clean.stdout, "All files are correctly formatted.");
      assertEquals(clean.stderr, "");
    } finally {
      cleanup(root);
    }
  },
);
