---
type: TechArticle
headline: Product positioning
description: Wiki CLI as the semantic knowledge toolchain beneath existing authoring surfaces.
---

# Product positioning

Wiki CLI (`wiki`) is the **semantic knowledge toolchain** for Markdown vaults: validate, infer, query, and publish. It sits **beneath** note apps and LLM-assisted workflows — progressive enhancement, not a migration.

## What wiki is

- The **compiler / validator / query engine** for Markdown knowledge bases with semantic frontmatter
- An **OOTB wiki builder** — links, navigation, SHACL checks, SPARQL, and static HTML from a folder of `.md` files
- A **sidecar memory layer** — ingest or watch an existing vault without owning the editor
- **Interop-first** — works alongside [Obsidian](Obsidian_Integration.md), [LLM Wiki](LLM_Wiki.md) setups, and any Markdown editor

Adoption path: `wiki init` → `wiki check` → `wiki serve`, then add `lint`, `query`, `render`, and `build` as the vault matures.

## What wiki is not

- The **primary editor** or daily note-taking surface
- A **replacement** for Obsidian, Logseq, or another vault UI
- A **note app clone**, CMS, or authenticated multi-user web product
- An **auth layer** — local-first CLI and static publish; see deferred scope in ecosystem templates below

Humans and agents keep writing where they already write. `wiki` makes that content **trustworthy** (SHACL + conventions), **searchable** (SPARQL + OWL-RL), and **publishable** (static HTML, JSON-LD, Turtle, optional read-only SPARQL over `wiki serve`).

## Toolchain vs authoring surface

| Layer                   | Role                                                                    | Examples                                                    |
| ----------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------- |
| Authoring surface       | Create and edit Markdown                                                | Obsidian, agent-driven LLM wiki, VS Code, any editor        |
| Wiki CLI semantic layer | Compile vault → RDF graph; check, lint, fmt; query; render; build/serve | `wiki check`, `wiki query`, `wiki build`                    |
| Outputs                 | Deployable artifacts                                                    | GitHub Pages HTML, export files, `/api/sparql` when enabled |

This separation is intentional: the strongest differentiator is the **machine layer** (SHACL, OWL-RL, SPARQL, typed HTML) that most note apps do not provide. Wiki CLI avoids competing with editor-centric tools while making incremental adoption obvious.

## Interop-first workflows

### Obsidian

Run `wiki` against the folder that contains `wiki.yaml`. Use Shell Commands for on-save `wiki check`, hotkey `wiki render`, or `wiki serve --watch` for preview. Details: [Obsidian integration](Obsidian_Integration.md).

### LLM wikis

Treat the vault as a compounding codebase agents maintain over time. Structured frontmatter and link conventions make SPARQL and SHACL meaningful on agent output. Pattern overview: [LLM Wiki](LLM_Wiki.md).

### Plain Markdown

No Obsidian or agent stack required. `wiki init` scaffolds a vault; conventions are documented in [Style_Guide](Style_Guide.md).

## Three beats of the CLI

| Beat         | Commands                    | Value                                            |
| ------------ | --------------------------- | ------------------------------------------------ |
| Trust        | `check`, `lint`, `fmt`      | Integrity contracts and authoring conventions    |
| Intelligence | `query`, `render`, `export` | SPARQL, inline result blocks, RDF serializations |
| Publish      | `build`, `serve`, `link`    | Static site, local preview, wikilink hygiene     |

Design rationale for silence, pipes, and flat subcommands: [Design philosophies](Design_Philosophies.md).

## Ecosystem templates

| Template                                                                                                                                                                                                      | Purpose                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| [wiki-example](https://github.com/wazootech/wiki-example)                                                                                                                                                     | Starter vault                                                                    |
| [wiki-sparql-sandbox](https://github.com/wazootech/wiki-sparql-sandbox)                                                                                                                                       | YASGUI + sample vault or live endpoint — see [SPARQL Sandbox](SPARQL_Sandbox.md) |
| [#15](https://github.com/wazootech/wiki/issues/15) Next.js viewer, [#16](https://github.com/wazootech/wiki/issues/16) Obsidian + Quartz, [#31](https://github.com/wazootech/wiki/issues/31) Mintlify/Holocron | Planned — separate template initiatives, not core CLI scope                      |

## Related

- [Wiki_CLI](Wiki_CLI.md) — command reference and quickstart
- [Design_Philosophies](Design_Philosophies.md) — Unix-style CLI design
- [Obsidian_Integration](Obsidian_Integration.md)
- [LLM_Wiki](LLM_Wiki.md)
- [Getting_Started](Getting_Started.md)
