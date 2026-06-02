---
id: wiki:AuthoringGuide
type: TechArticle
name: Authoring guide
description: How to write vault pages, shapes, and dynamic SPARQL blocks.
---

# Authoring guide

## File layout

- Put pages under directories listed in `inputDirs` (usually `wiki/`).
- **Prefer Wikipedia-style filenames** — preserved capitalization and underscores, for example `Gregory_House.md`, `LLM_Wiki_CLI.md`, and `JSON_LD.md`. Do not use lowercase kebab-case such as `gregory-house.md` unless your project explicitly chooses that convention in `filenamePattern`.
- Avoid spaces and other unsafe route characters in page paths.
- Use `index.md` only for folder index routes (for example `wiki/games/index.md` → `/wiki/games/`).

Configure `filenamePattern` in [[Wiki_Configuration]] to match your vault’s naming convention. This documentation vault uses `[A-Za-z0-9_()-]+` (Wikipedia-style).

## Frontmatter

Documents start with YAML or JSON between `---` delimiters. Nested keys become RDF blank nodes; CURIEs expand using `context` in [[Wiki_Configuration]].

Example person page:

```yaml
---
id: wiki:alice-smith
type: schema:Person
name: Alice Smith
givenName: Alice
familyName: Smith
---
```

Data-only records may use `.yaml`, `.yml`, or `.json` without a markdown body.

## SHACL shapes

Define constraints in frontmatter with `type: sh:NodeShape` (see `wiki init`’s `Person_Shape.md` or [[Software_Shape]] in this vault). Shapes in the vault are loaded into the validation graph; [[CLI_check]] runs PySHACL against every document. Background: [[SHACL]].

Shapes can also be documented as Turtle in the page body (see [[Person_Shape]]), but executable validation uses frontmatter shapes.

## Wikilinks and markdown links

With `markdownFlavor: obsidian`, link to other vault pages using Obsidian wikilink syntax (double brackets around the page stem, optional display text after a pipe).

Standard markdown links to another page file also resolve when the target exists.

Broken links are reported by [[CLI_check]] according to `check.internalLinks`.

## Inline SPARQL blocks

Wrap queries so [[CLI_render]] can refresh result tables (see [[SPARQL]] for query syntax):

````markdown
<!-- sparql:start -->
```sparql
SELECT ?name WHERE { ?s schema:name ?name }
```

| Name |
| --- |
| Authoring guide |
| wiki build |
| wiki check |
| wiki export |
| wiki init |
| wiki query |
| wiki render |
| wiki serve |
| wiki upgrade |
| wiki view |
| CSS |
| CSV |
| Deploying to GitHub Pages |
| Design philosophies |
| Farzapedia and personal AI wikis |
| Getting started |
| Global options |
| Graph cache |
| Hello World |
| HTML |
| LLM Wiki CLI documentation |
| JavaScript |
| JSON |
| JSON-LD |
| Andrej Karpathy |
| LLM Wiki |
| LLM Wiki CLI |
| LLM Wiki CLI |
| Microdata |
| Microdata in LLM Wiki |
| Content negotiation |
| Notation3 |
| Obsidian integration |
| Project Ontology |
| OWL |
| Person Shape |
| Personal Knowledge |
| RDF |
| Semantic Web |
| SHACL |
| SoftwareApplication Shape |
| SPARQL |
| TechArticle Shape |
| Turtle |
| TypeScript |
| Wiki configuration |
<!-- sparql:end -->
````

Use `wiki render --check` in CI to fail when blocks are stale. See [[CLI_render]] and [[Graph_Cache]].

## HTML microdata

The parser reads `itemscope` / `itemtype` / `itemprop` in markdown bodies and adds triples to the graph. CURIEs in attributes use the same `context` prefixes as frontmatter.

## Page templates (HTML)

For [[CLI_build]] and [[CLI_serve]], set `wiki:template` or `template` (for example `person`) to pick a typed layout with an infobox. Internal values like `wiki:Other_Page` link when that page exists.

## Related

- [[SHACL]] — shapes language background
- [[SPARQL]] — query language background
- [[CLI_export]] — dump frontmatter as RDF
