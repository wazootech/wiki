/**
 * The formatter engine itself: `dprint-plugin-markdown`, called in process.
 *
 * `fmt_test.ts` answers "does `wiki fmt` behave the way `tests/test_fmt.py` says
 * it does?". This file answers the two questions the cutover off `deno fmt`
 * introduced, and they are the ones that can rot silently:
 *
 * 1. **Which plugin, at which version, with which configuration.** The
 *    formatter's output is only reproducible while the plugin is the version
 *    Deno 2.9.6 bundles and the option values are the ones deno's `deno()`
 *    presets set. A patch bump is a formatting change, so the versions are
 *    pinned exactly in `deno.json` and asserted here against the loaded plugin.
 * 2. **Which fence tags reach which formatter.** `deno fmt` calls the plugin's
 *    *library* and picks the tags itself; the WASM build filters tags before the
 *    host callback is consulted, and the two tables disagree in both directions.
 *    Every arm is asserted below, in both directions, because the failure mode is
 *    a quiet restyle of fences that used to be left alone.
 *
 * The expected strings are the `deno fmt` output the pre-cutover engine produced
 * for the same input — `probes/fmt-dprint/verify-production.ts` re-checks the
 * whole corpus against that subprocess, and these cases pin the parts of it that
 * a corpus page cannot isolate.
 */

import { assert, assertEquals, assertThrows } from "@std/assert";
import { createFromBuffer } from "@dprint/formatter";
import * as jsonPlugin from "@dprint/json";
import * as markdownPlugin from "@dprint/markdown";
import * as typescriptPlugin from "@dprint/typescript";
import { fromFileUrl } from "@std/path";

import {
  DEFAULT_LINE_WIDTH,
  formatMarkdownText,
  FORMATTER_PLUGIN_VERSIONS,
} from "../src/wiki/formatter.ts";
import { Path, ValueError } from "../src/wiki/fspath.ts";

const CLI_ENTRY = fromFileUrl(new URL("../src/wiki/cli.ts", import.meta.url));
const DECODER = new TextDecoder();

/** The formatter's entry point, with a placeholder path for its messages. */
function format(text: string): string {
  return formatMarkdownText(text, Path.of("Page.md"), "no");
}

/** A document whose only content is one fenced block. */
function fenced(tag: string, body: string): string {
  return `# ${tag}\n\n\`\`\`${tag}\n${body}\n\`\`\`\n`;
}

// ---------------------------------------------------------------------------
// The pinned plugin versions
// ---------------------------------------------------------------------------

Deno.test("the markdown, json and typescript plugins load at their pinned versions", () => {
  for (
    const [name, plugin, pinned] of [
      ["@dprint/markdown", markdownPlugin, FORMATTER_PLUGIN_VERSIONS.markdown],
      ["@dprint/json", jsonPlugin, FORMATTER_PLUGIN_VERSIONS.json],
      [
        "@dprint/typescript",
        typescriptPlugin,
        FORMATTER_PLUGIN_VERSIONS.typescript,
      ],
    ] as const
  ) {
    const info = createFromBuffer(
      new Uint8Array(Deno.readFileSync(plugin.getPath())),
    ).getPluginInfo();
    assertEquals(
      info.version,
      pinned,
      `${name} is ${info.version}, not the pinned ${pinned} — the pin in ` +
        `deno.json and FORMATTER_PLUGIN_VERSIONS have to move together, and ` +
        `both have to match the plugin version Deno 2.9.6 bundles, because the ` +
        `pinned output is that version's output.`,
    );
  }
});

Deno.test("the yaml plugin loads at its pinned version", () => {
  const wasm = new Uint8Array(
    Deno.readFileSync(
      new URL(import.meta.resolve("dprint-plugin-yaml/plugin.wasm")),
    ),
  );
  assertEquals(
    createFromBuffer(wasm).getPluginInfo().version,
    FORMATTER_PLUGIN_VERSIONS.yaml,
  );
});

// ---------------------------------------------------------------------------
// `wrap`
// ---------------------------------------------------------------------------

const PARAGRAPH =
  "# H\n\nThis paragraph is long enough that a forty column wrap has something to do with it, clearly.\n";

Deno.test("wrap: no leaves the paragraph on one line", () => {
  assertEquals(format(PARAGRAPH), PARAGRAPH);
});

