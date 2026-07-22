# Deploy Wiki to GitHub Pages

Publish a [Wiki CLI](https://github.com/wazootech/wiki) wiki with GitHub Actions and GitHub Pages. Requires **`wiki` on PATH** and a wiki config (`wiki.yml`, or legacy `wiki.yaml`) in the repository.

This workflow **only** sets up GitHub Pages deployment. When done, summarize URLs and paths and **stop**. If the CLI or wiki config is missing, state the blocker and stop.

Run `verify.sh` before editing workflows.

## Canonical workflow reference

The **working** deploy workflow in the Wiki CLI repository is [`.github/workflows/deploy.yml`](https://github.com/wazootech/wiki/blob/main/.github/workflows/deploy.yml). **Embed a template wholesale** — same permissions, action versions, and step order — then substitute placeholders only. Do **not** hybridize install steps.

| Step        | Dogfood value                                       | Why                                       |
| ----------- | --------------------------------------------------- | ----------------------------------------- |
| Permissions | `contents: read`, `pages: write`, `id-token: write` | Official Pages Actions model              |
| Install     | `uv sync` + `uv run wiki`                           | Monorepo has `pyproject.toml` + `uv.lock` |
| Config      | `-c docs/wiki.yml`                                  | Nested wiki in monorepo                   |
| Build       | `build --output-dir _site --site-base-url /wiki`    | Explicit base URL in CI                   |
| Artifact    | `path: "_site/wiki"`                                | Matches `site.base_url: /wiki`            |
| Deploy      | `upload-pages-artifact@v3` → `deploy-pages@v4`      | Not branch push                           |

Templates mirror that file:

- Monorepo: [workflow-template-uv.yml](workflow-template-uv.yml) — substitute `CONFIG_PATH`, `SITE_BASE_URL`, `ARTIFACT_PATH` only
- Standalone wiki: [workflow-template-pip.yml](workflow-template-pip.yml) — **identical job shape**; `pip install wazootech-wiki` + bare `wiki`

Pick **one** template. Copy it in full.

## Forbidden patterns

Do **not**:

1. Commit `_site/` or other build output to `main` / `gh-pages`
1. Tell the user **Settings → Pages → Deploy from a branch** when using `upload-pages-artifact` + `deploy-pages`
1. Use `peaceiris/actions-gh-pages` or branch-push deploy actions
1. Set artifact `path` to `_site` when `site.base_url` is non-empty (e.g. `/wiki` → **`_site/wiki`**)
1. Run `uv sync` / `uv run wiki` without `pyproject.toml` + `uv.lock`
1. Run `uv pip install` on standalone repos without venv — use pip template
1. Omit `--site-base-url` in CI
1. Hybridize install (e.g. `setup-uv` + `uv pip install` instead of full template)

Recommend `_site/` in `.gitignore` when build output is not already ignored.

## Prerequisite gate

```bash
wiki --help
wiki fmt --help
```

If either fails, say **`wiki` on PATH is required** (install **`wazootech-wiki`**) and **stop**.

Locate wiki config (`wiki.yml` preferred; legacy `wiki.yaml` also loads). If absent, say a wiki project is required and **stop**.

## Workflow

Ask **one decision at a time** with a short explainer.

### Pages URL shape

| Site type     | `site.base_url` | Example live URL                   |
| ------------- | --------------- | ---------------------------------- |
| Project site  | `/{repo}`       | `https://owner.github.io/my-wiki/` |
| Nested path   | `/wiki`         | `https://owner.github.io/wiki/`    |
| User/org root | `''`            | `https://owner.github.io/`         |

Read `site.base_url` from wiki config. Align **both** wiki config and workflow `wiki build --site-base-url` (edit config only with user approval).

### Artifact path (critical)

- `base_url` non-empty → `_site/<path-without-leading-slash>/`
- `base_url` empty → `_site/`

`upload-pages-artifact` `path` must be that directory — the tree containing `index.html`.

See [alignment-checklist.md](alignment-checklist.md).

### Install strategy in CI

| Repo signal                  | Template                                               | Install                               |
| ---------------------------- | ------------------------------------------------------ | ------------------------------------- |
| `uv.lock` + `pyproject.toml` | [workflow-template-uv.yml](workflow-template-uv.yml)   | `uv sync` + `uv run wiki`             |
| Otherwise                    | [workflow-template-pip.yml](workflow-template-pip.yml) | `pip install wazootech-wiki` + `wiki` |

Use Python **3.12+**.

### Workflow file

Create or update `.github/workflows/deploy.yml` with user approval. Substitute:

- `CONFIG_PATH` — path to wiki config (`wiki.yml` or legacy `wiki.yaml`)
- `SITE_BASE_URL` — matches `site.base_url`
- `ARTIFACT_PATH` — built HTML root (e.g. `_site/wiki`)

Typical job order: checkout → Python + install CLI → `check --strict` → `lint --strict` → `build` → `upload-pages-artifact` → `deploy-pages`.

Permissions: `contents: read`, `pages: write`, `id-token: write`. Use `concurrency: group: pages`.

### Repository settings

Tell the user to enable **Settings → Pages → Build and deployment → GitHub Actions**.

Verify when `gh` is available:

```bash
gh api repos/{owner}/{repo}/pages --jq '{build_type, source}'
```

Expect `build_type: workflow`.

### Pre-merge validation

With user approval:

```bash
wiki -c path/to/wiki.yml check --strict
wiki -c path/to/wiki.yml build --output-dir _site --site-base-url <SITE_BASE_URL>
```

Confirm `<ARTIFACT_PATH>/index.html` exists.

## Clean exit

Summarize: wiki config path, `site.base_url`, workflow path, `SITE_BASE_URL` / `ARTIFACT_PATH`, expected published URL, Pages settings reminder.

Do not run `wiki serve` or open PRs unless the user asks.

## Troubleshooting

| Issue                      | Response                                                                               |
| -------------------------- | -------------------------------------------------------------------------------------- |
| 404 on GitHub Pages        | `ARTIFACT_PATH` wrong — must be `_site/<base>` not `_site` when `site.base_url` is set |
| Site shows repo files      | Pages source still “Deploy from a branch” — switch to GitHub Actions                   |
| Broken asset links         | `--site-base-url` in CI must match `site.base_url`                                     |
| `uv sync` fails in CI      | No `pyproject.toml` — use pip template                                                 |
| `uv pip install` / no venv | Standalone repo — use pip template                                                     |
| `namespace_iri`            | Wrong namespace IRIs                                                                   |

## Deploy alignment checklist

Use these verification rules when wiring or reviewing GitHub Pages for a Wiki CLI project:

### Config and CLI

- `-c` points at the wiki config (`wiki.yml`, or legacy `wiki.yaml`)
- `site.base_url` in wiki config matches the public Pages path
- `wiki build --site-base-url` in CI uses the **same** value as `site.base_url`
- `graph.context.wiki` matches the deployed site origin when possible

### Artifact path

Build output layout:

```text
page_output_dir = _site / site.base_url.strip("/")   # when base_url is non-empty
page_output_dir = _site                               # when base_url is ""
```

`upload-pages-artifact` `path` must be `page_output_dir` — the directory that contains `index.html`.

| `site.base_url` | `wiki build` flags                            | Upload `path`   |
| --------------- | --------------------------------------------- | --------------- |
| `/wiki`         | `--output-dir _site --site-base-url /wiki`    | `_site/wiki`    |
| `/my-wiki`      | `--output-dir _site --site-base-url /my-wiki` | `_site/my-wiki` |
| `''`            | `--output-dir _site --site-base-url ''`       | `_site`         |

### GitHub settings

- **Pages → Build and deployment → GitHub Actions** (not “Deploy from a branch”)
- Verify with: `gh api repos/{owner}/{repo}/pages --jq '{build_type, source}'` (expect `build_type: workflow`)

### Audit red flags

- `_site/` or build output committed to `main` branch
- Workflow uses `peaceiris/actions-gh-pages` or pushes to `gh-pages` branch
- `publish_dir` or artifact `path` is `_site` while `site.base_url` is `/wiki` (or any non-empty path)
- GitHub Pages `build_type: legacy` (branch deploy) while an Actions deploy workflow exists
- `uv sync` in CI but no `pyproject.toml` / `uv.lock` in the repository
- `astral-sh/setup-uv` + `uv pip install` without `uv venv` or `--system` (CI error: “No virtual environment found”)
- Hybrid install: `setup-uv` present but `uv sync` replaced with `uv pip install` — use the full pip or uv template instead

### Pipeline order

Typical CI: `check --strict` → `lint --strict` → `build --output-dir _site` → `upload-pages-artifact` → `deploy-pages`.

Local preview: `wiki -c path/to/wiki.yml serve` (URL follows `site.base_url`).

Human docs: [Deploying to GitHub Pages](https://github.com/wazootech/wiki/blob/main/docs/wiki/Deploying_to_GitHub_Pages.md).
