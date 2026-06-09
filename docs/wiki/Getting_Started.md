---
type: TechArticle
headline: Getting started
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

# GitHub Pages defaults from owner/repo
wiki init --repo wazootech/wiki

# Also initialize a Git repository explicitly
wiki init --git
```

`wiki init` writes `wiki.yaml`, `README.md`, `layouts/` wiki page layouts, and a starter `wiki/` folder (`Person_Shape.md`, `Ethan_Davidson.md`). Use `--repo owner/repo` to infer GitHub Pages URLs without a prompt, or pass `--graph-context-wiki` / `--site-base-url` explicitly. By default it does not create a Git repository; use `--git` if you want that explicitly. See [Wiki_Subcommand_init](Wiki_Subcommand_init.md) for all flags and `--force` behavior.

## Daily workflow

```bash
# Validate integrity (SHACL, routes, layout; silent on success)
wiki check

# Validate conventions (filename pattern, headings, link style)
wiki lint

# Refresh embedded SPARQL tables
wiki render

# Reuse a warm graph across repeated one-shot shells
wiki render --cache

# Preview at http://127.0.0.1:8080/wiki/ (default)
wiki serve

# Preferred long-lived preview loop while editing
wiki serve --watch

# Or build static HTML for deployment
wiki build --output-dir _site
```

Use `wiki check -v` / `wiki lint -v` to see warnings. In CI, run both with `--strict` so warnings fail the job.

## Work in this repository’s docs vault

The published site under `docs/wiki/` is built with:

```bash
wiki -c docs/wiki.yaml check --strict -v
wiki -c docs/wiki.yaml lint --strict -v
python -m wiki -c docs/wiki.yaml serve --watch
wiki -c docs/wiki.yaml render --cache
wiki -c docs/wiki.yaml build --output-dir _site --site-base-url /wiki
```

See [Deploying_to_GitHub_Pages](Deploying_to_GitHub_Pages.md) for the GitHub Actions workflow.

## Next steps

- [Wiki_CLI](Wiki_CLI.md) — command reference home
- [Wiki_Configuration](Wiki_Configuration.md) — tune `vault`, `graph`, `site`, `link`, and check severities
- [Style_Guide](Style_Guide.md) — document types, shapes, and wikilinks
- [Wiki_Subcommand_check](Wiki_Subcommand_check.md) — integrity validation and CI checks
- [Wiki_Subcommand_lint](Wiki_Subcommand_lint.md) — convention audits (broken links, filenames, headings)
- [Wiki_Subcommand_query](Wiki_Subcommand_query.md) — ad-hoc SPARQL from the terminal
- [Wiki_Subcommand_render](Wiki_Subcommand_render.md) — refresh inline SPARQL tables
- [Wiki_Subcommand_serve](Wiki_Subcommand_serve.md) — local preview and optional SPARQL endpoint
- [Wiki_Subcommand_build](Wiki_Subcommand_build.md) — static HTML for deployment
- [Graph_Cache](Graph_Cache.md) — graph reuse and `--cache`
