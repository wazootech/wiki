---
type: TechArticle
headline: Style Guide
description: Canonical rules for wiki filenames, links, prose, frontmatter, shapes, and SPARQL blocks.
---

# Style Guide

This is the **canonical style guide** for authoring pages in an [LLM Wiki](LLM_Wiki.md) wiki. [wiki check](wiki_check.md) and [wiki lint](wiki_lint.md) enforce the machine-checkable rules; prose conventions below are documented for contributors and agents alike.

In **this repository**, [AGENTS.md](https://github.com/wazootech/wiki/blob/main/AGENTS.md) is a thin companion: it maps rules to `check:*` / `lint:*` auditors, lists architecture notes for the CLI codebase, and shows CI commands. Do not duplicate wiki-authoring prose here—link here instead.

## File layout

- Put pages under directories listed in `wiki.input` (usually `wiki/`).
- **Prefer Wikipedia-style filenames** — preserved capitalization and underscores, for example `Gregory_Davidson.md`, `LLM_Wiki.md`, and `JSON_LD.md`. Do not use lowercase kebab-case such as `gregory-house.md` unless your project explicitly chooses that convention in `wiki.filename_pattern`.
- Avoid spaces and other unsafe route characters in page paths.
- Use `index.md` only for folder index routes (for example `wiki/games/index.md` → `/wiki/games/`).
- Filenames are the source of truth for page IDs — no explicit `id:` frontmatter is required unless you intentionally override routing.

Configure `wiki.filename_pattern` in [Wiki Configuration](Wiki_Configuration.md) to match your wiki's naming convention. This documentation wiki uses `[A-Za-z0-9_()-]+\.md` (Wikipedia-style, full filename match).

**Enforcer:** `lint.filename_pattern` (warning by default).

### Filename strategies

A page's filename is its default graph identity, so the naming choice is also a modeling choice. Two strategies work, and one wiki can mix them by record type.

|                | Semantic filenames                                               | Opaque filenames                                                         |
| -------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Example        | `The_Lost_Boys.md`                                               | `01JZQ4V9N1M9X6R4M6ZQ2HTR2K.md` (a [ULID](https://github.com/ulid/spec)) |
| Graph identity | Derived from the filename                                        | The explicit `@id`                                                       |
| Display label  | The filename, or `schema:name`                                   | `schema:name`                                                            |
| Rename a title | Rename the file (`wiki file mv` repoints links)                  | Edit `schema:name`; the path never moves                                 |
| Best for       | Hand-authored, durable entities: people, places, movies, devices | Generated, imported, high-volume, event-like or mutable-label records    |

Use semantic filenames where people browse, grep and link pages directly. Use opaque filenames where software creates the records: watch or listen history, observations, imports, automation runs, logs, reviews and transcripts. Choose per record type by asking who primarily creates and maintains it.

An opaque page carries its identity and label in frontmatter:

```yaml
# wiki/01JZQ4V9N1M9X6R4M6ZQ2HTR2K.md
---
'@id': wiki:WatchAction_01JZQ4V9N1M9X6R4M6ZQ2HTR2K
'@type': schema:WatchAction
schema:name: Watched The Lost Boys
schema:object:
  '@id': wiki:Movie_The_Lost_Boys
schema:startTime: 2026-07-12
---
```

The filename is a stable storage key, `@id` is the graph identity, and `schema:name` is the human-readable label. The event points at a semantic page (`wiki/The_Lost_Boys.md` with `@id: wiki:Movie_The_Lost_Boys`) by its `@id`, so the canonical entity keeps a readable name while its history records stay opaque.

Tradeoffs:

- **Gains:** paths survive title changes, there are no collision suffixes, and generated records need no naming logic.
- **Costs:** the file listing and PR diffs are harder to scan, hand-written Markdown links to an opaque page are unreadable (query the graph by name instead), and search and navigation lean on tooling.
- **Identity is yours to keep honest.** Without an `@id`, an opaque page's subject is the filename-derived IRI (`.../01JZQ4V9N1M9X6R4M6ZQ2HTR2K`), which is valid but means the ULID leaks into the graph. Nothing requires `@id` or `schema:name` by default.

Enforce the expectations with a [SHACL](SHACL.md) shape, for example `sh:minCount 1` on `schema:name` for `schema:WatchAction`; `wiki check` then fails an opaque page that has no label. Keep `wiki.filename_pattern` permissive enough for the opaque names (the pattern above already admits ULIDs).

## Prose and headings

- Use **ATX `#` headings only**; do not use underlined Setext headings (`===` / `---`). Wiki tooling indexes ATX for titles, TOC, and fragment links.
- Use **title-case H1** headings (the page title; align with `headline` frontmatter). The graph derives `schema:headline` from the first H1 when frontmatter sets none, so a `headline` that only repeats it is optional ([wiki fix](wiki_fix.md)).
- Use **sentence-case H2+** headings (capitalize only the first word and proper nouns). Only H2 and deeper are machine-checked.
- Avoid numbered headings; keep headings concise.
- Do not use horizontal rules (`---`) for thematic breaks inside page bodies (reserve `---` for YAML frontmatter delimiters only).

**Enforcers:**

- **ATX heading syntax** — `wiki fmt` / `fmt:` in `wiki.yaml` (Setext headings are converted to ATX; run `fmt --check` in CI).
- **Sentence-case H2+, no numbering** — `lint.headings` (off by default; set to `warning` or `error` in `wiki.yaml`). Use `wiki lint --strict` in CI only after enabling the rules you want enforced as errors.
- **Heading depth increments, duplicate H2+ sections** — `lint.heading_levels` and `lint.duplicate_headings` (off by default; opt in when you want structural outline checks).

## Frontmatter

Documents start with YAML or JSON between `---` delimiters. Nested keys become RDF blank nodes; CURIEs expand using `graph.context` in [Wiki Configuration](Wiki_Configuration.md). The document's RDF subject is inferred from the file path (case-preserved stem under `graph.context.wiki`, or `graph.base_iri` when set) — no explicit `id:` is needed.

Example person page:

```yaml
---
type: schema:Person
givenName: Alice
familyName: Smith
---
```

Unprefixed frontmatter keys resolve to **schema.org** by default (for example `label` → `schema:label`). Use an explicit prefix for other vocabularies (`rdfs:`, `sh:`, `owl:`, …).

You may omit `type` when `graph.implicit_types` is set in `wiki.yaml` (see [Wiki Configuration](Wiki_Configuration.md)); the CLI applies those CURIEs at graph build time. Explicit `type` in frontmatter always wins under `implicit_types_policy: fallback`.

Example TechArticle page:

```yaml
---
type: TechArticle
headline: Turtle
description: Terse RDF Triple Language syntax.
---
```

Example SoftwareApplication page:

```yaml
---
type: schema:SoftwareApplication
name: Wiki CLI
description: Command-line interface for semantic markdown wikis.
---
```

Shape documents (`type: sh:NodeShape`) use prefixed RDF metadata, for example `rdfs:label` and `rdfs:comment`.

Data-only records may use `.yaml`, `.yml`, or `.json` without a markdown body.

### Cross-wiki identity

A page's subject is derived from the root wiki's `graph.context.wiki` and the filename, even for pages that come from an installed source. Two pages with the same basename therefore share one subject (and `wiki check` reports an output collision); pages with different names are different subjects until you link them with `owl:sameAs`, which inference treats as identity. `schema:sameAs` is recorded but does not merge. An `@id` override sets the subject explicitly, at the cost of `wiki query` not rendering it as a page link. See [Cross-Wiki Identity](Cross_Wiki_Identity.md).

## SPARQL query conventions

When writing `&lt;!-- sparql:start --&gt;` blocks or ad-hoc `wiki query` commands:

- **People** — query `schema:givenName` and `schema:familyName`, not `schema:name`.
- **TechArticle** — query `schema:headline` and `schema:description`.
- **SoftwareApplication** — query `schema:name` and `schema:description`.
- **SHACL shapes** — query `rdfs:label` and `rdfs:comment` on shape documents.
- **Types** — use `rdf:type` with full URIs or configured prefixes (`schema:`, `wiki:`, `sh:`).
- **Inference** — omit `--no-inference` in sparql blocks unless you intentionally want raw asserted triples only.

Inline SPARQL blocks use `&lt;!-- sparql:start --&gt;` … `&lt;!-- sparql:end --&gt;` with a fenced `sparql` query and a GFM results table. `wiki render` runs the query and rewrites the table in place.

**Visible query (default)** — close the start comment before the fence so the query appears in built HTML: `&lt;!-- sparql:start --&gt;`, then the `sparql` fence and table, then `&lt;!-- sparql:end --&gt;`.

**Hidden query** — leave the start comment open (`&lt;!-- sparql:start` on its own line), put the `sparql` fence and query next, close the HTML comment with `--&gt;` on the line after the fence, then the results table and `&lt;!-- sparql:end --&gt;`. The query stays inside the HTML comment (invisible in built pages; still executed by `wiki render`). See the live block under [Active database summary](#active-database-summary) below.

## SHACL shapes

Define constraints in frontmatter with `type: sh:NodeShape` (see [Software Application Shape](Software_Application_Shape.md) in this wiki). Shapes in the wiki are loaded into the validation graph; [wiki check](wiki_check.md) validates every document against them. Background: [SHACL](SHACL.md).

Optionally bind a **JSON Schema** on the same shape document with `wazoo:jsonSchema` (local path under the wiki config root or remote `http(s)` URL). Type-level schemas apply to every page whose effective `type` matches `sh:targetClass`. Pages may append extra schemas with their own `wazoo:jsonSchema` key (scalar or YAML list); all bound schemas must pass.

## Internal links

Link to other wiki pages with standard Markdown links. Use the page stem (filename without `.md`, case preserved), for example `Page_Name.md` or `Display text` pointing at `Page_Name.md`.

GFM relative links to `.md` files are also accepted and resolve to the same routes.

To maintain compatibility with Wikipedia-style filenames and avoid routing ambiguities:

- **Use underscores in link targets:** When linking to files with underscores in their names, preserve the underscores in the link path (e.g., `[Opal Security](Opal_Security.md)`). Do not replace them with spaces or percent-encoding (`Opal%20Security.md`).
- **Use spaces in display text:** Always use spaces instead of underscores in the visible display text of the link (e.g., write `[Opal Security](Opal_Security.md)`, not `[Opal_Security](Opal_Security.md)` or `[Opal_Security.md](Opal_Security.md)`).
- **Avoid spaces in paths:** The parser and linters enforce that paths do not contain spaces.

Prefer canonical relative Markdown links in source; they read cleanly in prose and render consistently.

All internal links must resolve to existing documents in the wiki.

**Enforcer:** `lint.broken_links` (warning by default).

Use Markdown links for all internal and external URLs. Do not mix wikilinks (`[[Page]]`) with Markdown links in wiki prose.

Standard page links are the default (`link.style: standard` in [wiki.yaml](Wiki_Configuration.md)). `wiki link --apply` inserts `[display](Page_Name.md)` links. Set `link.style: wikilink` to insert `[[Page|display]]` instead. `wiki lint` reports Obsidian wikilinks in body prose via `lint.link_style` (warning by default).

## References (external standards)

Technology-standard [TechArticle](Tech_Article_Shape.md) pages (for example [HTML](HTML.md), [RDF](RDF.md), [SPARQL](SPARQL.md)) should cite authoritative sources in a **`## References`** section at the end of the page. Place it after any `## Related` block.

Use Markdown links for external URLs. When both exist, list the normative spec first, then MDN where MDN has a relevant overview:

```markdown
## References

- [HTML Living Standard](https://html.spec.whatwg.org/)
- [HTML — MDN Web Docs](https://developer.mozilla.org/en-US/docs/Web/HTML)
```

W3C-only topics need only the spec link. Keep `## Related` for internal wiki navigation.

## Active database summary

The table below queries the active graph to list all distinct classes currently instantiated in your wiki:

<!-- sparql:start
```sparql
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>

SELECT DISTINCT ?class WHERE {
  ?s rdf:type ?class .
  FILTER(STRSTARTS(STR(?class), "https://schema.org/"))
}
ORDER BY ?class
```
-->

| class                                  |
| -------------------------------------- |
| https://schema.org/Person              |
| https://schema.org/SoftwareApplication |
| https://schema.org/TechArticle         |

<!-- sparql:end -->

Use `wiki render --check` in CI to fail when blocks are stale. See [wiki render](wiki_render.md) and [Graph Cache](Graph_Cache.md).

## HTML [microdata](Microdata.md)

The parser reads `itemscope` / `itemtype` / `itemprop` in markdown bodies and adds triples to the graph. CURIEs in attributes use the same `context` prefixes as frontmatter.

## Page layouts (HTML)

For [wiki build](wiki_build.md) and [wiki serve](wiki_serve.md), set `wazoo:layout` to a page layout path (for example `layouts/article.html`) to override the site default for that page. Omit it to use `site.layout` from `wiki.yml` or `wiki.yaml`. See [Wiki Page Layouts](Wiki_Page_Layouts.md). Infobox values like `wiki:Other_Page` still link when that page exists.

## Related

- [Linked Markdown](Linked_Markdown.md) — protocol specification
- [SHACL](SHACL.md) — shapes language background
- [SPARQL](SPARQL.md) — query language background
- [wiki query](wiki_query.md) — ad-hoc SPARQL
- [wiki render](wiki_render.md) — inline SPARQL tables
- [wiki export](wiki_export.md) — dump frontmatter as RDF
- [Design Philosophies](Design_Philosophies.md) — CLI output conventions (not wiki prose)
