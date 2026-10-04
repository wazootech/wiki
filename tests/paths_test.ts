/**
 * Path and route tests, ported from the `TestWikiPaths` cases in
 * `tests/test_paths.py` that belong to this module (the asset and broken-link
 * cases there belong to later milestones).
 *
 * Routes and output paths are what users see in their browser and their `_site`
 * directory, so every case here is a published artefact rather than an internal
 * detail.
 */

import { dirname, join } from "@std/path";
import { isDirectory } from "../src/wiki/fspath.ts";
import { assertEquals, assertStringIncludes } from "@std/assert";
import { Config } from "../src/wiki/config.ts";

import {
  buildPageManifest,
  compilePythonRegex,
  detectOutputCollisions,
  pageOutputPath,
  pageRoutes,
  pageUrl,
  routeForDocumentFile,
  validateFilenamePattern,
  validateRouteSafety,
} from "../src/wiki/paths.ts";
import type { OutputEntry } from "../src/wiki/schemas/domain.ts";

/** Run `body` with a fresh temp directory, cleaning up afterwards. */
function withTempDir(body: (root: string) => void): void {
  const dir = Deno.makeTempDirSync({ prefix: "wiki-paths-" });
  try {
    body(dir);
  } finally {
    Deno.removeSync(dir, { recursive: true });
  }
}

/** Write `name` under `root`, creating parent directories as needed. */
function writePage(root: string, name: string, content = "# Page\n"): string {
  const file = join(root, name);
  if (!isDirectory(dirname(file))) {
    Deno.mkdirSync(dirname(file), { recursive: true });
  }
  Deno.writeTextFileSync(file, content);
  return file;
}

Deno.test("routes preserve case, folders, and a copy suffix", () => {
  withTempDir((root) => {
    const wiki = join(root, "wiki");
    const page = writePage(
      wiki,
      "games/Pokemon_Diamond_(copy_1).md",
      "# Pokemon",
    );
    const config = Config.forRoot(root, { wiki: { input: [wiki] } });
    assertEquals(
      routeForDocumentFile(config, page),
      "games/Pokemon_Diamond_(copy_1)",
    );
  });
});

Deno.test("index.md maps to its containing folder", () => {
  withTempDir((root) => {
    const wiki = join(root, "wiki");
    const rootIndex = writePage(wiki, "index.md", "# Home");
    const folderIndex = writePage(wiki, "games/index.md", "# Games");
    const config = Config.forRoot(root, { wiki: { input: [wiki] } });
    assertEquals(routeForDocumentFile(config, rootIndex), "");
    assertEquals(routeForDocumentFile(config, folderIndex), "games");
  });
});

Deno.test("dir url style uses a trailing slash", () => {
  assertEquals(
    pageUrl("/wiki", "Ethan_Davidson", "dir"),
    "/wiki/Ethan_Davidson/",
  );
  assertEquals(pageUrl("/wiki", "", "dir"), "/wiki/");
  assertEquals(
    pageUrl("/wiki", "Ethan_Davidson", "file"),
    "/wiki/Ethan_Davidson.html",
  );
  // Parentheses are in the caller's safe set, so a copy suffix stays readable.
  assertEquals(
    pageUrl("/wiki", "games/Pokemon_Diamond_(copy_1)", "dir"),
    "/wiki/games/Pokemon_Diamond_(copy_1)/",
  );
  // Everything outside that safe set is percent-encoded, per byte.
  assertEquals(
    pageUrl("/wiki", "caf\u00e9/na\u00efve", "file"),
    "/wiki/caf%C3%A9/na%C3%AFve.html",
  );
});

Deno.test("output paths for dir and file styles", () => {
  const owned = join("_site", "wiki");
  assertEquals(
    pageOutputPath(owned, "games/Pokemon", "dir"),
    join(owned, "games", "Pokemon", "index.html"),
  );
  assertEquals(
    pageOutputPath(owned, "games/Pokemon", "file"),
    join(owned, "games", "Pokemon.html"),
  );
  assertEquals(
    pageOutputPath(owned, "", "dir"),
    join(owned, "index.html"),
  );
  assertEquals(
    pageOutputPath(owned, "", "file"),
    join(owned, "index.html"),
  );
});

Deno.test("route safety rejects spaces and URL-special characters", () => {
  withTempDir((root) => {
    const wiki = join(root, "wiki");
    writePage(wiki, "Bad Page.md", "# Bad");
    writePage(wiki, "Bad#Page.md", "# Bad");
    const config = Config.forRoot(root, { wiki: { input: [wiki] } });

    const issues = validateRouteSafety(config);
    assertEquals(issues.length, 2);
    assertEquals(
      issues.some((issue) => issue.includes("spaces are not allowed")),
      true,
    );
    assertEquals(
      issues.some((issue) => issue.includes("characters '#'")),
      true,
    );
  });
});

