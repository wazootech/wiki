# dprint-in-Deno probe — running the markdown plugin in-process

`src/wiki/fmt_util.ts` shells out to `deno fmt` over stdin. That route works
under `deno run`, and cannot work under `deno compile`: inside a standalone
binary `Deno.execPath()` is *the binary*, not a Deno interpreter, and `denort` —
the runtime `deno compile` embeds — is built without the tooling subcommands, so
`deno fmt` is not linked into it at all. The current `formatterExecutable()` papers over this with
`Deno.build.standalone ? "deno" : Deno.execPath()`, which means a compiled
`wiki fmt` needs a `deno` on `PATH` — exactly the audience the ADR says compiled
binaries are for.

This probe asks whether the formatter can instead be **the same dprint plugin,
as WASM, called in-process through `@dprint/formatter`**, and whether that
reproduces the subprocess byte for byte.

## Running it

```sh
cd probes/fmt-dprint

deno run -A probe.ts --bare                 # baseline: no host formatter
deno run -A probe.ts --context --hosts all  # context API, extension routing
deno run -A probe.ts                        # hand-written deno dispatch
deno run -A probe.ts --post-pass            # + html fence post-pass
deno run -A fences.ts [--no-post-pass]      # one document per fence tag
deno run -A wrap-probe.ts                   # the three wrap modes
deno run -A goldens.ts                      # tests/fmt_test.ts's goldens, replayed
deno run -A host-config.ts                  # resolved config per host plugin
```

`probe.ts` writes `probe-out-<route>.txt` and `results-<route>.json`; the
recorded runs are committed next to it. The corpora are read from the worktree
root: the four micro pages (`parity/corpus/micro/wiki/`), the nine pages
`fmt-check-docs` names as divergent, all 87 `docs/wiki/` pages, and the two
`probes/fmt-shielding/` inputs.

## Headline

**Yes, byte for byte — on everything the plugin can reach.** With the host
plugins registered and deno's dispatch reproduced, in-process dprint is
byte-identical to `deno fmt` on **87/87** docs pages, **4/4** micro pages, and
**2/2** shielding inputs. The nine divergent pages — the ones `fmt-check-docs`
records as a `known` divergence from mdformat — come out identical to what the
subprocess produces today, so the swap does not move any parity line.

| route | micro | docs-nine | shielding | docs-all |
| --- | --- | --- | --- | --- |
| `--bare` (markdown only, no hosts) | 4/4 | 6/9 | 1/2 | 84/87 |
| `--context --hosts all` (yaml, json, ts, css) | 4/4 | 8/9 | 2/2 | 86/87 |
| `--context --hosts everything` (+ lax-markup) | 4/4 | 8/9 | 2/2 | **85/87** |
| hand-written dispatch | 4/4 | 8/9 | 2/2 | 86/87 |
| hand-written dispatch + html post-pass | **4/4** | **9/9** | **2/2** | **87/87** |

Every difference in every row is an inner code fence. Nothing else moved: not
tables, emphasis, hard breaks, list markers, frontmatter, wikilinks,
`%wiki.*%` tokens, GFM alignment, reference links, `<!-- sparql:start -->`
blocks, or thematic breaks.

## Version correspondence

This is what makes the result meaningful rather than coincidental. Deno's
`Cargo.toml` at `v2.9.6` pins each plugin, and the published package of the same
name carries the same number — for every plugin checked:

| deno 2.9.6 pin | package | version |
| --- | --- | --- |
| `dprint-plugin-markdown = "=0.20.0"` | `@dprint/markdown` | 0.20.0 |
| `dprint-plugin-json = "=0.21.3"` | `@dprint/json` | 0.21.3 |
| `dprint-plugin-typescript = "=0.96.1"` | `@dprint/typescript` | 0.96.1 |
| `pretty_yaml = "=0.5.0"` | `dprint-plugin-yaml` | 0.5.0 |
| `lax-css = "=0.3.0"` | `lax-css` | 0.3.0 |
| `lax-markup = "=0.3.2"` | `lax-markup` | 0.3.2 |
| `lax-sql = "=0.3.0"` | `lax-sql` | 0.3.0 |
| `dprint-core = "=0.67.4"` | `@dprint/formatter` (JS host) | 0.5.1 |
| `dprint-plugin-jupyter = "=0.2.2"` | `@dprint/jupyter` | 0.2.2 |

The markdown plugin is also self-describing: `getPluginInfo()` reports
`{"name":"dprint-plugin-markdown","version":"0.20.0"}`, the same version deno
pinned, so the pin can be *asserted at run time* rather than hoped for.

