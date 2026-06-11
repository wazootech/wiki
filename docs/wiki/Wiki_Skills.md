---
type: TechArticle
headline: Wiki CLI agent skills
description: Procedural knowledge for coding agents — install, scaffold, and audit vaults.
---

# Wiki CLI agent skills

[Procedural_Knowledge](Procedural_Knowledge.md) for coding agents lives in the wiki-cli repository under `skills/`. Each skill is a `SKILL.md` file with a focused workflow. Skills are **not** vault pages — do not add `skills/` to `vault.inputs`.

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

| Skill               | Install                                                   | Reference                                                 |
| ------------------- | --------------------------------------------------------- | --------------------------------------------------------- |
| wiki-install        | `npx skills add wazootech/wiki@wiki-install -g -y`        | [Wiki_Skill_install](Wiki_Skill_install.md)               |
| wiki-create         | `npx skills add wazootech/wiki@wiki-create -g -y`         | [Wiki_Skill_create](Wiki_Skill_create.md)                 |
| wiki-best-practices | `npx skills add wazootech/wiki@wiki-best-practices -g -y` | [Wiki_Skill_best_practices](Wiki_Skill_best_practices.md) |

## Onboarding

| Skill        | Vault reference                             | Purpose                                            |
| ------------ | ------------------------------------------- | -------------------------------------------------- |
| wiki-install | [Wiki_Skill_install](Wiki_Skill_install.md) | Install and verify `wazootech-wiki` on PATH        |
| wiki-create  | [Wiki_Skill_create](Wiki_Skill_create.md)   | `wiki init` plus preferences wizard (CLI required) |

## Vault hygiene

| Skill               | Vault reference                                           | Purpose                           |
| ------------------- | --------------------------------------------------------- | --------------------------------- |
| wiki-best-practices | [Wiki_Skill_best_practices](Wiki_Skill_best_practices.md) | fmt → lint → check → render audit |

## Repository layout

```
skills/
  wiki-install/SKILL.md
  wiki-create/SKILL.md
  wiki-best-practices/SKILL.md
  wiki-best-practices/scripts/audit.sh
```

Human-oriented install and daily workflow: [Getting_Started](Getting_Started.md).

## Related

- [LLM_Wiki](LLM_Wiki.md)
- [Procedural_Knowledge](Procedural_Knowledge.md)
- [Wiki_CLI](Wiki_CLI.md)
