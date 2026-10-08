import { assertEquals } from "@std/assert";
import { fromFileUrl } from "@std/path";

const CLI_ENTRY = fromFileUrl(new URL("../src/wiki/cli.ts", import.meta.url));
const DECODER = new TextDecoder();

async function runQueryCli(args: readonly string[], cwd: string) {
  const result = await new Deno.Command(Deno.execPath(), {
    args: ["run", "--quiet", "--allow-all", CLI_ENTRY, ...args],
    cwd,
    stdout: "piped",
    stderr: "piped",
  }).output();
  return {
    code: result.code,
    stdout: DECODER.decode(result.stdout),
    stderr: DECODER.decode(result.stderr),
  };
}

Deno.test(
  "query CLI handles JSON output, output files, and --jq",
  { permissions: { run: true, read: true, write: true } },
  async () => {
    const root = Deno.makeTempDirSync({ prefix: "wiki-query-cli-" });
    try {
      const wiki = `${root}/wiki`;
      Deno.mkdirSync(wiki);
      Deno.writeTextFileSync(`${root}/wiki.yml`, "wiki:\n  input: [wiki]\n");
      Deno.writeTextFileSync(
        `${wiki}/Ada.md`,
        "---\ntype: schema:Person\nname: Ada\n---\n# Ada\n",
      );
      const query =
        "SELECT ?name WHERE { ?person a <https://schema.org/Person> ; <https://schema.org/name> ?name }";
      const outputPath = `${root}/results.json`;
      const output = await runQueryCli(
        [
          "-c",
          "wiki.yml",
          "query",
          "--no-inference",
          query,
          "--format",
          "json",
          "-o",
          outputPath,
        ],
        root,
      );
      assertEquals(output.code, 0, output.stderr);
      assertEquals(output.stdout, `Written results to ${outputPath}\n`);
      const results = JSON.parse(Deno.readTextFileSync(outputPath));
      assertEquals(results.results.bindings[0].name.value, "Ada");

      const filtered = await runQueryCli(
        [
          "-c",
          "wiki.yml",
          "query",
          "--no-inference",
          "--jq",
          "results.bindings[].name.value",
          query,
        ],
        root,
      );
      assertEquals(filtered.code, 0, filtered.stderr);
      assertEquals(filtered.stdout, "Ada\n");

      const filteredEmpty = await runQueryCli(
        [
          "-c",
          "wiki.yml",
          "query",
          "--no-inference",
          "--jq",
          "results.nonexistent",
          query,
        ],
        root,
      );
      assertEquals(filteredEmpty.code, 0, filteredEmpty.stderr);
      assertEquals(filteredEmpty.stdout, "\n");
      assertEquals(filteredEmpty.stderr, "");
    } finally {
      Deno.removeSync(root, { recursive: true });
    }
  },
);
