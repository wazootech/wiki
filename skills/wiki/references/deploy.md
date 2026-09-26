# Deploy Wiki to GitHub Pages

Publish a Wiki CLI project with GitHub Actions and GitHub Pages. It needs a supported `wiki` CLI and a wiki config (`wiki.yml`, or legacy `wiki.yaml`) in the repository.

The Deno workflow template uses `@wazoo/wiki` from JSR. That package is configured but not published yet; do not copy the template until its first tagged release makes the package available.

This workflow only sets up deployment. When done, summarize the workflow path, artifact path, expected URL, and Pages setting; stop. Do not edit repository settings, commit, or publish without the user's approval.

Run `bash skills/wiki/scripts/verify.sh` before editing workflows. If the CLI or wiki config is missing, state the blocker and stop.

## Canonical workflow

Use the Deno-native command in the Wiki repository's [deploy workflow](https://github.com/wazootech/wiki/blob/main/.github/workflows/deploy.yml):

```bash
deno run -A jsr:@wazoo/wiki/cli -c CONFIG_PATH check --strict -v
deno run -A jsr:@wazoo/wiki/cli -c CONFIG_PATH lint --strict -v
deno run -A jsr:@wazoo/wiki/cli -c CONFIG_PATH build --output-dir _site --site-base-url SITE_BASE_URL
```

Embed [workflow-template-deno.yml](workflow-template-deno.yml) in full, substituting only `CONFIG_PATH`, `SITE_BASE_URL`, and `ARTIFACT_PATH`. It sets up Deno, uses the JSR package, and uploads the built Pages artifact. Do not mix in Python, pip, or uv setup steps.

| Setting | Rule |
| --- | --- |
| `CONFIG_PATH` | Path to the wiki config, such as `docs/wiki.yml` |
| `SITE_BASE_URL` | Must match `site.base_url` in the config |
| `ARTIFACT_PATH` | The directory containing the built site's `index.html` |
| Permissions | `contents: read`, `pages: write`, `id-token: write` |
| Deploy actions | `actions/upload-pages-artifact@v3` then `actions/deploy-pages@v4` |

## Forbidden patterns

Do not:

1. Commit `_site/` or other generated output to `main` or `gh-pages`.
1. Use `peaceiris/actions-gh-pages` or push the built site to a branch.
1. Tell the user to choose “Deploy from a branch” when using the Pages Actions workflow.
1. Upload `_site` when `site.base_url` is non-empty; upload the matching nested directory instead.
1. Omit `--site-base-url` from the build command.
1. Add Python, pip, PyPI, or uv installation steps; the Python CLI has been retired.

Recommend adding `_site/` to `.gitignore` if it is not already ignored.

## Prerequisite gate

```bash
wiki --help
wiki fmt --help
```

If either command fails, explain that a supported CLI is required and stop; see [install.md](install.md) only if the user wants installation help. Locate `wiki.yml` or legacy `wiki.yaml`; if neither exists, report that a wiki project is required and stop.

## Pages URL and artifact path

Read `site.base_url` from the wiki config. The build flag must use the same value.

| Site type | `site.base_url` | Live URL example | Upload artifact path |
| --- | --- | --- | --- |
| Project site | `/{repo}` | `https://owner.github.io/my-wiki/` | `_site/my-wiki` |
| Nested path | `/wiki` | `https://owner.github.io/wiki/` | `_site/wiki` |
| User/org root | `''` | `https://owner.github.io/` | `_site` |

The artifact path is `_site/<base-url-without-leading-slash>` when the base URL is non-empty; otherwise it is `_site`. It must point to the directory containing `index.html`.

## Workflow

Ask one product decision at a time when the public URL or base path is unclear. Create or update `.github/workflows/deploy.yml` only with the user's approval. Use the template placeholders as follows:

- `CONFIG_PATH`: config path (`wiki.yml` or `docs/wiki.yml`)
- `SITE_BASE_URL`: exact value from `site.base_url`, including an empty string when appropriate
- `ARTIFACT_PATH`: output directory calculated above

The normal job order is checkout → set up Deno → `check --strict` → `lint --strict` → `build` → upload Pages artifact → deploy. Use `concurrency.group: pages` so overlapping deployments do not race.

Tell the user to enable **Settings → Pages → Build and deployment → GitHub Actions**. If `gh` is available, verify the current Pages mode with:

```bash
gh api repos/{owner}/{repo}/pages --jq '{build_type, source}'
```

Expect `build_type: workflow`.

## Pre-merge validation

With the user's approval, run the applicable checks and inspect the artifact:

```bash
deno run -A jsr:@wazoo/wiki/cli -c path/to/wiki.yml check --strict
deno run -A jsr:@wazoo/wiki/cli -c path/to/wiki.yml lint --strict
deno run -A jsr:@wazoo/wiki/cli -c path/to/wiki.yml render --check
deno run -A jsr:@wazoo/wiki/cli -c path/to/wiki.yml build --output-dir _site --site-base-url <SITE_BASE_URL>
test -f <ARTIFACT_PATH>/index.html
```

## Troubleshooting

| Issue | Likely fix |
| --- | --- |
| GitHub Pages returns 404 | Check that `ARTIFACT_PATH` is `_site/<base>` for a non-empty `site.base_url`. |
| Pages shows repository files | Set the Pages source to GitHub Actions, not branch deployment. |
| Assets have broken URLs | Make `--site-base-url` match `site.base_url`. |
| `index.html` is missing | Confirm the build output directory and uploaded artifact path. |
| `deno run` cannot resolve JSR | Check the Deno version and runner network access. |

## Alignment checklist

- `-c` points to the intended config.
- `site.base_url` matches `--site-base-url`.
- `graph.context.wiki` matches the deployed site origin when possible.
- The uploaded artifact contains `index.html` at its root.
- Pages uses GitHub Actions as its source.
- Generated `_site/` output is not committed.

Human docs: [Deploying to GitHub Pages](https://github.com/wazootech/wiki/blob/main/docs/wiki/Deploying_to_GitHub_Pages.md).