Deno.test("filename_pattern is applied as a full match", () => {
  withTempDir((tmp) => {
    const page = writePage(tmp, "Bad Name.md", "# Bad");
    const config = new Config({
      wiki: { filename_pattern: "[A-Za-z0-9_()-]+\\.md" },
    });
    assertEquals(
      validateFilenamePattern(config, page),
      "Filename 'Bad Name.md' does not match filename_pattern.",
    );
  });
});

Deno.test("filename_pattern is a Python regex, translated where it must be", () => {
  withTempDir((tmp) => {
    const config = new Config({
      wiki: { filename_pattern: "(?P<year>\\d{4})-[a-z]+\\.md" },
    });
    const good = writePage(tmp, "2026-report.md");
    const bad = writePage(tmp, "report-2026.md");
    assertEquals(validateFilenamePattern(config, good), null);
    assertEquals(
      validateFilenamePattern(config, bad),
      "Filename 'report-2026.md' does not match filename_pattern.",
    );
  });
  // `re.fullmatch` semantics: a partial match is not a match, and a trailing
  // newline does not count as the end of the string.
  assertEquals(compilePythonRegex("a|ab").test("ab"), true);
  assertEquals(compilePythonRegex("a").test("ab"), false);
  assertEquals(compilePythonRegex("a").test("a\n"), false);
  assertEquals(
    validateFilenamePattern(
      new Config({ wiki: { filename_pattern: "[a" } }),
      "anything.md",
    )?.startsWith("Invalid filename_pattern: "),
    true,
  );
});

Deno.test("excluded markdown files do not create routes", () => {
  withTempDir((root) => {
    const wiki = join(root, "wiki");
    writePage(wiki, "Published.md", "# Published");
    writePage(wiki, "drafts/Draft.md", "# Draft");
    const config = Config.forRoot(root, {
      wiki: { input: [wiki], exclude: ["wiki/drafts/**"] },
    });
    assertEquals(pageRoutes(config).map((route) => route.route), ["Published"]);
  });
});

Deno.test("duplicate routes collide", () => {
  withTempDir((root) => {
    const wiki = join(root, "wiki");
    writePage(wiki, "About.md", "# About");
    writePage(wiki, "About/index.md", "# About");
    const config = Config.forRoot(root, { wiki: { input: [wiki] } });

    const entries = buildPageManifest(
      config,
      join(root, "_site", "wiki"),
      "/wiki",
      "dir",
    );
    const issues = detectOutputCollisions(entries);
    assertEquals(issues.length >= 1, true);
    assertEquals(issues.some((issue) => issue.includes("About")), true);
  });
});

Deno.test("markdown and yaml with the same slug collide", () => {
  withTempDir((root) => {
    const wiki = join(root, "wiki");
    writePage(wiki, "About.md", "# About");
    writePage(wiki, "About.yaml", "type: Thing\nname: About data\n");
    const config = Config.forRoot(root, { wiki: { input: [wiki] } });

    const entries = buildPageManifest(
      config,
      join(root, "_site", "wiki"),
      "/wiki",
      "dir",
    );
    const issues = detectOutputCollisions(entries);
    assertEquals(issues.length >= 1, true);
    assertEquals(
      issues.some((issue) =>
        issue.includes("About.md") && issue.includes("About.yaml")
      ),
      true,
    );
  });
});

Deno.test("case-only output paths collide", () => {
  const entries: OutputEntry[] = [
    {
      source: "Page.md",
      output_path: "_site/wiki/Page/index.html",
      public_url: "/wiki/Page/",
      kind: "page",
    },
    {
      source: "page.md",
      output_path: "_site/wiki/page/index.html",
      public_url: "/wiki/page/",
      kind: "page",
    },
  ];

  const issues = detectOutputCollisions(entries);
  assertEquals(issues.length >= 1, true);
  assertEquals(
    issues.some((issue) =>
      issue.includes("Page.md") && issue.includes("page.md")
    ),
    true,
  );
});

Deno.test("a collision message names both sides and the URL", () => {
  const entries: OutputEntry[] = [
    {
      source: "wiki/A.md",
      output_path: "_site/wiki/A/index.html",
      public_url: "/wiki/A/",
      kind: "page",
    },
    {
      source: "wiki/a.md",
      output_path: "_site/wiki/a/index.html",
      public_url: "/wiki/a/",
      kind: "page",
    },
  ];
  const [issue] = detectOutputCollisions(entries);
  assertStringIncludes(issue!, "Output collision on output path '/wiki/A/'");
  assertStringIncludes(issue!, "page wiki/A.md conflicts with page wiki/a.md");
});
