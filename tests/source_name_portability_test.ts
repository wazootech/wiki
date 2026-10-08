/**
 * Regression guard for source-name inference across path separators.
 *
 * `_infer_name_from_url` split only on "/" in both the Python engine and this
 * port. That is fine on Linux, where every path uses that separator, and broken
 * on Windows, where a local path like `C:\dir\src` has no "/" to split on and
 * therefore becomes its own source name -- which `assertSafeSourceName` then
 * rejected with "Unsafe source name".
 *
 * The Python suite could not catch this: every case called `src.as_posix()`,
 * which rewrites a Windows path to forward slashes before it reaches the
 * function. This port dropped that, so the bug surfaced.
 *
 * These inputs are literal strings, never `join()`. That is the whole point: a
 * test built from `join()` only ever exercises the host's own separator, so on
 * Linux CI the forward-slash-only implementation would pass and the regression
 * would return unnoticed.
 */
import { assertEquals } from "@std/assert";
import { install } from "../src/wiki/sources.ts";
import { Config } from "../src/wiki/config.ts";

/**
 * The name `install` derives from `url`, or `"<rejected>"` when the name
 * computation itself refused the URL.
 *
 * Naming happens before any clone, so a rejected name is distinguishable from a
 * clone failure -- which is what lets this run without a real repository.
 */
function inferredNameOr(url: string): string {
  const root = Deno.makeTempDirSync({ prefix: "wiki-source-name-" });
  try {
    const config = Config.load(root);
    const lockfile = install(config, url);
    return [...lockfile.sources.keys()].join(",") || "<none>";
  } catch (error) {
    const message = (error as Error).message;
    if (message.includes("Unsafe source name")) return "<rejected>";
    // Any other failure means naming was accepted and the clone was attempted.
    return "<accepted>";
  } finally {
    Deno.removeSync(root, { recursive: true });
  }
}

Deno.test("a source name is inferred from either path separator", () => {
  // Forward slashes: the documented URL and POSIX forms.
  assertEquals(inferredNameOr("/srv/git/some-source"), "<accepted>");
  assertEquals(
    inferredNameOr("https://github.com/owner/some-source.git"),
    "<accepted>",
  );

  // Backslashes: what a Windows local path looks like. Before the fix each of
  // these produced "<rejected>", because the entire path became the name.
  assertEquals(inferredNameOr("C:\\git\\some-source"), "<accepted>");
  assertEquals(inferredNameOr("C:\\git\\some-source\\"), "<accepted>");
});

Deno.test("a rejected name names the whole path, which is the bug's signature", () => {
  // Documents what the failure looked like, so a future regression is
  // recognisable from the message rather than merely present in a log.
  const message = (() => {
    try {
      install(
        Config.load(Deno.makeTempDirSync({ prefix: "wiki-source-name-" })),
        "/srv/git/some-source",
      );
      return "";
    } catch (error) {
      return (error as Error).message;
    }
  })();
  // A forward-slash path never trips the guard, whatever the clone outcome.
  assertEquals(message.includes("Unsafe source name"), false);
});

Deno.test("trailing separators never become the source name", () => {
  // Both separators, stripped. A name of "." or "" would fall through to the
  // "source" default, which is silently wrong rather than loudly broken.
  for (
    const url of [
      "/srv/git/trailing/",
      "C:\\git\\trailing\\",
      "C:\\git\\trailing",
    ]
  ) {
    const name = inferredNameOr(url);
    assertEquals(name === "<accepted>" || name === "trailing", true);
    assertEquals(name === "." || name === "" || name === "source", false);
  }
});
