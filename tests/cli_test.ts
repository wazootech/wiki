import { assert, assertEquals } from "@std/assert";
import { fromFileUrl } from "@std/path";
import {
  EXIT_FAILURE,
  EXIT_OK,
  EXIT_USAGE,
  PROG_NAME,
} from "../src/wiki/cli.ts";
import { Path } from "../src/wiki/fspath.ts";
import { VERSION } from "../src/wiki/version.ts";

const CLI_ENTRY = fromFileUrl(new URL("../src/wiki/cli.ts", import.meta.url));
const DECODER = new TextDecoder();

interface CliResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

/**
 * Run the real CLI as a subprocess so the assertions cover the process
 * contract — exit code plus which stream the bytes land on — rather than just
 * the return value of `main()`.
 *
 * Output is compared with `\n`, not `\r\n`. The Python CLI writes CRLF on
 * Windows through text-mode stdout; the migration targets normalised output
 * rather than byte parity, for the reason recorded in
 * `docs/adr/0001-deno-rewrite.md`.
 */
async function runCli(args: readonly string[]): Promise<CliResult> {
  return await runCliIn(args, undefined, []);
}

/**
 * Run the CLI in a working directory with the permissions a real run needs.
 *
 * The permission-free variant above is not incidental: `--version` and an
 * unknown command must work with *zero* permissions, which is why `cli.ts`
 * imports the wiki session dynamically — the RDF stack reads `process.env`
 * while it loads, so a static import would make even `wiki --version` need
 * `--allow-env`.
 */
async function runCliIn(
  args: readonly string[],
  cwd: string | undefined,
  flags: readonly string[],
): Promise<CliResult> {
  const { code, stdout, stderr } = await new Deno.Command(Deno.execPath(), {
    args: ["run", "--quiet", ...flags, CLI_ENTRY, ...args],
    ...(cwd === undefined ? {} : { cwd }),
    stdout: "piped",
    stderr: "piped",
  }).output();
  return {
    code,
    stdout: DECODER.decode(stdout),
    stderr: DECODER.decode(stderr),
  };
}

Deno.test(
  "--version matches the Python CLI output",
  { permissions: { run: true } },
  async () => {
    const result = await runCli(["--version"]);
    assertEquals(result.code, EXIT_OK);
    assertEquals(result.stdout, `${PROG_NAME}, version ${VERSION}\n`);
    assertEquals(result.stderr, "");
  },
);

Deno.test(
  "an unrecognised subcommand is a usage error on stderr",
  { permissions: { run: true } },
  async () => {
    const result = await runCli(["bogus"]);
    assertEquals(result.code, EXIT_USAGE);
    assertEquals(result.stdout, "");
    assertEquals(
      result.stderr,
      `Usage: ${PROG_NAME} [OPTIONS] COMMAND [ARGS]...\n` +
        `Try '${PROG_NAME} --help' for help.\n` +
        `\n` +
        `Error: No such command 'bogus'.\n`,
    );
  },
);

Deno.test(
  "--help prints the full command catalog, and empty argv prints it to stderr",
  { permissions: { run: true } },
  async () => {
    const help = await runCli(["--help"]);
    assertEquals(help.code, EXIT_OK);
    assertEquals(help.stderr, "");
    assert(
      help.stdout.startsWith("Usage: wiki [OPTIONS] COMMAND [ARGS]...\n\n"),
    );
    assert(help.stdout.includes("Commands:\n  build"));
    assert(
      help.stdout.includes(
        "  upgrade  Check for updates and upgrade the wiki CLI.",
      ),
    );

    const empty = await runCli([]);
    assertEquals(empty.code, EXIT_USAGE);
    assertEquals(empty.stdout, "");
    assertEquals(empty.stderr, help.stdout);
  },
);

// ---------------------------------------------------------------------------
// The audit commands, driven through the process contract
// ---------------------------------------------------------------------------

/** A wiki whose only findings are a broken wikilink and a missing layout. */
function writeAuditCorpus(): Path {
  const root = Path.of(Deno.makeTempDirSync({ prefix: "wiki-cli-" }));
  const wiki = root.joinpath("wiki");
  Deno.mkdirSync(wiki.toString(), { recursive: true });
  Deno.writeTextFileSync(
    root.joinpath("wiki.yml").toString(),
    "wiki:\n  input: [wiki]\n",
  );
  Deno.writeTextFileSync(
    wiki.joinpath("Page.md").toString(),
    "---\ntype: schema:WebPage\nwazoo:layout: layouts/missing.html\n---\n\nSee [[Missing]].\n",
  );
  return root;
}

function removeCorpus(root: Path): void {
  try {
    Deno.removeSync(root.toString(), { recursive: true });
  } catch {
    // Windows keeps a handle open long enough to lose this race occasionally.
  }
}