`@dprint/markdown` is the *only* version that matters for byte-identity, because
it is the plugin that decides everything except inner fence bodies. `0.24.0` is
current; `0.20.0` is the one deno 2.9.6 bundles, and upgrading deno means
re-pinning. That is a coupling the subprocess hides and the in-process route
makes explicit and testable — the opposite of the usual "pinning is worse"
trade.

## The host formatter is most of the work

`deno fmt` does not run the markdown plugin alone. Fenced code blocks in
`ts`/`tsx`/`js`/`jsx`/`cjs`/`cts`/`mjs`/`mts`, `json`/`jsonc`, `css`/`scss`/`less`,
`html`, `yml`/`yaml` and (behind unstable flags) `sql` are handed to other
formatters. Measured on the corpus, that is the whole gap: `--bare` differs on
`Wiki_Configuration.md` (yaml + html), `wiki_mcp.md` (json),
`Wiki_Page_Layouts.md` (yaml) and `input-tables.md` (yaml).

Getting that right takes three separate things.

### 1. The `deno()` presets, transcribed

Deno builds each host's config with a `deno()` method on the Rust builder. The JS
packages have no such method, so the presets are transcribed key by key in
`host-configs.ts`. They are not the plugin defaults:

- **json** — plugin defaults are `trailingCommas: "jsonc"`,
  `commentLine.forceSpaceAfterSlashes: true`, `ignoreNodeCommentText:
  "dprint-ignore"`; deno wants `"never"`, `false`, `"deno-fmt-ignore"`.
- **typescript** — defaults are `quoteStyle: "alwaysDouble"`, brace position
  `sameLineUnlessHanging`, sorting on; deno wants `"preferDouble"`, per-node
  `sameLine` braces, `"maintain"` sort order, `"force"` arrow parentheses, and
  thirteen more keys.
- **yaml** — everything matches the plugin defaults *except*
  `ignore_comment_directive`, which deno sets to `deno-fmt-ignore` where the
  plugin defaults to `pretty-yaml-ignore`. Verified by printing the resolved
  config (`host-config.ts`), not by reading the defaults.

Two widths are also in play, and deno uses different ones per language: `json`
and `typescript` get the width the markdown plugin computed for the block, which
the wasm shim forwards as `overrideConfig.lineWidth`; `yaml`, `css` and `html`
ignore it and use the file-level width. Both are reproduced.

### 2. The `deno()` preset on the markdown plugin itself

`builder.deno()` sets `text_wrap(Always)` plus the four ignore directives
renamed to `deno-fmt-*`. The port always passes `--prose-wrap`, so the text wrap
is overridden, but the directives are not: without them,
`<!-- dprint-ignore-start -->` would suppress formatting where
`<!-- deno-fmt-ignore-start -->` should. `denoProseNeverConfig()` sets all four.

### 3. Tag routing cannot be left to the context API

`@dprint/formatter`'s `createContext()` routes host requests by **file
extension** over whatever is registered, which is not what deno does. Two facts
make the difference:

- **deno calls the plugin *library*, the JS host calls the wasm build.** Deno's
  `format_markdown` calls `dprint_plugin_markdown::format_text` with its own
  closure, so *deno* chooses which tags reach a formatter.
- **the wasm build filters tags first.** `tag_to_extension` in `wasm_plugin.rs`
  (0.20.0) maps a tag to a fake `file.<ext>` and returns `None` for anything
  absent — that callback is never reached. It contains `xml`, `toml`, `py`, `rs`,
  `cs`, `vb`, `graphql` and `dockerfile`, which deno has no arm for, but
  **not `html`**, and not `cjs`, `cts`, `mjs`, `mts`, `sql`, `svg`, `vto` or
  `njk`. (Deno has arms for `html`, `cjs`/`cts`/`mjs`/`mts` and `sql`, so those
  arms are unreachable from the wasm side.)

So the two tables disagree in both directions, and each direction has a real
consequence:

- **`html` is unreachable.** Deno formats ` ```html ` fences with lax-markup; the
  in-process route can *never* be asked about them, whatever is registered.
  Confirmed by logging: a document with `html`, `sql`, `css` and `xml` fences
  produces host requests for `file.css` and `file.xml` and none for `file.html`.
- **Registering lax-markup makes things worse, not better.** lax-css and
  lax-markup claim `xml`, `svg`, `vue`, `svelte`, `astro`… so a context built by
  extension starts formatting fences deno deliberately leaves alone. Measured:
  adding lax-markup to the context drops docs-all from **86/87 to 85/87** by
  reformatting a ` ```xml ` fence in `RDF_XML.md`, *and still* does not fix html.

