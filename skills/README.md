# Wiki CLI agent skills

[![skills.sh](https://skills.sh/b/wazootech/wiki)](https://skills.sh/wazootech/wiki)

Agent skills for [Wiki CLI](https://github.com/wazootech/wiki). They live under `skills/` and are **not** wiki content — do not add this folder to `wiki.inputs`.

## Onboarding (independent modules)

| Skill | Purpose |
| ----- | ------- |
| [wiki-install](wiki-install/SKILL.md) | Install and verify the CLI (`wazootech-wiki`). Exits with “installed and ready to go.” |
| [wiki-create](wiki-create/SKILL.md) | `wiki init` plus a preferences wizard (site name, first page). Requires CLI on PATH. |

No orchestrator and **no required order**. Each skill completes its own job and stops. Neither skill tells the user to invoke the other.

- Missing CLI while creating a wiki → `wiki-create` states the blocker and stops; the user chooses how to install.
- After install → `wiki-install` confirms ready; it does not suggest scaffolding.

## Wiki hygiene

| Skill | Purpose |
| ----- | ------- |
| [wiki-best-practices](wiki-best-practices/SKILL.md) | Audit a wiki: fmt, lint, check, render |

## Docs

- Wiki skills reference: [Wiki_Skills.md](../docs/wiki/Wiki_Skills.md), [Wiki_Skill_install.md](../docs/wiki/Wiki_Skill_install.md), [Wiki_Skill_create.md](../docs/wiki/Wiki_Skill_create.md), [Wiki_Skill_best_practices.md](../docs/wiki/Wiki_Skill_best_practices.md)
- User walkthrough: [Getting_Started.md](../docs/wiki/Getting_Started.md)
