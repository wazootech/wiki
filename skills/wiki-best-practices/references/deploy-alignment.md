# Deploy alignment checklist

To **set up** GitHub Pages from scratch, use the **wiki-deploy** skill.

When **auditing** deploy-related CI or Pages setup for a custom wiki:

- `-c` points at the correct `wiki.yaml`
- `wiki build --site-base-url` matches the GitHub Pages path (`/wiki`, `/my-wiki`, or `''` for root site)
- `upload-pages-artifact` `path` is the directory tree that contains the built `index.html`
- GitHub repository settings: **Pages → Build and deployment → GitHub Actions**
- `gh api repos/{owner}/{repo}/pages` shows `build_type: workflow` (not `legacy` branch deploy)

## Audit red flags

- `_site/` committed to `main`
- `peaceiris/actions-gh-pages` or `publish_dir: ./_site` when `site.base_url` is `/wiki` (artifact should be `_site/wiki`)
- Instructions to use “Deploy from a branch” alongside `upload-pages-artifact` / `deploy-pages`
- `uv sync` in CI without `pyproject.toml` / `uv.lock`
- `astral-sh/setup-uv` + `uv pip install` on standalone repos (no `uv venv` / `--system`) — use pip install instead

Canonical reference: [deploy-pages.yml](https://github.com/wazootech/wiki/blob/main/.github/workflows/deploy-pages.yml).

Typical pipeline order: `check --strict` → `build --output-dir _site` → upload artifact → `deploy-pages`.

Local preview: `wiki -c path/to/wiki.yaml serve` (default `http://127.0.0.1:8080/wiki/` when `site.base_url` is `/wiki`).
