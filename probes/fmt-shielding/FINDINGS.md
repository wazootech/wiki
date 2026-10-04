# Probe: does `deno fmt` survive the wiki's markdown contract?

**Question.** [ADR 0001](../../docs/adr/0001-deno-rewrite.md) locks `deno fmt` as
the replacement for `mdformat`, and names three things that must not be mangled:
SPARQL blocks, frontmatter, and tables. The plan's fallback was a "shielding
layer" that would hide those regions from the formatter. Does one turn out to be
necessary?

**Answer.** No shielding layer is needed, and the blast radius of the switch is
much smaller than the plan assumed — provided the formatter runs with
`--prose-wrap never`.

## Method

Two synthetic inputs, each formatted in a scratch copy with

```
deno fmt --prose-wrap never <file>
```

- [`input.md`](input.md) → [`output.md`](output.md) — frontmatter, prose,
  emphasis, hard break, links, wikilink, `%wiki.*%` token, table, SPARQL block,
  `~~~` fence.
- [`input-tables.md`](input-tables.md) → [`output-tables.md`](output-tables.md) —
  a ragged table, a table carrying wikilinks and tokens, a four-backtick fence
  wrapping a `yaml` fence, a four-backtick fence wrapping a SPARQL block, lists,
  reference links, autolinks.

Then the same command over the whole 87-page docs wiki, with and without
`--prose-wrap`.

## Result 1: the prose-wrap option is load-bearing

| `deno fmt` invocation over `docs/wiki/` | Files rewritten |
|---|---|
| default (`prose-wrap=always`, wrap at 80) | **70 of 87** |
| `--prose-wrap never` | **9 of 87** |

`docs/wiki.yml` sets `fmt.wrap: "no"`, and `mdformat` honours it by leaving each
paragraph on one line. Deno's default wraps at 80 columns, which is why the plan
expected a wholesale docs reformat. `--prose-wrap never` means "do not wrap"
in the same sense — it joins lazily-continued lines rather than breaking long
ones — and reproduces mdformat's behaviour closely enough that only nine pages
differ.

**This makes the one-time reformat a bounded, enumerable task of nine files
instead of seventy, and it must be passed explicitly**, because a bare `deno fmt`
would reformat the entire corpus.

## Result 2: the three shielding concerns are already safe

| Region | Survives verbatim? | Evidence |
|---|---|---|
| YAML frontmatter | **Yes** | `output.md` — unknown keys and a `%probe.frontmatter_token%` key are untouched |
| `<!-- sparql:start` / `end -->` block | **Yes** | `output.md` — including a deliberately odd `} ORDER BY ?name` line |
| `[[Wikilink]]` and `%wiki.base_url%` token | **Yes** | `output.md`, and inside table cells in `output-tables.md` |
| GFM column alignment (`:---:`, `---:`) | **Yes** | `output-tables.md` — alignment markers kept, only padding normalised |
| Reference link definitions, autolinks | **Yes** | `output-tables.md` |

Tables *are* rewritten — a ragged table comes back padded and aligned
(`| Key             | Type   | Default |`) — but that is what `mdformat` does too, and the alignment row is
preserved, so a table stays semantically identical and only its bytes move.

The one nested case worth knowing: deno fmt **recursively formats inner fences
whose language it recognises**. `yaml` inside a four-backtick fence has its
column padding collapsed (`wiki:  # optional block` → `wiki: # optional block`),
while `sparql` is left alone because the formatter has no parser for it.

## Result 3: what actually differs in the nine docs pages

Driving the nine-file diff down to root causes, every remaining change is
semantically neutral markdown and body-text only:

| Change | Example |
|---|---|
| Emphasis marker style | `*emphasis*` → `_emphasis_` |
| Hard-break syntax | trailing two spaces → trailing `\` |
| Fence style | `~~~` → ` ``` ` |
| List marker spacing and lazy continuation | `-   item` → `- item`; a continuation line joined |
| Inner known-language fence padding | `yaml` block column alignment collapsed |
| Thematic break | mdformat's `______…______` → `---` |

None of these touch frontmatter, and none change what any RDF triple means. They
do change `schema:articleBody` literals, because the body is stored as-is.

## Consequences

1. **The formatter must be invoked with `--prose-wrap never`.** Without it the
   cutover rewrites 70 pages instead of 9. This is the single most important
   finding here, and it is a per-invocation flag the port controls, not a
   corpus-wide setting a user can forget.
2. **No shielding layer.** The plan's mitigation is unnecessary for all three
   named regions; the formatter leaves them alone by construction. The
   formatter milestone therefore has one job — wrapping `Deno.Command` — not two.
3. **Phase 11 has a concrete work list: nine files.** CI runs
   `wiki fmt --check` over `docs/wiki.yml`, so after the cutover those nine pages
   must be reformatted once and committed, or the docs-wiki formatting gate fails.
4. **Emphasis style is not configurable.** Deno exposes `--prose-wrap`,
   `--line-width`, `--indent-width`, `--single-quote`, `--use-tabs`, and
   `--no-semicolons`, and nothing for emphasis. `*x*` → `_x_` is unavoidable, and
   is why `fmt-check-docs` in `parity/cases.ts` can never reach byte parity with
   `mdformat` — it is a `known` divergence by construction, not a bug to chase.
