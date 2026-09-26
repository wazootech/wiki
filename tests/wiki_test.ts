/**
 * Port of `tests/test_wiki.py`.
 *
 * Three adaptations, each because the Python test asserts through a seam the
 * port does not need to have:
 *
 * - **`TestNamedGraphDetection` is not repeated.** The Python file re-tests
 *   `_uses_named_graphs`, which is a re-export there and an import here;
 *   `graph_test.ts` already covers the keyword-versus-lookalike cases against
 *   the function itself.
 * - **The two `patch("wiki.wiki._run_check")` tests become behavioural.** The
 *   Python mocks assert that `check()` *calls* `_run_check` and passes
 *   `file_paths` for a scoped run. The port has no reason to expose that seam,
 *   so what is asserted instead is what the difference is *for*: a scoped check
 *   reports per-document findings with the document on the issue, and a
 *   whole-wiki check does not report them at all.
 * - **`test_preflight_merges_lint_and_check` is behavioural too**, and stronger:
 *   the Python version patches both passes to return canned reports, while this
 *   one builds a corpus that really does produce one lint warning and one check
 *   error and asserts the merge order.
 */

import { basename, dirname, join } from "@std/path";
import { isDirectory } from "../src/wiki/fspath.ts";
import { assert, assertEquals, assertFalse } from "@std/assert";

import { type LogRecord, setLogSink } from "../src/wiki/logging.ts";
import { Wiki } from "../src/wiki/wiki.ts";

/** A unique temp directory, to be removed with {@link cleanup}. */
function tempRoot(): string {
  return Deno.makeTempDirSync({ prefix: "wiki-session-" });
}

function cleanup(root: string): void {
  try {
    Deno.removeSync(root, { recursive: true });
  } catch {
    // Windows keeps a handle open long enough to lose this race occasionally.
  }
}

/** Write a file below `root`, creating parent directories. */
function write(root: string, relative: string, content: string): string {
  const target = join(root, ...relative.split("/"));
  Deno.mkdirSync(dirname(target), { recursive: true });
  Deno.writeTextFileSync(target, content);
  return target;
}

/** Run `fn` with the log sink captured, and return what it collected. */
function captureLogs<T>(fn: () => T): { records: LogRecord[]; value: T } {
  const records: LogRecord[] = [];
  setLogSink((record) => records.push(record));
  try {
    return { records, value: fn() };
  } finally {
    setLogSink(null);
  }
}

/** A wiki root with a config file, ready for `Wiki.load`. */
function writeWiki(root: string, pages: Record<string, string>): void {
  for (const [name, content] of Object.entries(pages)) {
    write(root, `wiki/${name}`, content);
  }
  write(root, "wiki.yaml", "wiki:\n  input: [wiki]\n");
}

Deno.test("Wiki.load resolves the config and checks the whole wiki", () => {
  const root = tempRoot();
  try {
    writeWiki(root, { "Page.md": "# Page\n\nContent." });
    const wiki = Wiki.load(root);

    // The input directory is resolved against the config root, so the corpus is
    // found from a config file whose own path is relative.
    assertEquals(wiki.config.wiki.input.length, 1);
    assert(isDirectory(wiki.config.wiki.input[0]!));
    assertEquals(basename(wiki.config_path!), "wiki.yaml");
  } finally {
    cleanup(root);
  }
});

Deno.test("Wiki.load honours wiki_inputs over the config file", () => {
  const root = tempRoot();
  try {
    writeWiki(root, { "Page.md": "# Page\n" });
    write(root, "extra/Other.md", "# Other\n");

    const wiki = Wiki.load(root, { wikiInputs: ["extra"] });
    assertEquals(
      wiki.config.wiki.input.map((path) => basename(path)),
      ["extra"],
    );

    // An absolute entry is taken as given rather than joined onto the root.
    const absolute = Wiki.load(root, {
      wikiInputs: [join(root, "extra")],
    });
    // The filesystem normalises one spelling to the other, so the assertion is
    // on the segment rather than the separator.
    assert(
      (absolute.config.wiki.input[0]!).replaceAll("\\", "/").endsWith("/extra"),
    );
  } finally {
    cleanup(root);
  }
});

Deno.test("a scoped check reports per-document findings, a whole-wiki check does not", async () => {
  const root = tempRoot();
  try {
    writeWiki(root, {
      "Plain.md": "Just prose, no metadata.\n",
      "Typed.md": "---\ntype: schema:WebPage\n---\n\nBody.\n",
    });
    const wiki = Wiki.load(root);
    const plain = join(wiki.config.wiki.input[0]!, "Plain.md");

    // Scoped: `missing_metadata` is a per-document finding, and the issue carries
    // the document it came from — which is the `file_paths` distinction the
    // Python test reads out of its mock.
    const scoped = await wiki.check([plain]);
    assertFalse(scoped.ok);
    assertEquals(scoped.errors.length, 1);
    assertEquals(scoped.errors[0]!.code, "missing_metadata");
    assertEquals(basename(scoped.errors[0]!.path!), "Plain.md");

    // Whole-wiki: the same page is not a finding, because the pass validates the
    // assembled graph rather than each file.
    const whole = await wiki.check();
    assertFalse(
      whole.errors.some((issue) => issue.code === "missing_metadata"),
      whole.errors.map((issue) => issue.message).join(" | "),
    );
  } finally {
    cleanup(root);
  }
});

