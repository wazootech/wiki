---
type: TechArticle
label: Style guide
comment: Canonical rules for vault filenames, links, prose, frontmatter, shapes, and SPARQL blocks.
---

# Style guide

This is the **canonical style guide** for authoring pages in an [[LLM_Wiki|LLM Wiki]] vault. [Wiki_Subcommand_check](Wiki_Subcommand_check.md) and [Wiki_Subcommand_lint](Wiki_Subcommand_lint.md) enforce the machine-checkable rules; prose conventions below are documented for contributors and agents alike.

In **this repository**, [AGENTS.md](https://github.com/wazootech/wiki/blob/main/AGENTS.md) is a thin companion: it maps rules to `check:*` / `lint:*` auditors, lists architecture notes for the CLI codebase, and shows CI commands. Do not duplicate vault-authoring prose here—link here instead.

## File layout

- Put pages under directories listed in `input_dirs` (usually `wiki/`).
- **Prefer Wikipedia-style filenames** — preserved capitalization and underscores, for example `Gregory_Davidson.md`, `Wiki_CLI.md`, and `JSON_LD.md`. Do not use lowercase kebab-case such as `gregory-house.md` unless your project explicitly chooses that convention in `filename_pattern`.
- Avoid spaces and other unsafe route characters in page paths.
- Use `index.md` only for folder index routes (for example `wiki/games/index.md` → `/wiki/games/`).
- Filenames are the source of truth for page IDs — no explicit `id:` frontmatter is required unless you intentionally override routing.

Configure `filename_pattern` in [Wiki_Configuration](Wiki_Configuration.md) to match your vault's naming convention. This documentation vault uses `[A-Za-z0-9_()-]+\.md` (Wikipedia-style, full filename match).

**Enforcer:** `lint.filename_pattern` (warning by default).

## Prose and headings

- Use **sentence-case headings** (capitalize only the first word and proper nouns).
- Avoid numbered headings; keep headings concise.
- Do not use horizontal rules (`---`) for thematic breaks inside page bodies (reserve `---` for YAML frontmatter delimiters only).

**Enforcer:** `lint.headings` (off by default; set to `warning` or `error` in `wiki.yaml`). Use `wiki lint --strict` in CI only after enabling the rules you want enforced as errors.

## Frontmatter

Documents start with YAML or JSON between `---` delimiters. Nested keys become RDF blank nodes; CURIEs expand using `context` in [Wiki_Configuration](Wiki_Configuration.md). The document's RDF subject is inferred from the file path (case-preserved stem relative to `wiki_base`) — no explicit `id:` is needed.

Example person page:

```yaml
---
type: schema:Person
givenName: Alice
familyName: Smith
---
```

For non-person resources (articles, software, shapes), prefer `label` and `comment` (mapped to `rdfs:label` and `rdfs:comment`) instead of `schema:name` / `schema:description`.

Data-only records may use `.yaml`, `.yml`, or `.json` without a markdown body.

## SPARQL query conventions

When writing `<!-- sparql:start -->` blocks or ad-hoc `wiki query` commands:

- **People** — query `schema:givenName` and `schema:familyName`, not `schema:name`.
- **Other resources** — query `rdfs:label` and `rdfs:comment` for human-readable titles and summaries.
- **Types** — use `rdf:type` with full URIs or configured prefixes (`schema:`, `wiki:`, `sh:`).
- **Inference** — omit `--no-inference` in vault blocks unless you intentionally want raw asserted triples only.

## SHACL shapes

Define constraints in frontmatter with `type: sh:NodeShape` (see `wiki init`'s `Person_Shape.md` or [Software_Shape](Software_Shape.md) in this vault). Shapes in the vault are loaded into the validation graph; [Wiki_Subcommand_check](Wiki_Subcommand_check.md) runs PySHACL against every document. Background: [SHACL](SHACL.md).

## Internal links

Link to other vault pages with standard Markdown links. Use the page stem (filename without `.md`, case preserved), for example `Page_Name.md` or `Display text` pointing at `Page_Name.md`.

GFM relative links to `.md` files are also accepted and resolve to the same routes.

Prefer canonical relative Markdown links in source; they read cleanly in prose and render consistently.

All internal links must resolve to existing documents in the wiki.

**Enforcer:** `check.broken_links` (warning by default).

Wikilinks (`[[Page]]`) are always supported. Use Markdown links for external URLs.

## Active database summary

The table below queries the active graph to list all distinct classes currently instantiated in your vault:

<!-- sparql:start -->

```sparql
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>

SELECT DISTINCT ?class WHERE {
  ?s rdf:type ?class .
  FILTER(STRSTARTS(STR(?class), "https://schema.org/"))
}
ORDER BY ?class
```

| Class                                  |
| -------------------------------------- |
| https://schema.org/SoftwareApplication |
| https://schema.org/TechArticle         |

<!-- sparql:end -->

Use `wiki render --check` in CI to fail when blocks are stale. See [Wiki_Subcommand_render](Wiki_Subcommand_render.md) and [Graph_Cache](Graph_Cache.md).

## HTML [[Microdata|microdata]]

The parser reads `itemscope` / `itemtype` / `itemprop` in markdown bodies and adds triples to the graph. CURIEs in attributes use the same `context` prefixes as frontmatter.

## Page layouts (HTML)

For [Wiki_Subcommand_build](Wiki_Subcommand_build.md) and [Wiki_Subcommand_serve](Wiki_Subcommand_serve.md), set `wazoo:layout` to a page layout path (for example `layouts/article.html`) to override the site default for that page. Omit it to use `page_layout` from `wiki.yaml`. See [Wiki_Page_Layouts](Wiki_Page_Layouts.md). Infobox values like `wiki:Other_Page` still link when that page exists.

## Related

- [SHACL](SHACL.md) — shapes language background
- [SPARQL](SPARQL.md) — query language background
- [Wiki_Subcommand_export](Wiki_Subcommand_export.md) — dump frontmatter as RDF
- [Design_Philosophies](Design_Philosophies.md) — CLI output conventions (not vault prose)
