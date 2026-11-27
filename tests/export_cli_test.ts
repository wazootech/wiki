import * as sys from "../src/wiki/sys.ts";
import { test } from "node:test";
import { assertEquals, assertStringIncludes } from "@std/assert";
import { fromFileUrl } from "@std/path";

const CLI_ENTRY = fromFileUrl(new URL("../src/wiki/cli.ts", import.meta.url));
const DECODER = new TextDecoder();

async function runExportCli(args: readonly string[], cwd: string) {
  const result = await new sys.Command(sys.execPath(), {
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

test(
  "export CLI writes JSON, raw RDF, and explicitly rejects deferred RDF/XML",
  async () => {
    const root = sys.makeTempDirSync({ prefix: "wiki-export-cli-" });
    try {
      const wiki = `${root}/wiki`;
      sys.mkdirSync(wiki);
      const config = `${root}/wiki.yml`;
      sys.writeTextFileSync(
        config,
        'wiki:\n  input: [wiki]\ngraph:\n  context:\n    "@vocab": https://schema.org/\n    schema: https://schema.org/\n    wiki: https://wiki.example.org/\n',
      );
      const ada = `${wiki}/Ada.md`;
      const bob = `${wiki}/Bob.md`;
      sys.writeTextFileSync(
        ada,
        "---\nid: wiki:Ada\ntype: schema:Person\nname: Ada\n---\n",
      );
      sys.writeTextFileSync(
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
      assertEquals(JSON.parse(sys.readTextFileSync(output)).rdf.name, "Ada");
    } finally {
      sys.removeSync(root, { recursive: true });
    }
  },
);
