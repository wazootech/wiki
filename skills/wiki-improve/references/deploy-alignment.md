# Deploy audit (existing CI)

**Setup** from scratch → **wiki-deploy** skill.

When auditing deploy-related wiki pages or workflows:

- `-c` → correct `wiki.yaml`
- `wiki build --site-base-url` → matches Pages path (`/wiki`, `/my-wiki`, or `''`)
- `upload-pages-artifact` `path` → directory containing built `index.html`
- Pages settings: **Build and deployment → GitHub Actions**
- `gh api repos/{owner}/{repo}/pages` → `build_type: workflow`

## Red flags

- `_site/` committed to `main`
- `peaceiris/actions-gh-pages` or `publish_dir: ./_site` when `site.base_url` is `/wiki` (artifact should be `_site/wiki`)
- “Deploy from a branch” alongside `upload-pages-artifact` / `deploy-pages`
- `uv sync` without `pyproject.toml` / `uv.lock`
- `setup-uv` + `uv pip install` on standalone repos without venv/`--system`
- Hybrid install: `setup-uv` with `uv pip install` instead of full uv or pip template

Canonical workflow: [deploy-pages.yml](https://github.com/wazootech/wiki/blob/main/.github/workflows/deploy-pages.yml).
