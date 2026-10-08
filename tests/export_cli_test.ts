import { assertEquals, assertStringIncludes } from "@std/assert";
import { fromFileUrl } from "@std/path";

const CLI_ENTRY = fromFileUrl(new URL("../src/wiki/cli.ts", import.meta.url));
const DECODER = new TextDecoder();

async function runExportCli(args: readonly string[], cwd: string) {
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
  "export CLI writes JSON, raw RDF, and explicitly rejects deferred RDF/XML",
  { permissions: { run: true, read: true, write: true } },
  async () => {
    const root = Deno.makeTempDirSync({ prefix: "wiki-export-cli-" });
    try {
      const wiki = `${root}/wiki`;
      Deno.mkdirSync(wiki);
      const config = `${root}/wiki.yml`;
      Deno.writeTextFileSync(
        config,
        'wiki:\n  input: [wiki]\ngraph:\n  context:\n    "@vocab": https://schema.org/\n    schema: https://schema.org/\n    wiki: https://wiki.example.org/\n',
      );
      const ada = `${wiki}/Ada.md`;
      const bob = `${wiki}/Bob.md`;
      Deno.writeTextFileSync(
        ada,
        "---\nid: wiki:Ada\ntype: schema:Person\nname: Ada\n---\n",
      );
      Deno.writeTextFileSync(
        bob,
        "---\nid: wiki:Bob\ntype: schema:Person\nname: Bob\n---\n",
      );

      const dict = await runExportCli(["-c", config, "export", ada], root);
      assertEquals(dict.code, 0);
      const payload = JSON.parse(dict.stdout) as {
        name: string;
        rdf: { name: string };
      };
      assertEquals(payload.name, "Ada.md");
      assertEquals(payload.rdf.name, "Ada");

      const turtle = await runExportCli([
        "-c",
        config,
        "export",
        "--format",
        "turtle",
        ada,
      ], root);
      assertEquals(turtle.code, 0);
      assertStringIncludes(turtle.stdout, "schema:name");
      assertStringIncludes(turtle.stdout, "Ada");

      const xml = await runExportCli([
        "-c",
        config,
        "export",
        "--format",
        "xml",
        ada,
      ], root);
      assertEquals(xml.code, 1);
      assertStringIncludes(xml.stderr, "RDF/XML serialization is deferred");

      const multi = await runExportCli([
        "-c",
        config,
        "export",
        "-f",
        "turtle",
        ada,
        bob,
      ], root);
      assertEquals(multi.code, 1);
      assertStringIncludes(multi.stderr, "single FILE");

      const output = `${root}/export.json`;
      const written = await runExportCli([
        "-c",
        config,
        "export",
        "-o",
        output,
        ada,
      ], root);
      assertEquals(written.code, 0);
      assertStringIncludes(written.stdout, "Written payload");
      assertEquals(JSON.parse(Deno.readTextFileSync(output)).rdf.name, "Ada");
    } finally {
      Deno.removeSync(root, { recursive: true });
    }
  },
);