`route.ts` therefore writes the dispatch by hand: it reproduces deno's tag
table, and its `default` arm returns the text unchanged so the wasm gate's extra
reachability cannot leak. `fences.ts` tests that per tag.

### The html post-pass

With the dispatcher correct, `Wiki_Configuration.md` is the only remaining file,
and only its ` ```html ` fence. `formatHtmlFences()` collects those fence bodies
and runs them through lax-markup after the fact — the same formatter, the same
width, at the layer deno would have called it. That closes the corpus to 87/87.

The post-pass is a **measurement, not a recommendation**: it reimplements a
fence-level rule outside the plugin, so it would need to handle nested fences,
indentation and fence-marker length to be safe, and its exposure is small (four
` ```html ` fences across both wiki trees, two per tree, all in one file). The
honest alternatives are to accept a documented divergence on html fences, or to
upstream the `html` tag.

## Fence tag matrix

`fences.ts` formats one document per tag, with a body that is genuinely
unformatted, and compares to the subprocess:

| | tags |
| --- | --- |
| identical, no post-pass (35/40) | `ts tsx js jsx javascript typescript json jsonc css scss less xml svg svelte vue astro vto njk yml yaml sql toml python py rs rust cs vb graphql dockerfile markdown bash sparql txt empty` |
| identical, post-pass (36/40) | the above, plus `html` |
| never identical (4/40) | `cjs cts mjs mts` |

The four holdouts are exactly the tags deno's `matches!` list accepts and the
wasm table lacks. They are TypeScript/JavaScript aliases, so a wiki that writes
` ```mjs ` gets TypeScript formatting from `deno fmt` today and none from the
in-process route. Closing them means a post-pass with the same shape as the html
one, over the same fake-extension trick.

## Fences that are *not* delegated still agree

` ```bash ` (94 across both trees), ` ```python `, ` ```powershell `,
` ```sparql ` (38), ` ```turtle `, ` ```dataview `, ` ```markdown ` and
` ```toml ` are left alone by both sides — including `toml`, which the wasm gate
*would* delegate and deno does not. That is the dispatcher's `default` arm
earning its keep, and it is why the shielding probe's "no shielding layer
needed" conclusion survives the engine swap unchanged.

Note what this means for the nine divergent pages: the substantive differences
from mdformat (`*x*` → `_x_`, `  ` hard breaks → `\`, `~~~` → ` ``` `) come from
the plugin's own defaults, visible in `getResolvedConfig()` as
`emphasisKind: "underscores"`, `strongKind: "asterisks"`,
`unorderedListKind: "dashes"`. A swap does not change any of them, so
`fmt-check-docs` stays a `known` divergence **by construction** either way.

## The other `wrap` modes

`wrap = "no"` is the only oracle-verified value and the one every shipped config
uses, so `wrap-probe.ts` covers the other two against the subprocess:

```
SAME  wrap=no   textWrap=never    lineWidth=80   diagnostics=[]
SAME  wrap=keep textWrap=maintain lineWidth=80   diagnostics=[]
SAME  wrap=40   textWrap=always   lineWidth=40   diagnostics=[]
SAME  wrap=120  textWrap=always   lineWidth=120  diagnostics=[]
```

There is a name change across the boundary worth recording: the CLI flag is
`--prose-wrap preserve`, the Rust enum is `TextWrap::Maintain`, and the JS config
value is `"maintain"`. `"preserve"` is **accepted but diagnostic'd** and falls
back to the plugin default, which happens to be `maintain` — so the wrong mapping
would look correct until the default changed. `"maintain"` is diagnostic-free.

## Goldens

`tests/fmt_test.ts` asserts against the subprocess, so it stays green either way.
`goldens.ts` replays the same inputs and expected values through the in-process
route — the exact table bytes, the wikilink pair, both SPARQL block shapes, the
BOM case, and the two-space hard break assertion. **19 assertions, 0 failing.**

## `deno compile`

The reason for all of the above. `compile-probe.ts` reads an embedded wasm,
loads it and formats a document; compiled with

```sh
deno compile --allow-read --include ./vendor/markdown.wasm -o ./dprint-probe.exe ./compile-probe.ts
```

it reports `standalone: true`, reads the wasm from the standalone's temp
directory, and produces the expected bytes. The route is `deno compile`-safe, and
`--include` handles embedding — `vendor/` is not committed here (2.1 MB), see the
script's header for the one-line `cp`.

