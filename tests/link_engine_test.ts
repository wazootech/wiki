import { assertEquals, assertStringIncludes } from "@std/assert";
import { Wiki } from "../src/wiki/wiki.ts";

function createWiki() {
  const root = Deno.makeTempDirSync({ prefix: "wiki-link-engine-" });
  const wikiDir = `${root}/wiki`;
  Deno.mkdirSync(wikiDir);
  Deno.writeTextFileSync(`${root}/wiki.yml`, "wiki:\n  input: [wiki]\n");
  Deno.writeTextFileSync(
    `${wikiDir}/Ethan_Davidson.md`,
    "---\nname: Ethan Davidson\n---\n# Ethan Davidson\n\n## Early Life\n",
  );
  const source = `${wikiDir}/Notes.md`;
  Deno.writeTextFileSync(
    source,
    "---\nname: Notes\nreference: '[['\n---\n# Notes\n\nEthan Davidson shared these notes.\n",
  );
  return { root, source, wiki: Wiki.load(root) };
}

function cleanup(root: string) {
  Deno.removeSync(root, { recursive: true });
}

Deno.test("Wiki.link reports unique opportunities without editing by default", () => {
  const { root, source, wiki } = createWiki();
  try {
    const original = Deno.readTextFileSync(source);
    const report = wiki.link();
    assertEquals(report.opportunities, 1);
    assertEquals(report.ok, true);
    assertStringIncludes(report.lines[0]!, "Ethan Davidson");
    assertEquals(Deno.readTextFileSync(source), original);
  } finally {
    cleanup(root);
  }
});

Deno.test("Wiki.link --apply inserts a page link and check accepts the result", () => {
  const { root, source, wiki } = createWiki();
  try {
    const report = wiki.link(null, { apply: true, verbose: true });
    assertEquals(report.opportunities, 1);
    assertEquals(report.changed_paths.map((path) => path.name), ["Notes.md"]);
    assertStringIncludes(
      Deno.readTextFileSync(source),
      "[Ethan Davidson](Ethan_Davidson.md)",
    );
    assertEquals(wiki.link(null, { check: true }).ok, true);
  } finally {
    cleanup(root);
  }
});

Deno.test("Wiki.link repairs unambiguous targets in place and honors dry-run", () => {
  const { root, source, wiki } = createWiki();
  try {
    const original = Deno.readTextFileSync(source).replace(
      "Ethan Davidson shared these notes.",
      "[[Ethan_Davison|Biography]] and [Early life](Ethan_Davidson.md#Eary-life).",
    );
    Deno.writeTextFileSync(source, original);

    const preview = wiki.link(null, {
      fixBroken: true,
      dryRun: true,
      verbose: true,
    });
    assertEquals(preview.fixes, 2);
    assertEquals(preview.changed_paths.map((path) => path.name), ["Notes.md"]);
    assertEquals(Deno.readTextFileSync(source), original);

    const applied = wiki.link(null, { fixBroken: true, verbose: true });
    assertEquals(applied.fixes, 2);
    assertStringIncludes(
      Deno.readTextFileSync(source),
      "[[Ethan_Davidson|Biography]] and [Early life](Ethan_Davidson.md#early-life).",
    );
    assertEquals(wiki.link(null, { fixBroken: true, check: true }).ok, true);
  } finally {
    cleanup(root);
  }
});
