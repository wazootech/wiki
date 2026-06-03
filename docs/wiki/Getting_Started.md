---
type: TechArticle
name: Getting started
description: Install the wiki CLI and scaffold a new vault.
---

# Getting started

## Install

```bash
pip install wazootech-wiki
wiki --help
```

Editable install from this repository:

```bash
uv pip install -e .
```

## Scaffold a new wiki

From an empty directory:

```bash
wiki init
```

`wiki init` interactively writes `wiki.yaml` and a starter `wiki/` folder (`index.md`, `Person_Shape.md`). See [Wiki_Subcommand_init](Wiki_Subcommand_init.md) for prompts and `--force` behavior.

## Daily workflow

```bash
# Validate SHACL + hygiene (silent on success)
wiki check

# Refresh embedded SPARQL tables
wiki render

# Preview at http://127.0.0.1:8080/wiki/ (default)
wiki serve

# Or build static HTML for deployment
wiki build --output-dir _site
```

Use `wiki check -v` to see warnings, and `wiki check --strict` in CI so warnings fail the job.

## Work in this repository’s docs vault

The published site under `docs/wiki/` is built with:

```bash
wiki -c docs/wiki.yaml check --strict -v
wiki -c docs/wiki.yaml render
wiki -c docs/wiki.yaml build --output-dir _site --base-url /wiki
```

See [Deploying_to_GitHub_Pages](Deploying_to_GitHub_Pages.md) for the GitHub Actions workflow.

## Next steps

- [Wiki_Configuration](Wiki_Configuration.md) — tune `inputDirs`, `context`, and check severities
- [Style_Guide](Style_Guide.md) — document types, shapes, and wikilinks
- [Wiki_Subcommand_check](Wiki_Subcommand_check.md) — validation and CI checks
