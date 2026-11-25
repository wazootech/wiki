import { join } from "@std/path";
import { assert, assertEquals } from "@std/assert";
import {
  COMMAND_NAMES,
  EXIT_FAILURE,
  EXIT_OK,
  EXIT_USAGE,
  PROG_NAME,
} from "../src/wiki/cli.ts";
import { VERSION } from "../src/wiki/version.ts";
import {
  removeCorpus,
  runCli,
  runCliIn,
  writeAuditCorpus,
} from "./cli_support.ts";

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
        "Format markdown wiki pages with the Deno formatter.",
      ),
    );
    const commandSection =
      help.stdout.split("Commands:\n")[1]?.split("\n\n")[0] ?? "";
    const namesInHelp = commandSection.split("\n").flatMap((line) => {
      const match = /^\s{2}(.+?)\s{2,}/.exec(line);
      return match?.[1]?.split(", ") ?? [];
    });
    assertEquals([...namesInHelp].sort(), [...COMMAND_NAMES].sort());
    assert(namesInHelp.includes("i"));
    assertEquals(new Set(COMMAND_NAMES).size, COMMAND_NAMES.length);

    const empty = await runCli([]);
    assertEquals(empty.code, EXIT_USAGE);
    assertEquals(empty.stdout, "");
    assertEquals(empty.stderr, help.stdout);
  },
);

Deno.test(
  "file command help lists each command's actual options",
  { permissions: { run: true } },
  async () => {
    const cases = [
      ["check", "--strict", "--verbose"],
      ["lint", "--strict", "--verbose"],
      ["fmt", "--check", "--verbose"],
    ] as const;

    for (const [command, option, verbose] of cases) {
      const result = await runCli([command, "--help"]);
      assertEquals(result.code, EXIT_OK);
      assertEquals(result.stderr, "");
      assert(result.stdout.startsWith(`Usage: wiki ${command} [OPTIONS]`));
      assert(result.stdout.includes(option));
      assert(result.stdout.includes(verbose));
      assert(result.stdout.includes("--help"));
    }

    const alias = await runCli(["i", "--help"]);
    assertEquals(alias.code, EXIT_OK);
    assertEquals(
      alias.stdout,
      "Usage: wiki i [OPTIONS] [URL]\n\nAlias for install.\n\nOptions:\n  --help  Show this message and exit.\n",
    );
    assertEquals(alias.stderr, "");
  },
);

Deno.test(
  "lint reports warnings on stderr and passes without --strict",
  { permissions: { run: true, read: true, write: true } },
  async () => {
    const root = writeAuditCorpus();
    try {
      const result = await runCliIn(
        ["-c", "wiki.yml", "lint", "-v"],
        root,
        ["--allow-all"],
      );
      assertEquals(result.code, EXIT_OK);
      // Diagnostics never touch stdout: a caller might be piping a report.
      assertEquals(result.stdout, "");
      assertEquals(
        result.stderr,
        "Warnings:\n" +
          "  - In Page: Broken WikiLink [Missing] points to non-existent document.\n" +
          '  - In Page.md:6: Wikilink "[[Missing]]"; use standard links ' +
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
        root,
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
        root,
        ["--allow-all"],
      );
      assertEquals(result.code, EXIT_FAILURE);
      assertEquals(result.stdout, "");
      assert(
        result.stderr.includes(
          'In Page: wazoo:layout "layouts/missing.html" must resolve to a ' +
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
  "graph and graph list help match the Python CLI",
  { permissions: { run: true } },
  async () => {
    const group = await runCli(["graph", "--help"]);
    assertEquals(group.code, EXIT_OK);
    assertEquals(group.stderr, "");
    assertEquals(
      group.stdout,
      "Usage: wiki graph [OPTIONS] COMMAND [ARGS]...\n\n" +
        "  Inspect read-only RDF named graph provenance.\n\n" +
        "Options:\n" +
        "  --help  Show this message and exit.\n\n" +
        "Commands:\n" +
        "  list  List named graphs available to SPARQL GRAPH queries.\n",
    );

    const list = await runCli(["graph", "list", "--help"]);
    assertEquals(list.code, EXIT_OK);
    assertEquals(list.stderr, "");
    assertEquals(
      list.stdout,
      "Usage: wiki graph list [OPTIONS]\n\n" +
        "  List named graphs available to SPARQL GRAPH queries.\n\n" +
        "Options:\n" +
        "  --help  Show this message and exit.\n",
    );
  },
);

Deno.test(
  "graph group usage errors identify the correct command context",
  { permissions: { run: true } },
  async () => {
    const missing = await runCli(["graph"]);
    assertEquals(missing.code, EXIT_USAGE);
    assertEquals(missing.stdout, "");
    assertEquals(
      missing.stderr,
      "Usage: wiki graph [OPTIONS] COMMAND [ARGS]...\n" +
        "Try 'wiki graph --help' for help.\n\n" +
        "Error: Missing command.\n",
    );

    const unknown = await runCli(["graph", "bogus"]);
    assertEquals(unknown.code, EXIT_USAGE);
    assertEquals(unknown.stdout, "");
    assertEquals(
      unknown.stderr,
      "Usage: wiki graph [OPTIONS] COMMAND [ARGS]...\n" +
        "Try 'wiki graph --help' for help.\n\n" +
        "Error: No such command 'bogus'.\n",
    );

    const extra = await runCli(["graph", "list", "extra"]);
    assertEquals(extra.code, EXIT_USAGE);
    assertEquals(extra.stdout, "");
    assertEquals(
      extra.stderr,
      "Usage: wiki graph list [OPTIONS]\n" +
        "Try 'wiki graph list --help' for help.\n\n" +
        "Error: Got unexpected extra argument (extra)\n",
    );
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
        root,
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
    const root = Deno.makeTempDirSync({ prefix: "wiki-cli-build-" });
    const wikiDir = join(root, "wiki");
    Deno.mkdirSync(wikiDir, { recursive: true });
    Deno.writeTextFileSync(
      join(root, "wiki.yml"),
      "wiki:\n  input: [wiki]\n",
    );
    Deno.writeTextFileSync(
      join(wikiDir, "Ethan.md"),
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
        root,
        ["--allow-all"],
      );
      assertEquals(result.code, EXIT_OK, result.stderr);
      assert(result.stdout.includes("Built 1 pages and 0 assets to published"));
      const page = Deno.readTextFileSync(
        join(root, "published", "wiki", "Ethan", "index.html"),
      );
      assert(page.includes("A valid page."));
    } finally {
      removeCorpus(root);
    }
  },
);
