---
type: TechArticle
headline: Wiki CLI Agent Skills
description: Procedural knowledge for coding agents — install, scaffold, improve, and deploy wikis.
---

# Wiki CLI Agent Skills

[Procedural Knowledge](Procedural_Knowledge.md) for coding agents lives in the Wiki CLI repository under `skills/`. One consolidated **`wiki`** skill routes to focused workflow references. Skills are **not** wiki pages — do not add `skills/` to `wiki.inputs`.

Onboarding workflows are **independent modules** with no required order. Each completes its job and stops unless the user asks for the next step in the same turn.

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

Project-local copies under `.agents/skills/` do not update automatically. Avoid committing vendored skill snapshots unless intentional — they drift from upstream quickly.

| Skill | Install                                    | Reference                   | Workflows                                             |
| ----- | ------------------------------------------ | --------------------------- | ----------------------------------------------------- |
| wiki  | `npx skills add wazootech/wiki@wiki -g -y` | [Wiki Skill](Wiki_Skill.md) | Install, create, improve, deploy (route one per turn) |

## Repository layout

```
skills/
  wiki/SKILL.md
  wiki/scripts/audit.sh
  wiki/scripts/verify-cli.sh
  wiki/references/install.md
  wiki/references/create.md
  wiki/references/improve.md
  wiki/references/deploy.md
  wiki/references/workflow-template-uv.yml
  wiki/references/workflow-template-pip.yml
  wiki/references/alignment-checklist.md
```

Human-oriented install and daily workflow: [Getting Started](Getting_Started.md).

## Related

- [LLM Wiki](LLM_Wiki.md)
- [Procedural Knowledge](Procedural_Knowledge.md)
- [Wiki CLI](Wiki_CLI.md)
