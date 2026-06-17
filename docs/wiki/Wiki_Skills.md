---
type: TechArticle
headline: Wiki CLI Agent Skills
description: Procedural knowledge for coding agents — install, scaffold, improve, and deploy wikis.
---

# Wiki CLI Agent Skills

[Procedural Knowledge](Procedural_Knowledge.md) for coding agents lives in the Wiki CLI repository under `skills/`. One consolidated **`wiki`** skill routes to focused workflow references. Skills are **not** wiki pages — do not add `skills/` to `wiki.inputs`.

Onboarding workflows are **independent modules** with no required order. Each completes its job and stops unless the user asks for the next step in the same turn.

Canonical skill file: [`skills/wiki/SKILL.md`](https://github.com/wazootech/wiki/blob/main/skills/wiki/SKILL.md).

## Install via skills.sh

[![skills.sh](https://skills.sh/b/wazootech/wiki)](https://skills.sh/wazootech/wiki)

Install agent skills with the [Skills CLI](https://github.com/vercel-labs/skills) (`npx skills`). Source repository: [wazootech/wiki](https://github.com/wazootech/wiki). Browse the ecosystem at [skills.sh](https://skills.sh/).

### Badge for your README

```markdown
[![skills.sh](https://skills.sh/b/wazootech/wiki)](https://skills.sh/wazootech/wiki)
```

```bash
npx skills add wazootech/wiki@wiki -g -y

# List skills without installing
npx skills add wazootech/wiki --list
```

Use `-g` for a user-wide install (`~/.agents/skills/`). Omit `-g` to install into the current project only (`.agents/skills/`). `-y` skips confirmation prompts.

### Refresh after upgrades

When Wiki CLI ships skill fixes (deploy templates, init guidance), re-run:

```bash
npx skills add wazootech/wiki@wiki -g -y
```

Project-local copies under `.agents/skills/` do not update automatically. Avoid committing vendored skill snapshots unless intentional; they can drift from upstream quickly.

## Workflows and routing

The single **`wiki`** skill routes to four workflow references:

| Intent                         | Reference                           | Stop when                        |
| ------------------------------ | ----------------------------------- | -------------------------------- |
| CLI missing or stale           | `skills/wiki/references/install.md` | CLI verified or blocker reported |
| New wiki / `wiki init`         | `skills/wiki/references/init.md`    | Scaffold summarized              |
| Audit / pre-PR / lint failures | `skills/wiki/references/improve.md` | Findings report delivered        |
| GitHub Pages / CI deploy       | `skills/wiki/references/deploy.md`  | Workflow + URLs summarized       |

Read one reference per turn unless the user explicitly asked for a multi-step flow (for example install → create → deploy).

## Scripts

```bash
bash skills/wiki/scripts/verify.sh
bash skills/wiki/scripts/audit.sh -c path/to/wiki.yml [FILE...]
```

`verify.sh` exits `0` when `wiki` and `fmt` capability pass, `1` when missing, `2` when stale. `audit.sh` runs fmt → lint → check → render (`--strict` / `--check`), then `wiki link --check` only when wired in `.github/workflows/`.

## Install workflow

Detect whether `wiki` is on PATH, install **`wazootech-wiki`** when needed, verify with `wiki --help` and a **`fmt` capability probe**, and exit with a ready-to-go message. Does not suggest `wiki init` unless the user asks.

See `skills/wiki/references/install.md`.

## Init workflow

Non-interactive `wiki init` for wiki project structure (config, starter pages), then a short **tweak** step: replace the starter first page, and optionally uncomment blocks in `wiki.yml`. Requires **`wiki` on PATH** before any init or file edits. Default post-init `wiki check --strict` with opt-out.

See `skills/wiki/references/init.md` and [Wiki Subcommand init](Wiki_Subcommand_init.md).

## Improve workflow

Survey a wiki as a read-only advisor: run validators, cite evidence, deliver a prioritized findings report. Never edits wiki files unless explicitly asked. Suggest repairs (`wiki fmt`, `wiki link --fix-broken`) only when asked.

See `skills/wiki/references/improve.md`, [Wiki Configuration](Wiki_Configuration.md), and [Design Philosophies](Design_Philosophies.md).

## Deploy workflow

Align `site.base_url`, add `.github/workflows/deploy.yml` from wholesale templates, set the correct `upload-pages-artifact` path, and remind you to enable **Pages → GitHub Actions**. Requires **`wiki` on PATH** and an existing wiki config (`wiki.yml`, or legacy `wiki.yaml`).

Workflow assets (embed one template in full; substitute `CONFIG_PATH`, `SITE_BASE_URL`, `ARTIFACT_PATH` only):

- `skills/wiki/references/workflow-template-uv.yml` — uv monorepo
- `skills/wiki/references/workflow-template-pip.yml` — pip standalone

See `skills/wiki/references/deploy.md` (which includes the Deploy Alignment Checklist) and [Deploying to GitHub Pages](Deploying_to_GitHub_Pages.md).

## Repository layout

```
skills/
  wiki/SKILL.md
  wiki/scripts/audit.sh
  wiki/scripts/verify.sh
  wiki/references/install.md
  wiki/references/init.md
  wiki/references/improve.md
  wiki/references/audit.md
  wiki/references/plan.md
  wiki/references/loop.md
  wiki/references/deploy.md
  wiki/references/workflow-template-uv.yml
  wiki/references/workflow-template-pip.yml
```

Human-oriented install and daily workflow: [Getting Started](Getting_Started.md).

## Related

- [LLM Wiki](LLM_Wiki.md)
- [Procedural Knowledge](Procedural_Knowledge.md)
- [Wiki CLI](Wiki_CLI.md)