Deno.test(
  "lint reports warnings on stderr and passes without --strict",
  { permissions: { run: true, read: true, write: true } },
  async () => {
    const root = writeAuditCorpus();
    try {
      const result = await runCliIn(
        ["-c", "wiki.yml", "lint", "-v"],
        root.toString(),
        ["--allow-all"],
      );
      assertEquals(result.code, EXIT_OK);
      // Diagnostics never touch stdout: a caller might be piping a report.
      assertEquals(result.stdout, "");
      assertEquals(
        result.stderr,
        "Warnings:\n" +
          "  - In Page: Broken WikiLink [Missing] points to non-existent document.\n" +
          "  - In Page.md:6: Wikilink '[[Missing]]'; use standard links " +
          "([display](Page.md)) per link.style.\n",
      );
    } finally {
      removeCorpus(root);
    }
  },
);

Deno.test(
  "lint --strict promotes the warnings and exits 1",
  { permissions: { run: true, read: true, write: true } },
  async () => {
    const root = writeAuditCorpus();
    try {
      const result = await runCliIn(
        ["-c", "wiki.yml", "lint", "--strict", "-v"],
        root.toString(),
        ["--allow-all"],
      );
      assertEquals(result.code, EXIT_FAILURE);
      assertEquals(result.stdout, "");
      assert(result.stderr.startsWith("Errors:\n"));
      // The same two findings, now errors rather than warnings.
      assertEquals(result.stderr.match(/^ {2}- /gm)?.length, 2);
    } finally {
      removeCorpus(root);
    }
  },
);

Deno.test(
  "check reports the layout error and exits 1",
  { permissions: { run: true, read: true, write: true } },
  async () => {
    const root = writeAuditCorpus();
    try {
      const result = await runCliIn(
        ["-c", "wiki.yml", "check", "--strict", "-v"],
        root.toString(),
        ["--allow-all"],
      );
      assertEquals(result.code, EXIT_FAILURE);
      assertEquals(result.stdout, "");
      assert(
        result.stderr.includes(
          "In Page: wazoo:layout 'layouts/missing.html' must resolve to a " +
            "readable .html file under the wiki config root.",
        ),
        result.stderr,
      );
    } finally {
      removeCorpus(root);
    }
  },
);

Deno.test(
  "graph list prints the root graph table",
  { permissions: { run: true, read: true, write: true } },
  async () => {
    const root = writeAuditCorpus();
    try {
      const result = await runCliIn(
        ["-c", "wiki.yml", "graph", "list"],
        root.toString(),
        ["--allow-all"],
      );
      assertEquals(result.code, EXIT_OK);
      assertEquals(result.stderr, "");
      const header = result.stdout.split("\n")[0] ?? "";
      assert(/^name\s+kind\s+uri\s+commit\s+required_by$/.test(header), header);
      assert(result.stdout.includes("root  root  "));
    } finally {
      removeCorpus(root);
    }
  },
);

Deno.test(
  "build writes a static page and reports generated files",
  { permissions: { run: true, read: true, write: true } },
  async () => {
    const root = Path.of(Deno.makeTempDirSync({ prefix: "wiki-cli-build-" }));
    const wikiDir = root.joinpath("wiki");
    Deno.mkdirSync(wikiDir.toString(), { recursive: true });
    Deno.writeTextFileSync(
      root.joinpath("wiki.yml").toString(),
      "wiki:\n  input: [wiki]\n",
    );
    Deno.writeTextFileSync(
      wikiDir.joinpath("Ethan.md").toString(),
      "# Ethan\n\nA valid page.\n",
    );
    try {
      const result = await runCliIn(
        [
          "-c",
          "wiki.yml",
          "build",
          "--output-dir",
          "published",
          "--no-check",
          "-v",
        ],
        root.toString(),
        ["--allow-all"],
      );
      assertEquals(result.code, EXIT_OK, result.stderr);
      assert(result.stdout.includes("Built 1 pages and 0 assets to published"));
      const page = Deno.readTextFileSync(
        root.joinpath("published", "wiki", "Ethan", "index.html").toString(),
      );
      assert(page.includes("A valid page."));
    } finally {
      removeCorpus(root);
    }
  },
);

Deno.test(
  "MCP help is available without loading a wiki",
  { permissions: { run: true } },
  async () => {
    const result = await runCli(["mcp", "--help"]);
    assertEquals(result.code, EXIT_OK);
    assert(result.stdout.includes("Start a read-only MCP server"));
  },
);

Deno.test(
  "serve rejects an invalid URL style as a usage error",
  { permissions: { run: true } },
  async () => {
    const result = await runCli(["serve", "--site-url-style", "bad"]);
    assertEquals(result.code, EXIT_USAGE);
    assert(result.stderr.includes("--site-url-style"));
  },
);

Deno.test(
  "a FILE that does not exist is a usage error",
  { permissions: { run: true, read: true } },
  async () => {
    const result = await runCli(["check", "nope.md"]);
    assertEquals(result.code, EXIT_USAGE);
    assert(
      result.stderr.endsWith(
        "Error: Invalid value for '[FILES]...': Path 'nope.md' does not exist.\n",
      ),
      result.stderr,
    );
  },
);
