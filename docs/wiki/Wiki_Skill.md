---
type: TechArticle
headline: wiki Agent Skill
description: Install Wiki CLI, scaffold workspaces, audit hygiene, and deploy to GitHub Pages.
---

# wiki Agent Skill

The **`wiki`** skill is procedural knowledge for coding agents working with [Wiki CLI](https://github.com/wazootech/wiki). One hub routes to four workflow references — install, create, improve, and deploy — plus deterministic scripts for CLI verification and CI-style audits.

Canonical skill file: [`skills/wiki/SKILL.md`](https://github.com/wazootech/wiki/blob/main/skills/wiki/SKILL.md). Skills live under `skills/` and are **not** wiki content — do not add that folder to `wiki.inputs`.

## Install

```bash
npx skills add wazootech/wiki@wiki -g -y
```

`-g` installs for all projects; omit `-g` for the current project only. `-y` skips prompts. See [Wiki Skills](Wiki_Skills.md) for badge and refresh commands.

## Routing

| Intent                         | Reference                           | Stop when                        |
| ------------------------------ | ----------------------------------- | -------------------------------- |
| CLI missing or stale           | `skills/wiki/references/install.md` | CLI verified or blocker reported |
| New wiki / `wiki init`         | `skills/wiki/references/create.md`  | Scaffold summarized              |
| Audit / pre-PR / lint failures | `skills/wiki/references/improve.md` | Findings report delivered        |
| GitHub Pages / CI deploy       | `skills/wiki/references/deploy.md`  | Workflow + URLs summarized       |

Read one reference per turn unless the user explicitly asked for a multi-step flow (for example install → create → deploy).

## Scripts

```bash
bash skills/wiki/scripts/verify-cli.sh
bash skills/wiki/scripts/audit.sh -c path/to/wiki.yml [FILE...]
```

`verify-cli.sh` exits `0` when `wiki` and `fmt` capability pass, `1` when missing, `2` when stale. `audit.sh` runs fmt → lint → check → render (`--strict` / `--check`), then `wiki link --check` only when wired in `.github/workflows/`.

## Install workflow

Detect whether `wiki` is on PATH, install **`wazootech-wiki`** when needed, verify with `wiki --help` and a **`fmt` capability probe**, and exit with a ready-to-go message. Does not suggest `wiki init` unless the user asks.

See `skills/wiki/references/install.md`.

## Create workflow

Non-interactive `wiki init` (flags, not prompts) plus a short preferences wizard for logo glyph (`--site-name`), first page, and light wiki config tweaks (`wiki.yml`). Requires **`wiki` on PATH** before any init or file edits. Default post-init `wiki check --strict` with opt-out.

See `skills/wiki/references/create.md` and [Wiki Subcommand init](Wiki_Subcommand_init.md).

## Improve workflow

Survey a wiki as a read-only advisor: run validators, cite evidence, deliver a prioritized findings report. Never edits wiki files unless explicitly asked. Suggest repairs (`wiki fmt`, `wiki link --fix-broken`) only when asked.

See `skills/wiki/references/improve.md`, [Wiki Configuration](Wiki_Configuration.md), and [Design Philosophies](Design_Philosophies.md).

## Deploy workflow

Align `site.base_url`, add `.github/workflows/deploy.yml` from wholesale templates, set the correct `upload-pages-artifact` path, and remind you to enable **Pages → GitHub Actions**. Requires **`wiki` on PATH** and an existing wiki config (`wiki.yml`, or legacy `wiki.yaml`).

Workflow assets (embed one template in full; substitute `CONFIG_PATH`, `SITE_BASE_URL`, `ARTIFACT_PATH` only):

- `skills/wiki/references/workflow-template-uv.yml` — uv monorepo
- `skills/wiki/references/workflow-template-pip.yml` — pip standalone
- `skills/wiki/references/alignment-checklist.md`

See `skills/wiki/references/deploy.md` and [Deploying to GitHub Pages](Deploying_to_GitHub_Pages.md).

## Related

- [Getting Started](Getting_Started.md) — install and daily commands for humans
- [Wiki Skills](Wiki_Skills.md) — install and refresh
- [Procedural Knowledge](Procedural_Knowledge.md)
