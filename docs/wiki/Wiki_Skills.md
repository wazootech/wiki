---
type: TechArticle
headline: Wiki CLI agent skills
description: Procedural knowledge for coding agents — install, scaffold, and audit wikis.
---

# Wiki CLI agent skills

[Procedural Knowledge](Procedural_Knowledge.md) for coding agents lives in the wiki-cli repository under `skills/`. Each skill is a `SKILL.md` file with a focused workflow. Skills are **not** wiki pages — do not add `skills/` to `wiki.inputs`.

Onboarding skills are **independent modules** with no required order. Each completes its job and stops without telling the user to invoke another skill.

## Install via skills.sh

[![skills.sh](https://skills.sh/b/wazootech/wiki)](https://skills.sh/wazootech/wiki)

Install agent skills with the [Skills CLI](https://github.com/vercel-labs/skills) (`npx skills`). Source repository: [wazootech/wiki](https://github.com/wazootech/wiki). Browse the ecosystem at [skills.sh](https://skills.sh/). Install works from GitHub as soon as the repo is public. Leaderboard and search on skills.sh are driven by anonymous install telemetry from `npx skills add` — there is no separate index request.

### Badge for your README

```markdown
[![skills.sh](https://skills.sh/b/wazootech/wiki)](https://skills.sh/wazootech/wiki)
```

```bash
# All wiki-cli skills (global)
npx skills add wazootech/wiki --skill '*' -g -y

# List skills without installing
npx skills add wazootech/wiki --list
```

Use `-g` for a user-wide install (`~/.agents/skills/`). Omit `-g` to install into the current project only (`.agents/skills/`). `-y` skips confirmation prompts.

### Refresh after upgrades

When Wiki CLI ships skill fixes (deploy templates, init guidance), re-run:

```bash
npx skills add wazootech/wiki --skill '*' -g -y
```

Project-local copies under `.agents/skills/` do not update automatically. Avoid committing vendored skill snapshots unless intentional — they drift from upstream quickly.

| Skill               | Install                                                   | Reference                                                 |
| ------------------- | --------------------------------------------------------- | --------------------------------------------------------- |
| wiki-install        | `npx skills add wazootech/wiki@wiki-install -g -y`        | [Wiki Skill install](Wiki_Skill_install.md)               |
| wiki-create         | `npx skills add wazootech/wiki@wiki-create -g -y`         | [Wiki Skill create](Wiki_Skill_create.md)                 |
| wiki-best-practices | `npx skills add wazootech/wiki@wiki-best-practices -g -y` | [Wiki Skill best practices](Wiki_Skill_best_practices.md) |
| wiki-deploy         | `npx skills add wazootech/wiki@wiki-deploy -g -y`         | [Wiki Skill deploy](Wiki_Skill_deploy.md)                 |

## Onboarding

| Skill        | Wiki reference                              | Purpose                                            |
| ------------ | ------------------------------------------- | -------------------------------------------------- |
| wiki-install | [Wiki Skill install](Wiki_Skill_install.md) | Install and verify `wazootech-wiki` on PATH        |
| wiki-create  | [Wiki Skill create](Wiki_Skill_create.md)   | `wiki init` plus preferences wizard (CLI required) |

## Wiki hygiene

| Skill               | Wiki reference                                            | Purpose                           |
| ------------------- | --------------------------------------------------------- | --------------------------------- |
| wiki-best-practices | [Wiki Skill best practices](Wiki_Skill_best_practices.md) | fmt → lint → check → render audit |

## Deploy

| Skill       | Wiki reference                            | Purpose                                      |
| ----------- | ----------------------------------------- | -------------------------------------------- |
| wiki-deploy | [Wiki Skill deploy](Wiki_Skill_deploy.md) | GitHub Pages workflow and artifact alignment |

## Repository layout

```
skills/
  wiki-install/SKILL.md
  wiki-create/SKILL.md
  wiki-best-practices/SKILL.md
  wiki-best-practices/scripts/audit.sh
  wiki-deploy/SKILL.md
  wiki-deploy/references/workflow-template-uv.yml
  wiki-deploy/references/workflow-template-pip.yml
  wiki-deploy/references/alignment-checklist.md
```

Human-oriented install and daily workflow: [Getting Started](Getting_Started.md).

## Related

- [LLM Wiki](LLM_Wiki.md)
- [Procedural Knowledge](Procedural_Knowledge.md)
- [Wiki CLI](Wiki_CLI.md)
