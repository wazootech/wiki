---
type: TechArticle
headline: Getting started
description: Install the wiki CLI and scaffold a new wiki.
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

`wiki init` writes `wiki.yaml`, `README.md`, `layouts/`, `assets/logo.svg`, and a starter `wiki/` folder (`Person_Shape.md`, `Ethan_Davidson.md`). The scaffold enables `wiki.assets` and wires the default layout to the logo file. Use `--repo owner/repo` to infer GitHub Pages URLs without a prompt, or pass `--graph-context-wiki` / `--site-base-url` explicitly. By default it does not create a Git repository; use `--git` if you want that explicitly. See [Wiki Subcommand init](Wiki_Subcommand_init.md) for all flags and `--force` behavior.

Alternatively, start from a GitHub template: [wiki-template](https://github.com/wazootech/wiki-template) (generic workspace) or the [LLM Wiki](LLM_Wiki.md) starter [llm-wiki-template](https://github.com/wazootech/llm-wiki-template). See [Wiki CLI templates](Wiki_CLI.md#ecosystem-templates).

## Daily workflow

```bash
# Validate integrity (SHACL, JSON Schema, routes, layout; silent on success)
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

## Work in this repository’s docs wiki

The published site under `docs/wiki/` is built with:

```bash
wiki -c docs/wiki.yaml check --strict -v
wiki -c docs/wiki.yaml lint --strict -v
python -m wiki -c docs/wiki.yaml serve --watch
wiki -c docs/wiki.yaml render --cache
wiki -c docs/wiki.yaml build --output-dir _site --site-base-url /wiki
```

See [Deploying to GitHub Pages](Deploying_to_GitHub_Pages.md) for the GitHub Actions workflow.

## Agent skills

Coding agents can use repository skills documented in [Wiki Skills](Wiki_Skills.md): [Wiki Skill install](Wiki_Skill_install.md), [Wiki Skill create](Wiki_Skill_create.md), [Wiki Skill improve](Wiki_Skill_improve.md), and [Wiki Skill deploy](Wiki_Skill_deploy.md).

After upgrading Wiki CLI or when skills behave unexpectedly, refresh agent skills:

```bash
npx skills add wazootech/wiki --skill '*' -g -y
```

Do not commit `.agents/skills/` to your wiki repo unless you intentionally vendor a snapshot — stale copies miss fixes like deploy workflow templates.

## Next steps

- [Wiki CLI](Wiki_CLI.md) — command reference home
- [Wiki Configuration](Wiki_Configuration.md) — tune `wiki`, `graph`, `site`, `link`, and check severities
- [Style Guide](Style_Guide.md) — document types, shapes, and wikilinks
- [Wiki Subcommand check](Wiki_Subcommand_check.md) — integrity validation and CI checks
- [Wiki Subcommand lint](Wiki_Subcommand_lint.md) — convention audits (broken links, filenames, headings)
- [Wiki Subcommand query](Wiki_Subcommand_query.md) — ad-hoc SPARQL from the terminal
- [Wiki Subcommand render](Wiki_Subcommand_render.md) — refresh inline SPARQL tables
- [Wiki Subcommand serve](Wiki_Subcommand_serve.md) — local preview and optional SPARQL endpoint
- [Wiki Subcommand build](Wiki_Subcommand_build.md) — static HTML for deployment
- [Graph Cache](Graph_Cache.md) — graph reuse and `--cache`