Better than expected on permissions: **the embedded module needs no permissions
at all.** Compiling without `--allow-read` and running the binary still reads the
wasm and formats correctly — `--include`'d assets are not subject to the `read`
check. `vendor/` and the compiled `noperm.exe` are not committed; reproduce with
`deno compile --include ./vendor/markdown.wasm -o ./noperm.exe ./compile-probe.ts`.

Two follow-on consequences, the second not measured here:

- **No `--allow-run`.** A subprocess formatter needed the `run` permission on
  every `wiki fmt`, whether checking or writing: both go
  `Wiki.format` → `DocumentBatch.format` → `formatMarkdown`. A WASM formatter
  needs none. (Four tests in `tests/fmt_test.ts` still carry
  `permissions: { run: true, ... }`, but for their own `runCli` child, not for
  the formatter — replacing `deno fmt` does not let them drop it.)
  `tests/formatter_test.ts` pins the real property by running the CLI with every
  permission *except* `run`.
- **`formatMarkdown` stops needing to be `async`.** It is `async` today only
  because a stdin pipe cannot be written synchronously. In-process it is a
  synchronous call, so `DocumentBatch.format`, `Wiki.format` and `runFormatCommand`
  could become synchronous — a smaller change than it sounds, but one that
  reaches the CLI's call chain.

## Cost

| plugin | size |
| --- | --- |
| `@dprint/markdown` 0.20.0 | 2.06 MB |
| `@dprint/typescript` 0.96.1 | 3.98 MB |
| `@dprint/json` 0.21.3 | 0.50 MB |
| `dprint-plugin-yaml` 0.5.0 | 0.56 MB |
| `lax-markup` 0.3.2 | 0.42 MB |
| `lax-css` 0.3.0 | 0.38 MB |
| `lax-sql` 0.3.0 | 0.38 MB |
| **total** | **8.28 MB** (7.90 MB without lax-sql) |

The typescript plugin is the single largest cost and exists only to format
` ```ts ` / ` ```js ` fences: two fences across both wiki trees (one `ts`, one
`js`), plus the `cjs`/`cts`/`mjs`/`mts` aliases that cannot be reached anyway.
Dropping it would save 3.98 MB at the cost of those fences, which is a real
trade for a compiled binary whose whole point is installability.

## Result, and what the cutover did with it

The direction is proven: same plugin, same version, same bytes, no subprocess,
works under `deno compile`. The cutover took all three decisions it left open:

1. **The dispatch was hand-written and moved into `src/wiki/formatter.ts`**, with
   the plugin pins, the `deno()` presets, and the html post-pass beside it. The
   context API's extension routing is a trap, not a shortcut, and nothing in the
   shipped code uses it.
2. **Three gaps, three answers.** `html` fences are closed by the post-pass;
   `cjs`/`cts`/`mjs`/`mts` fences are an accepted divergence (none in either
   tree) and are asserted as such; the `deno()` presets are transcribed and
   pinned by test.
3. **Nothing is vendored.** ~8 MB of WebAssembly arrives as npm dependencies.
   `compile-resolve-probe.ts` settled that: a compiled standalone reads the
   plugins out of its embedded `node_modules` with no `--include` and no runtime
   permissions, so committing the blobs would buy nothing.

It also deleted the two defects the subprocess introduced: the false ADR claim in
`formatterExecutable()`'s docstring, and the uncaught `NotFound` —
`command.spawn()` threw synchronously, so a compiled binary without `deno` on
`PATH` died with a raw `NotFound: No such file or directory (os error 2)` instead
of `deno fmt failed on <name>: …`. Both stopped existing with the subprocess, and
`formatMarkdown` is synchronous again, which took the `async` off
`DocumentBatch.format` and `Wiki.format` with it.

### Re-verifying after the fact

`verify-production.ts` runs the differential against the *shipped* module rather
than the copy kept in this probe:

```sh
cd probes/fmt-dprint
deno run --config ../../deno.json -A verify-production.ts
# micro: 4/4 · docs-nine: 9/9 · shielding: 2/2 · docs-all: 87/87 to deno fmt
```

That is the check to re-run if deno is ever upgraded — bump the plugin pins in
`deno.json` to the versions the new Deno bundles, update
`FORMATTER_PLUGIN_VERSIONS`, and let `tests/formatter_test.ts` and this script
say whether the bytes moved. `fences.ts`, `wrap-probe.ts`, and `goldens.ts` remain
as the tag-level, mode-level, and golden-level views of the same question.
