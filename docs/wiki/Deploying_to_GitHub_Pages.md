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
1. `wiki -c docs/wiki.yaml build --output-dir _site --site-base-url /wiki` — static HTML
1. Upload `_site/wiki` as the Pages artifact
1. `deploy-pages` — publish

Enable **GitHub Pages → Build and deployment → GitHub Actions** in repository settings.

## Local preview

```bash
wiki -c docs/wiki.yaml serve
# http://127.0.0.1:8080/wiki/
```

## Custom wikis

For your own wiki, copy the workflow and change:

- `-c` path to your config
- `--site-base-url` to match your Pages path (`/wiki`, `/my-wiki`, or `''` for root)
- `path` in `upload-pages-artifact` to the directory that contains your built `index.html`

See [Wiki Subcommand build](Wiki_Subcommand_build.md) for `site.url_style`, `wiki.assets`, and collision checks.

## Avoid these mistakes

When using `upload-pages-artifact` and `deploy-pages`:

- Do not commit `_site/` to `main` — add `_site/` to `.gitignore` and let CI build the artifact
- Do not use **Deploy from a branch** in Pages settings — use **GitHub Actions** as the source
- Do not use `peaceiris/actions-gh-pages` or push to a `gh-pages` branch for this pattern
- Do not set artifact `path` to `_site` when `site.base_url` is `/wiki` — upload `_site/wiki` instead
- Do not run `uv sync` in CI unless the repo has `pyproject.toml` and `uv.lock`
- Do not use `uv pip install` on standalone wikis without `uv venv` or `--system` — use `pip install wazootech-wiki` instead

Verify Pages is wired to Actions: `gh api repos/{owner}/{repo}/pages --jq '{build_type, source}'` should show `build_type: workflow`.

## Agent skill

Coding agents can use [Wiki Skill deploy](Wiki_Skill_deploy.md) (`skills/wiki-deploy`) to scaffold the workflow and align artifact paths.

## Related

- [Getting Started](Getting_Started.md)
- [Wiki Configuration](Wiki_Configuration.md)
- [Wiki Skill deploy](Wiki_Skill_deploy.md)
