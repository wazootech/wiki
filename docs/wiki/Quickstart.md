# Quickstart

This guide gets you up and running with Wiki CLI in minutes. You'll install Wiki, create a new wiki, add content, validate it, and preview it locally.

## Prerequisites

- [Deno](https://deno.com/) 2.0+ (if using the Deno CLI directly)
- [Node.js](https://nodejs.org/) 18+ (if using npm)
- [Python](https://www.python.org/) 3.10+ (if using pip)

## Installation

You can install Wiki CLI in the way that fits your workflow:

### Deno (recommended for development)

Run Wiki directly with `deno run`:

```bash
deno run -A jsr:@wazoo/wiki --help
```

Or install globally:

```bash
deno install -g -A jsr:@wazoo/wiki
wiki --help
```

### npm

Install the `wazootech-wiki` package globally:

```bash
npm install -g wazootech-wiki
wiki --help
```

The npm package bundles a Deno runtime, so you don't need Deno or Python installed separately.

### PyPI

Install the `wazootech-wiki` package from PyPI:

```bash
pip install wazootech-wiki
wiki --help
```

The PyPI distribution ships a standalone binary per platform, so no Deno is required at runtime.

## Create a new wiki

Initialize a new wiki in an empty directory:

```bash
mkdir my-wiki && cd my-wiki
wiki init
```

This creates a minimal `wiki.yml` configuration and a starter page (typically `Home.md` or `index.md` depending on your setup).

## Configure your wiki

The generated `wiki.yml` is the single source of truth for your wiki. At minimum, it defines input directories, output paths, and validation settings.

For this quickstart, a minimal config looks like:

```yaml
wiki:
  name: "My Wiki"
  input_dirs:
    - .
  output_dir: "_site"
  static_dir: "static"
```

See [Wiki Configuration](Wiki_Configuration.md) for all available options.

## Add content

Create a new page using Markdown:

```bash
cat > Getting_Started.md << 'EOF'
# Getting Started

Welcome to your new wiki!

## Next steps

- Add more pages
- Link between pages using standard [Markdown links](Another_Page.md)
- Validate your content with `wiki check`
EOF
```

Wiki follows Wikipedia-style filenames for pages (e.g., `Getting_Started.md` with underscores and preserved capitalization). Avoid spaces in filenames and reserve `index.md` only for folder index routes.

## Link between pages

Use standard Markdown links to connect pages:

```markdown
[Quickstart](Quickstart.md) [Configuration](Wiki_Configuration.md)
```

Internal links are validated by `wiki check`. See [Internal Links](Style_Guide.md#internal-links) in the Style Guide for details.

## Format, lint, and check

Before building, validate and format your content. These commands mirror CI:

```bash
# Format Markdown mechanically
wiki fmt

# Check conventions and style
wiki lint

# Validate integrity (links, schema, routes)
wiki check
```

To run them in strict mode (as CI does):

```bash
wiki lint --strict
wiki check --strict
```

If you're working in this repository (dogfooding), pass the config explicitly:

```bash
wiki -c docs/wiki.yml fmt
wiki -c docs/wiki.yml lint --strict
wiki -c docs/wiki.yml check --strict
```

## Build and preview

Build a static site from your wiki:

```bash
wiki build
```

This writes HTML to the `output_dir` defined in `wiki.yml` (default `_site`).

Preview it locally:

```bash
wiki serve
```

By default, this serves the built site at [http://localhost:8000](http://localhost:8000). You can specify a different port with `--port`.

## Next steps

- Read the [Style Guide](Style_Guide.md) for authoring conventions.
- Explore [Wiki Configuration](Wiki_Configuration.md) to customize validation, linting, and routes.
- Learn about [Query](wiki_query.md) and [Render](wiki_render.md) to work with the wiki graph.
- See the [CLI reference](wiki.md) for the full command list.

You're ready to build your semantic Markdown wiki!
