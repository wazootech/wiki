import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { BOM, parseFrontmatter } from "../src/wiki/parser.ts";
import { cleanup, runCli, wikiRoot, write } from "./fmt_support.ts";

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
