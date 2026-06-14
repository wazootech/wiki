# Deploy alignment checklist

Use when wiring or reviewing GitHub Pages for a Wiki CLI wiki.

## Config and CLI

- `-c` points at the correct `wiki.yaml`
- `site.base_url` in `wiki.yaml` matches the public Pages path
- `wiki build --site-base-url` in CI uses the **same** value as `site.base_url`
- `graph.context.wiki` matches the deployed site origin when possible (often from `wiki init --repo`)

## Artifact path

Build output layout:

```text
page_output_dir = _site / site.base_url.strip("/")   # when base_url is non-empty
page_output_dir = _site                               # when base_url is ""
```

`upload-pages-artifact` `path` must be `page_output_dir` — the directory that contains `index.html`.

| `site.base_url` | `wiki build` flags | Upload `path` |
| --------------- | ------------------ | ------------- |
| `/wiki` | `--output-dir _site --site-base-url /wiki` | `_site/wiki` |
| `/my-wiki` | `--output-dir _site --site-base-url /my-wiki` | `_site/my-wiki` |
| `''` | `--output-dir _site --site-base-url ''` | `_site` |

## GitHub settings

- **Pages → Build and deployment → GitHub Actions** (not “Deploy from a branch” for this workflow)
- Verify with `gh api repos/{owner}/{repo}/pages --jq '{build_type, source}'` — expect `build_type: workflow`

## Audit red flags

- `_site/` or build output committed to `main`
- Workflow uses `peaceiris/actions-gh-pages` or pushes to `gh-pages`
- `publish_dir` or artifact `path` is `_site` while `site.base_url` is `/wiki` (or any non-empty path)
- GitHub Pages `build_type: legacy` (branch deploy) while an Actions deploy workflow exists — use `build_type: workflow` instead
- `uv sync` in CI but no `pyproject.toml` / `uv.lock`
- `astral-sh/setup-uv` + `uv pip install` without `uv venv` or `--system` (CI error: “No virtual environment found”)
- Hybrid install: `setup-uv` present but `uv sync` replaced with `uv pip install` — use the full pip or uv template instead

Canonical reference workflow: [deploy-pages.yml](https://github.com/wazootech/wiki/blob/main/.github/workflows/deploy-pages.yml).

## Pipeline order

Typical CI: `check --strict` → `lint --strict` → `build --output-dir _site` → `upload-pages-artifact` → `deploy-pages`.

Local preview: `wiki -c path/to/wiki.yaml serve` (URL follows `site.base_url`).
