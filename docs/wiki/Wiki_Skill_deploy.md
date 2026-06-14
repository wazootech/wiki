---
type: TechArticle
headline: wiki-deploy Agent Skill
description: Set up GitHub Pages deployment for a Wiki CLI wiki with Actions.
---

# wiki-deploy Agent Skill

The **wiki-deploy** skill wires GitHub Pages for a Wiki CLI wiki: align `site.base_url`, add `.github/workflows/deploy-pages.yml`, set the correct `upload-pages-artifact` path, and remind you to enable **Pages → GitHub Actions** in repository settings.

Canonical skill file: [`skills/wiki-deploy/SKILL.md`](../../skills/wiki-deploy/SKILL.md) in the [Wiki CLI](https://github.com/wazootech/wiki) repository.

Workflow assets (mirror `.github/workflows/deploy-pages.yml` — embed one template in full, substitute `CONFIG_PATH`, `SITE_BASE_URL`, and `ARTIFACT_PATH` only):

- `skills/wiki-deploy/references/workflow-template-uv.yml` — uv monorepo (`pyproject.toml` + `uv.lock`)
- `skills/wiki-deploy/references/workflow-template-pip.yml` — pip standalone (same job shape as dogfood workflow)
- `skills/wiki-deploy/references/alignment-checklist.md`

## Install

```bash
npx skills add wazootech/wiki@wiki-deploy -g -y
```

`-g` installs for all projects; omit `-g` for the current project only. `-y` skips prompts. See [Wiki Skills](Wiki_Skills.md) to install all Wiki CLI skills or list available skills.

## When to use it

- Publish a wiki to GitHub Pages
- Add or fix a `deploy-pages` GitHub Actions workflow
- Align `wiki build --site-base-url` with Pages URL paths
- Fix 404s caused by wrong `upload-pages-artifact` paths

Requires **`wiki` on PATH** and an existing **`wiki.yaml`**.

## What it does

1. Confirm `wiki --help` and locate `wiki.yaml`.
1. Derive `site.base_url` from config and the user’s `{owner}.github.io/{repo}` URL.
1. Compute artifact path (`_site/wiki`, `_site/{repo}`, or `_site` for root).
1. Create or update `.github/workflows/deploy-pages.yml` from the template (with user approval).
1. Remind you to enable GitHub Actions as the Pages source.

## Modularity

This skill **only** sets up deployment. It does not scaffold wikis, install the CLI, or run a full hygiene audit unless you ask.

## Related

- [Deploying to GitHub Pages](Deploying_to_GitHub_Pages.md) — human-oriented walkthrough
- [Wiki Subcommand build](Wiki_Subcommand_build.md) — `site.base_url`, output layout
- [Wiki Skill improve](Wiki_Skill_improve.md) — audit deploy alignment in existing CI
- [Wiki Skills](Wiki_Skills.md)
- [Procedural Knowledge](Procedural_Knowledge.md)
