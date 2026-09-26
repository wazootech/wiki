---
type: TechArticle
headline: Getting Started
description: Install the Deno-based wiki CLI and scaffold a new wiki.
---

# Getting Started

## Install

### From npm

```bash
npm install -g wazootech-wiki
wiki --help
```

This installs the `wiki` command and provisions its Deno runtime from the npm package. Node.js 18 or newer is required; system Python and a separately installed Deno are not.

Use `npx` without a global install:

```bash
npx wazootech-wiki --help
npx wazootech-wiki init
npx wazootech-wiki check
```

### From Deno

The `@wazoo/wiki` JSR package is configured but has not been published yet. The first tagged release will publish it after the package is created and linked to this GitHub repository in JSR settings.

Until then, use the repository source:

```bash
deno run -A src/wiki/cli.ts --help
deno task check
```

After the first JSR release, install the CLI globally with `deno install --global --allow-all --name wiki jsr:@wazoo/wiki/cli`, or import `jsr:@wazoo/wiki` from a Deno project. For npm projects, `npx jsr add @wazoo/wiki` will be available once that first release is published.

### From source

```bash
deno run -A src/wiki/cli.ts --help
deno task check
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

`wiki init` writes `wiki.yml`, `README.md`, and an empty `wiki/` folder for your markdown pages. Use `--repo owner/repo` to infer GitHub Pages URLs without a prompt, or pass `--graph-context-wiki` / `--site-base-url` explicitly; in non-interactive contexts (CI, scripts) init skips the prompt and uses the default namespace. By default it does not create a Git repository; use `--git` if you want that explicitly. Init requires a clean directory (no existing `wiki.yml`, `README.md`, or non-empty `wiki/`). See [wiki init](wiki_init.md) for all flags.

### Branding

Styling and branding (such as site name, theme color, logo, and favicon) are configured through a custom layout template and assets under `wiki.assets`; set `site.layout` in `wiki.yml`. See [Wiki Configuration — Custom CSS](Wiki_Configuration.md#custom-css) and [wiki init](wiki_init.md).

Alternatively, start from a GitHub template: [wiki-templates/generic](https://github.com/wazootech/wiki-templates/tree/main/generic) (generic wiki project) or the [LLM Wiki](LLM_Wiki.md) starter [wiki-templates/llm-wiki](https://github.com/wazootech/wiki-templates/tree/main/llm-wiki). See [Wiki CLI templates](wiki.md#ecosystem-templates).

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

Run commands from the repository root:

```bash
deno run -A src/wiki/cli.ts -c docs/wiki.yml check --strict -v
deno run -A src/wiki/cli.ts -c docs/wiki.yml lint --strict -v
deno run -A src/wiki/cli.ts -c docs/wiki.yml render --cache
deno run -A docs/build.ts --output-dir _site
```

See [Deploying to GitHub Pages](Deploying_to_GitHub_Pages.md) for the GitHub Actions workflow.

## Agent skills

Coding agents can use the consolidated **`wiki`** skill documented in [Wiki Skills](Wiki_Skills.md).

After upgrading Wiki CLI or when skills behave unexpectedly, refresh agent skills:

```bash
npx skills add wazootech/wiki@wiki -g -y
```

Do not commit `.agents/skills/` to your wiki repo unless you intentionally vendor a snapshot — stale copies miss fixes like deploy workflow templates.

## Next steps

- [wiki](wiki.md) — command reference home
- [Wiki Configuration](Wiki_Configuration.md) — tune `wiki`, `graph`, `site`, `link`, and check severities
- [Style Guide](Style_Guide.md) — document types, shapes, and wikilinks
- [Linked Markdown](Linked_Markdown.md) — the wazootech/linked-markdown protocol specification
- [wiki check](wiki_check.md) — integrity validation and CI checks
- [wiki lint](wiki_lint.md) — convention audits (broken links, filenames, headings)
- [wiki query](wiki_query.md) — ad-hoc SPARQL from the terminal
- [wiki render](wiki_render.md) — refresh inline SPARQL tables
- [wiki serve](wiki_serve.md) — local preview and optional SPARQL endpoint
- [wiki build](wiki_build.md) — static HTML for deployment
- [Graph Cache](Graph_Cache.md) — graph reuse and `--cache`
