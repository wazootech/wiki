---
type: TechArticle
headline: Deploying to GitHub Pages
description: Deno workflow to check, build, and publish the docs wiki.
---

# Deploying to GitHub Pages

This repository publishes `docs/wiki/` using `docs/wiki.yml`. The workflow lives at `.github/workflows/deploy.yml` and uses Deno to check the wiki and build its custom static site.

## Pipeline

1. Set up Deno and Node.js in GitHub Actions
1. Run Deno type-checking, lint, format, test, and docs-wiki audits
1. `deno run -A docs/build.ts --output-dir _site` — build the themed static site
1. Upload `_site` as the Pages artifact
1. `deploy-pages` — publish

Enable **GitHub Pages → Build and deployment → GitHub Actions** in repository settings.

## Local preview

```bash
deno run -A src/wiki/cli.ts -c docs/wiki.yml serve
# http://127.0.0.1:8080/
```

Build the exact themed Pages output locally with:

```bash
deno run -A docs/build.ts --output-dir _site
```

## Custom wikis

For a regular wiki, use `wiki build` (or `deno run -A src/wiki/cli.ts build`) and adapt a Pages workflow to:

- pass `-c` with your config path;
- set `--site-base-url` to your Pages path (`/wiki`, `/my-wiki`, or `''` for root);
- set `path` in `upload-pages-artifact` to the directory containing the built `index.html`.

The custom `docs/build.ts` script is specific to this repository's Wikipedia theme. See [wiki build](wiki_build.md) for `site.url_style`, `wiki.assets`, and collision checks.

## Avoid these mistakes

When using `upload-pages-artifact` and `deploy-pages`:

- Do not commit `_site/` to `main` — add `_site/` to `.gitignore` and let CI build the artifact
- Do not use **Deploy from a branch** in Pages settings — use **GitHub Actions** as the source
- Do not use `peaceiris/actions-gh-pages` or push to a `gh-pages` branch for this pattern
- Set artifact `path` to the directory that contains the built `index.html`
- Use Deno tasks and the Deno-backed CLI; do not install Python, uv, Sphinx, or PyInstaller for the wiki toolchain
- Do not use the removed Python workflow templates; use the Deno workflow template in [Wiki Skills](Wiki_Skills.md)

Verify Pages is wired to Actions: `gh api repos/{owner}/{repo}/pages --jq '{build_type, source}'` should show `build_type: workflow`.

## Agent skill

Coding agents can use [Wiki Skills](Wiki_Skills.md) (`skills/wiki`, deploy reference) to scaffold the workflow and align artifact paths.

## Related

- [Getting Started](Getting_Started.md)
- [Wiki Configuration](Wiki_Configuration.md)
- [Wiki Skills](Wiki_Skills.md)
