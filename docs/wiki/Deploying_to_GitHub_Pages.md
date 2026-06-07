---
type: TechArticle
headline: Deploying to GitHub Pages
description: CI workflow to check, build, and publish the docs wiki.
---

# Deploying to GitHub Pages

This repository publishes `docs/wiki/` using `docs/wiki.yaml`. The workflow lives at `.github/workflows/deploy-pages.yml`.

## Pipeline

1. `uv sync` — install dependencies
1. `wiki -c docs/wiki.yaml check --strict -v` — SHACL + hygiene
1. `wiki -c docs/wiki.yaml build --output-dir _site --base-url /wiki` — static HTML
1. Upload `_site/wiki` as the Pages artifact
1. `deploy-pages` — publish

Enable **GitHub Pages → Build and deployment → GitHub Actions** in repository settings.

## Local preview

```bash
wiki -c docs/wiki.yaml serve
# http://127.0.0.1:8080/wiki/
```

## Custom wikis

For your own vault, copy the workflow and change:

- `-c` path to your config
- `--base-url` to match your Pages path (`/wiki`, `/my-wiki`, or `''` for root)
- `path` in `upload-pages-artifact` to the directory that contains your built `index.html`

See [Wiki_Subcommand_build](Wiki_Subcommand_build.md) for `url_style`, `asset_dirs`, and collision checks.

## Related

- [Getting_Started](Getting_Started.md)
- [Wiki_Configuration](Wiki_Configuration.md)
