---
name: wiki-deploy
description: >-
  Set up GitHub Pages deployment for a Wiki CLI wiki — align site.base_url, add a
  deploy-pages workflow, and verify artifact paths. Use when the user wants GitHub
  Pages, deploy their wiki, publish a static site, or wire CI for wiki build — even
  if they do not say "skill". Requires wiki on PATH and an existing wiki.yaml.
---

# Deploy Wiki to GitHub Pages

Publish a [Wiki CLI](https://github.com/wazootech/wiki) wiki with GitHub Actions and GitHub Pages. Requires **`wiki` on PATH** and a **`wiki.yaml`** in the repository.

Skills under `skills/` are agent procedural knowledge — not wiki pages and not indexed by `wiki`.

## Modularity

This skill **only** sets up GitHub Pages deployment (workflow + config alignment). When done, summarize URLs and paths and **stop**. Do not suggest `wiki init`, installing the CLI, or running a full audit unless the user asks or deploy is blocked. If the CLI or `wiki.yaml` is missing, state the blocker and stop — do not name other skills.

## Canonical workflow reference

The **working** deploy workflow in the Wiki CLI repository is [`.github/workflows/deploy-pages.yml`](https://github.com/wazootech/wiki/blob/main/.github/workflows/deploy-pages.yml). **Embed a template wholesale** — same permissions, action versions, and step order — then substitute placeholders only. Do **not** hybridize install steps (for example keeping `setup-uv` but swapping `uv sync` for `uv pip install`).

| Step | Dogfood value | Why |
| ---- | ------------- | --- |
| Permissions | `contents: read`, `pages: write`, `id-token: write` | Official Pages Actions model |
| Install | `uv sync` + `uv run wiki` | Monorepo has `pyproject.toml` + `uv.lock` |
| Config | `-c docs/wiki.yaml` | Nested wiki in monorepo |
| Build | `build --output-dir _site --site-base-url /wiki` | Explicit base URL in CI |
| Artifact | `path: "_site/wiki"` | Matches `site.base_url: /wiki` |
| Deploy | `upload-pages-artifact@v3` → `deploy-pages@v4` | Not branch push |

Templates mirror that file:

- Monorepo (`pyproject.toml` + `uv.lock`): [workflow-template-uv.yml](references/workflow-template-uv.yml) — substitute `CONFIG_PATH`, `SITE_BASE_URL`, `ARTIFACT_PATH` only
- Standalone wiki (root `wiki.yaml`, no lockfile): [workflow-template-pip.yml](references/workflow-template-pip.yml) — **identical job shape**; `pip install wazootech-wiki` + bare `wiki` instead of `uv sync` / `uv run wiki`

Pick **one** template. Copy it in full. Nancy-style failures came from partial paste (uv setup + `uv pip install`, missing `--site-base-url`), not from embedding the complete working workflow.

## Forbidden patterns

Do **not** (common agent mistakes):

1. Commit `_site/` or other build output to `main` / `gh-pages` for deployment
2. Tell the user **Settings → Pages → Deploy from a branch** when using `upload-pages-artifact` + `deploy-pages`
3. Use `peaceiris/actions-gh-pages` or any action that pushes static files to a branch
4. Set `publish_dir` or artifact `path` to `_site` when `site.base_url` is non-empty (e.g. `/wiki` → **`_site/wiki`**)
5. Run `uv sync` / `uv run wiki` without `pyproject.toml` + `uv.lock` (standalone wikis → **pip install** only)
6. Run `uv pip install` on standalone repos without `uv venv` or `--system` — use the pip template instead (CI error: “No virtual environment found”)
7. Omit `--site-base-url` in CI — repeat `site.base_url` in the workflow even when it is already in `wiki.yaml`
8. Hybridize install — e.g. keep `astral-sh/setup-uv` but replace `uv sync` with `uv pip install`; pick the full uv or pip template instead

Recommend `_site/` in `.gitignore` when build output is not already ignored.

## Resolve wiki command

Prefer `wiki` on PATH when `wiki fmt --help` succeeds (or `fmt` appears in `wiki --help`).

In the **Wiki CLI repository checkout**, if PATH `wiki` is missing or stale (`--help` works but `fmt` fails), try:

```bash
uv run wiki --help
python -m wiki --help
```

Use the command that passes both `--help` and the `fmt` capability probe for all steps below (`wiki`, `uv run wiki`, or `python -m wiki`). If neither PATH nor checkout fallbacks work, stop and recommend upgrading **`wazootech-wiki`** (one-liner only — do not name other skills).

## Prerequisite gate

Before editing workflows or config:

```bash
wiki --help
wiki fmt --help
```

If either fails, say **`wiki` on PATH is required** (install Wiki CLI from PyPI: **`wazootech-wiki`**) and **stop**.

Locate `wiki.yaml` (repo root or ask the user). If absent, say a wiki workspace is required and **stop**.

## Workflow

Ask **one decision at a time** with a short explainer. Run `wiki build --help` when you need current build flags.

### Pages URL shape

GitHub Pages project sites publish at `https://{owner}.github.io/{repo}/`.

| Site type | `site.base_url` | Example live URL |
| --------- | --------------- | ---------------- |
| Project site (default for `wiki init --repo`) | `/{repo}` | `https://owner.github.io/my-wiki/` |
| Nested path in this repo | `/wiki` | `https://owner.github.io/wiki/` |
| User/org root site | `''` (empty) | `https://owner.github.io/` |

Read `site.base_url` from `wiki.yaml`. If it disagrees with the user’s GitHub Pages URL, align **both** `wiki.yaml` and the workflow `wiki build --site-base-url` flag (only edit `wiki.yaml` with user approval).

### Artifact path (critical)

`wiki build --output-dir _site --site-base-url <path>` writes HTML under:

- `base_url` non-empty → `_site/<path-without-leading-slash>/` (e.g. `/wiki` → `_site/wiki`)
- `base_url` empty → `_site/` (root `index.html`)

`upload-pages-artifact` `path` must be that directory — the tree that **contains** `index.html`, not `_site` alone when `base_url` is set.

See [references/alignment-checklist.md](references/alignment-checklist.md).

### Install strategy in CI

| Repo signal | Template | Install |
| ----------- | -------- | ------- |
| `uv.lock` + `pyproject.toml` with wiki dependency | [workflow-template-uv.yml](references/workflow-template-uv.yml) | `uv sync` + `uv run wiki` |
| Otherwise (standalone wiki) | [workflow-template-pip.yml](references/workflow-template-pip.yml) | `pip install wazootech-wiki` + `wiki` |

Use Python **3.12+**.

### Workflow file

Create or update `.github/workflows/deploy-pages.yml` (or `deploy.yml`) with user approval.

Substitute placeholders in the chosen template:

- `CONFIG_PATH` — path to `wiki.yaml` (e.g. `wiki.yaml`, `docs/wiki.yaml`)
- `SITE_BASE_URL` — matches `site.base_url` (e.g. `/wiki`, `/my-wiki`, or `''`)
- `ARTIFACT_PATH` — built HTML root (e.g. `_site/wiki`, `_site/my-wiki`, `_site`)

**Worked example** — repo `nancy-kataria/wiki`, root `wiki.yaml`, `site.base_url: /wiki`:

- Template: `workflow-template-pip.yml`
- `CONFIG_PATH`: `wiki.yaml`
- Build: `wiki -c wiki.yaml build --output-dir _site --site-base-url /wiki`
- `ARTIFACT_PATH`: `_site/wiki`
- Live URL: `https://nancy-kataria.github.io/wiki/`

Typical job order:

1. Checkout
2. Python + install CLI
3. `wiki -c <config> check --strict -v`
4. `wiki -c <config> lint --strict -v`
5. `wiki -c <config> build --output-dir _site --site-base-url <SITE_BASE_URL>`
6. `upload-pages-artifact` with `path: <ARTIFACT_PATH>`
7. `deploy-pages`

Permissions required: `contents: read`, `pages: write`, `id-token: write`. Use `concurrency: group: pages`.

### Repository settings and verification

Tell the user to enable **Settings → Pages → Build and deployment → GitHub Actions**.

After the workflow is committed, verify when `gh` is available:

```bash
gh api repos/{owner}/{repo}/pages --jq '{build_type, source}'
```

Expect `build_type: workflow`. If GitHub returns `build_type: legacy` (branch-based Pages source), the site is still served from `main` / `gh-pages` — not the Actions artifact.

Confirm the latest Actions run succeeded and the published URL loads.

### Local preview (optional)

```bash
wiki -c path/to/wiki.yaml serve
```

Default preview URL follows `site.base_url` (e.g. `http://127.0.0.1:8080/wiki/` when `site.base_url` is `/wiki` — not the server root alone).

### Pre-merge validation

With user approval, run locally before committing the workflow:

```bash
wiki -c path/to/wiki.yaml check --strict
wiki -c path/to/wiki.yaml build --output-dir _site --site-base-url <SITE_BASE_URL>
```

Confirm `<ARTIFACT_PATH>/index.html` exists.

## Clean exit

Summarize:

- `wiki.yaml` path and `site.base_url`
- Workflow path and substituted `SITE_BASE_URL` / `ARTIFACT_PATH`
- Expected published URL
- Pages settings and `build_type: workflow` verification if not confirmed

Do not run `wiki serve` or open PRs unless the user asks.

## Troubleshooting

| Issue | Response |
| ----- | -------- |
| 404 on GitHub Pages | `ARTIFACT_PATH` wrong — must be `_site/<base>` not `_site` when `site.base_url` is set |
| Site shows repo files, not wiki | Pages source is still “Deploy from a branch” — switch to GitHub Actions |
| Broken asset links | `--site-base-url` in CI must match `site.base_url` in `wiki.yaml` |
| Build fails in CI | Run same `check` / `lint` / `build` locally with `-v`; fix wiki before deploy |
| `uv sync` fails in CI | Repo has no `pyproject.toml` — use pip template instead |
| `uv pip install` / no venv in CI | Standalone repo — drop `setup-uv`; use `pip install wazootech-wiki` and bare `wiki` |
| Wrong namespace IRIs | `graph.context.wiki` in `wiki.yaml` should match the public site URL (often set at `wiki init --repo`) |

## References

- [references/alignment-checklist.md](references/alignment-checklist.md) — path alignment and audit red flags
- [references/workflow-template-uv.yml](references/workflow-template-uv.yml) — monorepo / uv (matches deploy-pages.yml)
- [references/workflow-template-pip.yml](references/workflow-template-pip.yml) — standalone wiki repos

Human docs: [Deploying to GitHub Pages](https://github.com/wazootech/wiki/blob/main/docs/wiki/Deploying_to_GitHub_Pages.md), [Wiki Subcommand build](https://github.com/wazootech/wiki/blob/main/docs/wiki/Wiki_Subcommand_build.md).