Deno.test("wrap: an integer wraps the paragraph to that column", () => {
  assertEquals(
    formatMarkdownText(PARAGRAPH, Path.of("Page.md"), 40),
    "# H\n\nThis paragraph is long enough that a\n" +
      "forty column wrap has something to do\n" +
      "with it, clearly.\n",
  );
});

Deno.test("wrap: keep preserves the line breaks the page already had", () => {
  const wrapped = "Long\nLines\nkept as they are even though they are short.\n";
  assertEquals(
    formatMarkdownText(wrapped, Path.of("Page.md"), "keep"),
    wrapped,
  );
});

Deno.test("wrap: an unusable value is a ValueError", () => {
  assertThrows(
    () => formatMarkdownText("# H\n", Path.of("Page.md"), "preserve"),
    ValueError,
    "Invalid 'wrap' value: 'preserve'",
  );
});

Deno.test("`keep` maps to the plugin's `maintain`, and `preserve` is a trap", () => {
  // The CLI flag this replaced was `--prose-wrap preserve`; the plugin's value is
  // `maintain`. `preserve` is *accepted* by the plugin, diagnosed, and replaced
  // by its default — which happens to be `maintain` — so the wrong spelling
  // produces the right output today and would not if the default ever moved.
  // Asserting the diagnostic is what keeps the coincidence from being relied on.
  const diagnosticsFor = (textWrap: string) => {
    const formatter = createFromBuffer(
      new Uint8Array(Deno.readFileSync(markdownPlugin.getPath())),
    );
    formatter.setConfig({ lineWidth: DEFAULT_LINE_WIDTH }, { textWrap });
    return formatter.getConfigDiagnostics();
  };
  assertEquals(diagnosticsFor("maintain"), []);
  assertEquals(diagnosticsFor("never"), []);
  assertEquals(diagnosticsFor("always"), []);
  assertEquals(diagnosticsFor("preserve"), [{
    propertyName: "textWrap",
    message: "Found invalid value 'preserve'.",
  }]);
});

// ---------------------------------------------------------------------------
// Which fence tags reach a host formatter
// ---------------------------------------------------------------------------

Deno.test("typescript fences are delegated", () => {
  assertEquals(
    format(fenced("ts", "const x={a:1,b:[1,2]}")),
    fenced("ts", "const x = { a: 1, b: [1, 2] };"),
  );
  assertEquals(
    format(fenced("js", "const x={a:1}")),
    fenced("js", "const x = { a: 1 };"),
  );
});

Deno.test("json fences are delegated", () => {
  assertEquals(
    format(fenced("json", '{"a":1,"b":[1,2]}')),
    fenced("json", '{ "a": 1, "b": [1, 2] }'),
  );
});

Deno.test("yaml fences are delegated, and collapse comment spacing", () => {
  assertEquals(
    format(fenced("yaml", "wiki:  # optional block\n  input: [wiki]")),
    fenced("yaml", "wiki: # optional block\n  input: [wiki]"),
  );
});

Deno.test("css fences are delegated", () => {
  assertEquals(
    format(fenced("css", "a{color:red;margin:0}")),
    fenced("css", "a {\n  color: red;\n  margin: 0;\n}"),
  );
});

Deno.test("fences deno leaves alone are left alone", () => {
  // `xml` and `toml` are the interesting pair: both are reachable through the
  // plugin's own tag table, and neither is in `deno fmt`'s list. Formatting
  // either would be a behaviour change nobody asked for.
  for (
    const [tag, body] of [
      ["xml", "<a><b/></a>"],
      ["toml", "a=1"],
      ["python", "x=1"],
      ["bash", 'echo "hello"'],
      ["sparql", "SELECT ?s WHERE { ?s ?p ?o }"],
      ["turtle", "@prefix ex: <https://example.org/> ."],
      ["text", "plain words"],
    ] as const
  ) {
    assertEquals(format(fenced(tag, body)), fenced(tag, body), tag);
  }
});

Deno.test("the cjs/cts/mjs/mts fences deno formats are not reachable", () => {
  // A known divergence, asserted rather than hidden. `deno fmt` formats these
  // four tags as TypeScript; the plugin's WASM tag table does not list them, so
  // the host callback is never consulted and the body is kept verbatim. No page
  // in either wiki tree uses one.
  for (const tag of ["cjs", "cts", "mjs", "mts"]) {
    const doc = fenced(tag, "const x={a:1}");
    assertEquals(format(doc), doc, tag);
  }
});

