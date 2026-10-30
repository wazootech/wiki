import { join } from "@std/path";
import { assert, assertEquals } from "@std/assert";
import {
  COMMAND_NAMES,
  EXIT_FAILURE,
  EXIT_OK,
  EXIT_USAGE,
  FILE_COMMAND_NAMES,
  PROG_NAME,
} from "../src/wiki/cli.ts";
import {
  removeCorpus,
  runCli,
  runCliIn,
  runLinkIn,
  writeLinkCorpus,
  writeRenderCorpus,
} from "./cli_support.ts";

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

Deno.test(
  "link reports an opportunity on stdout and exits 0",
  { permissions: { run: true, read: true, write: true } },
  async () => {
    const root = writeLinkCorpus();
    try {
      const result = await runLinkIn([], root);
      assertEquals(result.code, EXIT_OK);
      assertEquals(result.stderr, "");
      assertEquals(
        result.stdout,
        'Source_Page.md:5:5: "Target Page" -> [Target Page](Target_Page.md)\n',
      );
    } finally {
      removeCorpus(root);
    }
  },
);

Deno.test(
  "link --check exits 1 while an opportunity remains, 0 once applied",
  { permissions: { run: true, read: true, write: true } },
  async () => {
    const root = writeLinkCorpus();
    try {
      // The command-level -c/--check shadows the global -c/--config that
      // selects the config file: both must parse at once.
      const failing = await runLinkIn(["--check"], root);
      assertEquals(failing.code, EXIT_FAILURE);
      assertEquals(failing.stderr, "");

      const applied = await runLinkIn(["--apply"], root);
      assertEquals(applied.code, EXIT_OK);

      const page = Deno.readTextFileSync(join(root, "wiki", "Source_Page.md"));
      assert(page.includes("See [Target Page](Target_Page.md) for details."));

      const passing = await runLinkIn(["--check"], root);
      assertEquals(passing.code, EXIT_OK);
    } finally {
      removeCorpus(root);
    }
  },
);

Deno.test(
  "link --dry-run previews the apply without writing the file",
  { permissions: { run: true, read: true, write: true } },
  async () => {
    const root = writeLinkCorpus();
    try {
      const before = Deno.readTextFileSync(
        join(root, "wiki", "Source_Page.md"),
      );
      const result = await runLinkIn(["--apply", "--dry-run"], root);
      assertEquals(result.code, EXIT_OK);
      assertEquals(
        Deno.readTextFileSync(join(root, "wiki", "Source_Page.md")),
        before,
      );
    } finally {
      removeCorpus(root);
    }
  },
);

Deno.test(
  "link --fix-broken repairs an unambiguous fragment and writes the file",
  { permissions: { run: true, read: true, write: true } },
  async () => {
    const root = writeLinkCorpus();
    try {
      const result = await runLinkIn(["--fix-broken"], root);
      assertEquals(result.code, EXIT_OK);
      assertEquals(result.stderr, "");
      assert(
        result.stdout.includes(
          "Target_Page.md#targt-page -> Target_Page.md#target-page",
        ),
      );
      const page = Deno.readTextFileSync(join(root, "wiki", "Source_Page.md"));
      assert(page.includes("[frag](Target_Page.md#target-page)"));
    } finally {
      removeCorpus(root);
    }
  },
);

Deno.test(
  "render --check reports stale blocks on stderr and exits 1, then render writes them",
  { permissions: { run: true, read: true, write: true } },
  async () => {
    const root = writeRenderCorpus();
    try {
      const stale = await runCliIn(
        ["-c", "wiki.yml", "render", "--check"],
        root,
        ["--allow-all"],
      );
      assertEquals(stale.code, EXIT_FAILURE);
      assertEquals(stale.stdout, "");
      assert(stale.stderr.includes("Inline SPARQL blocks are out of date"));

      const rendered = await runCliIn(
        ["-c", "wiki.yml", "render", "-v"],
        root,
        ["--allow-all"],
      );
      assertEquals(rendered.code, EXIT_OK, rendered.stderr);
      assertEquals(rendered.stderr, "");
      assert(rendered.stdout.includes("Rendered SPARQL: Updated 2 files."));

      const alice = Deno.readTextFileSync(join(root, "wiki", "Alice.md"));
      assert(alice.includes("<!-- sparql:end -->"));

      const fresh = await runCliIn(
        ["-c", "wiki.yml", "render", "--check"],
        root,
        ["--allow-all"],
      );
      assertEquals(fresh.code, EXIT_OK);
    } finally {
      removeCorpus(root);
    }
  },
);

Deno.test("wiki file groups the single-file verbs", async () => {
  const help = await runCli(["file", "--help"]);
  assertEquals(help.code, EXIT_OK);
  assert(
    help.stdout.startsWith("Usage: wiki file [OPTIONS] COMMAND [ARGS]..."),
  );
  const commandSection = help.stdout.split("Commands:\n")[1] ?? "";
  const names = commandSection.split("\n").flatMap((line) => {
    const match = /^\s{2}(\S+)\s{2,}/.exec(line);
    return match?.[1] ? [match[1]] : [];
  });
  assertEquals(names.sort(), [...FILE_COMMAND_NAMES].sort());
  assertEquals(
    [...FILE_COMMAND_NAMES].sort(),
    ["mv", "new", "patch", "refs", "rm", "set", "show"],
  );
  // The verbs are not top-level, and `edit` (the batch engine) stays there.
  for (const verb of FILE_COMMAND_NAMES) {
    assert(!COMMAND_NAMES.includes(verb), verb);
  }
  assert(COMMAND_NAMES.includes("edit"));

  const bare = await runCli(["new", "x.md"]);
  assertEquals(bare.code, EXIT_USAGE);
  assert(bare.stderr.includes(`Did you mean '${PROG_NAME} file new'?`));

  const missing = await runCli(["file"]);
  assertEquals(missing.code, EXIT_USAGE);
  assert(missing.stderr.includes("Error: Missing command."));

  const unknown = await runCli(["file", "touch"]);
  assertEquals(unknown.code, EXIT_USAGE);
  assert(unknown.stderr.includes("Error: No such command 'touch'."));
});