Deno.test("strict promotes a warning into an error and flips the report", () => {
  const root = tempRoot();
  try {
    writeWiki(root, {
      "Page.md": "---\ntype: schema:WebPage\n---\n\nSee [[Missing]].\n",
    });
    const wiki = Wiki.load(root);

    // `broken_links` defaults to `warning`, so the run passes and says why. The
    // page produces *two* warnings, not one: a wikilink is a broken link and a
    // style violation at once while `link.style` is `standard`, which is the
    // default. Both are the oracle's findings.
    const lenient = wiki.lint();
    assert(lenient.ok);
    assertEquals(
      lenient.warnings.map((issue) => issue.code),
      ["broken_links", "link_style"],
    );

    const strict = wiki.lint(null, { strict: true });
    assertFalse(strict.ok);
    assertEquals(strict.errors.length, 2);
    assertEquals(strict.warnings.length, 0);
    assert(strict.errors.some((issue) => issue.code === "broken_links"));
  } finally {
    cleanup(root);
  }
});

Deno.test("preflight merges lint then check", () => {
  const root = tempRoot();
  return (async () => {
    try {
      // One lint warning (a broken wikilink) and one check error (a layout that
      // does not resolve), so the merge has something from each pass and their
      // order is observable.
      writeWiki(root, {
        "Page.md":
          "---\ntype: schema:WebPage\nwazoo:layout: layouts/missing.html\n---\n\nSee [[Missing]].\n",
      });
      const wiki = Wiki.load(root);

      const report = await wiki.preflight();
      assertFalse(report.ok);
      // Lint first, then check: two warnings from the lint pass (the broken link
      // and the wikilink style), then the layout error. The merge order is what
      // `preflight` — and `build`'s preflight — actually fixes.
      assertEquals(
        report.warnings.map((issue) => issue.code),
        ["broken_links", "link_style"],
      );
      assertEquals(report.errors.length, 1);
      assertEquals(report.errors[0]!.code, "missing_layout_file");
    } finally {
      cleanup(root);
    }
  })();
});

Deno.test("withRuntime overrides the site block without mutating the original", () => {
  const root = tempRoot();
  try {
    writeWiki(root, { "Page.md": "# Page\n" });
    const wiki = Wiki.load(root);
    const original = wiki.config.site.base_url;

    const runtime = wiki.withRuntime({ baseUrl: "/custom/", urlStyle: "file" });
    // The right-strip is the point: every URL builder appends its own separator.
    assertEquals(runtime.config.site.base_url, "/custom");
    assertEquals(runtime.config.site.url_style, "file");
    assertEquals(wiki.config.site.base_url, original);

    // The graph accessors read the copy's config, so the override reaches them.
    const reloaded = runtime.withRuntime({ urlStyle: "dir" });
    assertEquals(reloaded.config.site.url_style, "dir");
    assertEquals(runtime.config.site.url_style, "file");
  } finally {
    cleanup(root);
  }
});

Deno.test("locked sources extend wiki.input, and a missing cache warns", () => {
  const root = tempRoot();
  try {
    writeWiki(root, { "Page.md": "# Page\n" });
    const wikiDir = join(root, "wiki");
    // A locked source with a populated cache, and one whose checkout is gone.
    const cached = join(root, ".wiki", "sources", "cached", "repo");
    Deno.mkdirSync(cached, { recursive: true });
    Deno.writeTextFileSync(
      join(cached, "Sourced.md"),
      "---\ntype: schema:WebPage\n---\n",
    );
    write(
      root,
      "wiki.lock",
      JSON.stringify({
        version: 2,
        sources: {
          cached: {
            url: "https://github.com/example/cached.git",
            resolved_ref: "0".repeat(40),
            ref: "main",
            path: null,
            fetched_at: "2026-01-01T00:00:00Z",
            required_by: [],
          },
          missing: {
            url: "https://github.com/example/missing.git",
            resolved_ref: "1".repeat(40),
            ref: "main",
            path: null,
            fetched_at: "2026-01-01T00:00:00Z",
            required_by: [],
          },
        },
      }),
    );

    const { records, value: wiki } = captureLogs(() => Wiki.load(root));
    assertEquals(
      wiki.config.wiki.input.map((path) => basename(path)),
      [basename(wikiDir), "repo"],
    );
    // The uncached source is skipped with a warning rather than dropped in
    // silence — a wiki that quietly loaded fewer pages would be worse than one
    // that says which source it could not find.
    assert(
      records.some((record) => record.message.includes("not cached")),
      records.map((record) => record.message).join(" | "),
    );
  } finally {
    cleanup(root);
  }
});
