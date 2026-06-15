---
type: schema:SoftwareApplication
name: Loam
description: Zero-dependency Python CLI — folder-as-type typed knowledge layer for Markdown; derives metadata from path, git, and H1.
---

# Loam

[Loam](https://github.com/Jeff-Kazzee/loam) is a typed-knowledge layer for any folder of Markdown, by [Jeff Kazzee](Jeff_Kazzee.md). The filesystem *is* the schema: a document's type is the folder it lives in, and frontmatter holds only what cannot be derived from path, git history, or the first `# H1`.

Loam is the successor to frontmatter-everywhere typecheckers such as [Braincheck](Braincheck.md). A clean note can have **zero frontmatter** and still be fully typed and valid.

```bash
python loam.py init my-vault
python loam.py check --root my-vault
python loam.py signal --root my-vault
python loam.py fix --dry-run
```

MIT · Python 3.11+ (stdlib `tomllib`) · zero third-party dependencies.

## Core idea

```
people/jeff.md           →  type = person   (the folder says so)
projects/loam/README.md  →  type = project
meetings/2026-06-12.md   →  type = meeting
```

No `type:` field. No hand-written dates. The path carries the type; git and the filesystem carry dates; the H1 carries the title. **Frontmatter is the exception, not the rule.**

Configuration resolves by **walking up the tree** — like `git`, `tsconfig`, or `pyproject.toml`. Drop one `loam.toml` at a repo root and that tree gains enforceable document types with CI-checkable rules. Composable **packs** and subtree **overlays** (tighten-only) extend the base schema without redefining it.

## Commands

| Command       | Purpose                                                      |
| ------------- | ------------------------------------------------------------ |
| `loam check`  | Validate frontmatter and types (exit `0` clean / `1` errors) |
| `loam signal` | Print only irreducible metadata per document                 |
| `loam types`  | Resolved type registry                                       |
| `loam stats`  | Document counts and health summary                           |
| `loam fix`    | Strip redundant frontmatter (`--dry-run` to preview)         |
| `loam init`   | Scaffold `loam.toml` (optional `--packs`)                    |

## Design tenets

- **Signal over noise.** If a value can be derived, never make a human write it.
- **Location is type.** The directory tree is the type hierarchy.
- **Tighten, never loosen.** Overlays and packs may add constraints, not remove them.
- **Zero-dependency, CI-clean.** Single-file engine with honest exit codes.

## Successor: tropo in Vivary

**tropo** in [Vivary](Vivary.md) ports and extends loam: typed graph emission (`graph`), blast radius (`blast`), HTML visualization (`view`), change planning (`plan`), and PyPI packaging as `vivary-tropo`. Loam remains the standalone repo for folder-as-type validation without the full Vivary agent-workspace stack (strato, ozone, exo).

Lineage: [Braincheck](Braincheck.md) → **loam** → tropo ([Vivary](Vivary.md)).

## Loam vs Braincheck vs Wiki CLI

| Dimension       | [Braincheck](Braincheck.md)              | Loam                               | [Wiki CLI](Wiki_CLI.md)                |
| --------------- | ---------------------------------------- | ---------------------------------- | -------------------------------------- |
| Schema model    | `schema.yaml`; explicit `type:` per file | Folder-as-type + `loam.toml` packs | SHACL, JSON Schema, `wiki.yaml`        |
| Metadata        | Hand-declared frontmatter                | Derived from path, git, H1         | YAML-LD frontmatter + shapes           |
| Graph / query   | None                                     | Typed refs as edges (in tropo)     | RDF compile + [SPARQL](SPARQL.md)      |
| Agent workspace | No                                       | No (validation layer only)         | Optional [Wiki Skills](Wiki_Skills.md) |
| Publishing      | None                                     | None                               | Static HTML, RDF export                |

Reach for loam when you outgrow frontmatter-everywhere checks but do not yet need a full agent OS or RDF wiki toolchain.

## Related

- [Braincheck](Braincheck.md) — frontmatter-only predecessor
- [Vivary](Vivary.md) — tropo + strato + ozone + exo agent workspace
- [Jeff Kazzee](Jeff_Kazzee.md) — author and tool lineage
- [Personal Knowledge](Personal_Knowledge.md) — domain context for typed vaults
- [Software Application Shape](Software_Application_Shape.md) — SHACL shape for this page