Deno.test("a tagless fence is dedented by the plugin alone", () => {
  // No tag means no host formatter, so the only transformation is the plugin's
  // own `unindent`, which is what `deno fmt` did too.
  assertEquals(
    format("# T\n\n```\n  indented\n```\n"),
    "# T\n\n```\nindented\n```\n",
  );
});

Deno.test("an unknown tag reaches no formatter", () => {
  const doc = fenced("zebra", "foo:   1\n  keep:  2");
  assertEquals(format(doc), doc);
});

// ---------------------------------------------------------------------------
// The html post-pass
// ---------------------------------------------------------------------------

const HTML_BODY =
  "<html>\n<head>\n<title>t</title>\n</head>\n<body>\n<p>x</p>\n</body>\n</html>";

Deno.test("html fences are formatted even though the plugin cannot delegate them", () => {
  assertEquals(
    format(fenced("html", HTML_BODY)),
    fenced(
      "html",
      "<html>\n  <head>\n    <title>t</title>\n  </head>\n  <body>\n    <p>x</p>\n  </body>\n</html>",
    ),
  );
});

Deno.test("an html fence inside a list keeps its indentation", () => {
  const indented =
    "# T\n\n- item\n\n  ```html\n  <html>\n  <head>\n  <title>t</title>\n  </head>\n  </html>\n  ```\n";
  const expected =
    "# T\n\n- item\n\n  ```html\n  <html>\n    <head>\n      <title>t</title>\n    </head>\n  </html>\n  ```\n";
  assertEquals(format(indented), expected);
});

Deno.test("an unterminated html fence is closed by the plugin, not padded by the post-pass", () => {
  // CommonMark runs an unclosed fence to the end of the document, and the plugin
  // emits the closing marker. That is why the post-pass's "unterminated" branch
  // is defensive rather than reachable: by the time it runs, the plugin has
  // always closed the fence.
  assertEquals(
    format("# T\n\n```html\n<html>\n"),
    "# T\n\n```html\n<html>\n```\n",
  );
});

Deno.test("only the `html` tag is post-processed", () => {
  // `html5` is a different tag with no formatter registered, so the post-pass
  // must not claim it — and neither must the markdown plugin.
  const html5 = fenced("html5", HTML_BODY);
  assertEquals(format(html5), html5);
});

// ---------------------------------------------------------------------------
// No subprocess
// ---------------------------------------------------------------------------

Deno.test(
  "fmt needs no `run` permission, because nothing spawns a formatter",
  { permissions: { run: true, read: true, write: true, env: true } },
  () => {
    // The subprocess this replaced needed `--allow-run` on every `wiki fmt`
    // invocation, and could not work at all under `deno compile`. Both facts are
    // gone only while nothing spawns anything, so the CLI is run here with every
    // permission *except* `run`.
    const root = Path.of(Deno.makeTempDirSync({ prefix: "wiki-fmt-perm-" }));
    try {
      Deno.writeTextFileSync(
        root.joinpath("wiki.yml").toString(),
        "wiki:\n  input: [wiki]\n",
      );
      const page = root.joinpath("wiki", "Page.md");
      Deno.mkdirSync(page.parent.toString(), { recursive: true });
      Deno.writeTextFileSync(
        page.toString(),
        "---\ntype: schema:WebPage\nname: Test\n---\n\n# Test\n\nSome text  \nwith a hard break.\n",
      );

      const child = new Deno.Command(Deno.execPath(), {
        args: [
          "run",
          "--quiet",
          "--allow-read",
          "--allow-write",
          "--allow-env",
          CLI_ENTRY,
          "-c",
          root.joinpath("wiki.yml").toString(),
          "fmt",
        ],
        stdout: "piped",
        stderr: "piped",
      }).outputSync();
      assertEquals(
        child.code,
        0,
        DECODER.decode(child.stderr) ||
          "the CLI failed without `--allow-run`: the formatter is a subprocess again",
      );
      assertEquals(
        Deno.readTextFileSync(page.toString()),
        "---\ntype: schema:WebPage\nname: Test\n---\n\n# Test\n\nSome text\\\nwith a hard break.\n",
      );
      assert(
        !DECODER.decode(child.stdout).includes("permission"),
        DECODER.decode(child.stdout),
      );
    } finally {
      try {
        Deno.removeSync(root.toString(), { recursive: true });
      } catch {
        // Windows keeps a handle open long enough to lose this race.
      }
    }
  },
);
