---
type: schema:SoftwareApplication
name: Braincheck
description: A zero-dependency Python CLI that type-checks YAML frontmatter across a Markdown knowledge base.
---

# Braincheck

[Braincheck](https://github.com/Jeff-Kazzee/braincheck) is a typechecker for Markdown knowledge bases. Every `.md` file is treated as a **typed document**: its YAML frontmatter must conform to a declared schema — shared **base** fields for all documents plus **per-`type`** required and optional fields — declared in a single `schema.yaml`. Think `tsc`, but for frontmatter across your whole vault.

## What it does

- **Zero dependencies** — one Python file (`braincheck.py`), Python 3.9+. Run directly or `pip install .` for a `braincheck` console script.
- **Base + per-type schema** — one `schema.yaml` defines field types (`string`, `date`, `slug`, `enum:a|b|c`, …) for every document and for each `type` (concept, person, project, …).
- **Commands** — `braincheck check` (vault, folder, or file), `braincheck stats`, `braincheck types`.
- **Safe autofix** — `--fix` scaffolds missing frontmatter and fills derivable fields (slug from filename, dates from timestamps) without overwriting existing values.
- **CI-friendly** — `--strict` (warnings as errors), `--quiet`, `--json`; exit `0` clean, `1` errors, `2` usage/schema problems.

### Finding codes

| Code | Level   | Meaning                               |
| ---- | ------- | ------------------------------------- |
| E001 | error   | Missing YAML frontmatter              |
| E002 | error   | Frontmatter is not valid YAML         |
| E101 | error   | Missing required field                |
| E103 | error   | Field has wrong type or bad format    |
| E106 | error   | Required field is present but empty   |
| W201 | warning | Unknown type (not declared in schema) |
| W202 | warning | Unknown field for this type           |

## When to use Braincheck

Reach for Braincheck when a vault only needs **frontmatter schema enforcement** — [Obsidian](Obsidian.md)-style [personal knowledge](Personal_Knowledge.md) bases, agent-maintained note trees, or any Markdown folder where typed metadata matters but you do not need RDF compilation, graph queries, or static-site publishing.

## Wiki CLI vs Braincheck

| Dimension      | Braincheck                       | [Wiki CLI](Wiki_CLI.md)                                    |
| -------------- | -------------------------------- | ---------------------------------------------------------- |
| Scope          | Frontmatter validation only      | Full semantic wiki toolchain                               |
| Dependencies   | Zero (single-file Python)        | PyPI package (`wazootech-wiki`)                            |
| Schema model   | `schema.yaml` (base + per-type)  | SHACL shapes, JSON Schema bindings, `wiki.yaml` config     |
| Graph / query  | No                               | RDF compile, [SPARQL](SPARQL.md), OWL-RL inference         |
| Other commands | `stats`, `types`, `--fix`        | `fmt`, `lint`, `link`, `render`, `build`, `serve`, `query` |
| Outputs        | Validation report (text or JSON) | Static HTML, Turtle, JSON-LD, optional SPARQL API          |

Braincheck is a **narrow, lightweight alternative** when frontmatter hygiene is the whole problem. Wiki CLI is the choice when the wiki should become a **queryable, publishable semantic layer** over the same Markdown files. The two can coexist: Braincheck for fast schema gates on a vault; Wiki CLI when you outgrow frontmatter-only checks.

## Jeff's thoughts

- <https://x.com/JeffKazzee/status/2065162937820659926?s=20>

## Related

- [Wiki CLI](Wiki_CLI.md) — semantic compiler and validator for Markdown wikis
- [Obsidian](Obsidian.md) — common authoring surface Braincheck pairs well with
- [Personal Knowledge](Personal_Knowledge.md) — domain context for typed note vaults
- [Software Application Shape](Software_Application_Shape.md) — SHACL shape for this page
