# Wiki CLI agent skills

[![skills.sh](https://skills.sh/b/wazootech/wiki)](https://skills.sh/wazootech/wiki)

Agent skills for [Wiki CLI](https://github.com/wazootech/wiki). They live under `skills/` and are **not** wiki content — do not add this folder to `wiki.inputs`.

## Onboarding (independent modules)

| Skill | Purpose |
| ----- | ------- |
| [wiki-install](wiki-install/SKILL.md) | Install and verify the CLI (`wazootech-wiki`). Exits with “installed and ready to go.” |
| [wiki-create](wiki-create/SKILL.md) | `wiki init` plus a preferences wizard (site name, first page). Requires CLI on PATH. |

No orchestrator and **no required order**. Each skill completes its own job and stops. Neither skill tells the user to invoke the other.

Typical human flow: **install** → **create** → **deploy** → **improve** — but each step is optional and independent.

- Missing CLI while creating a wiki → `wiki-create` states the blocker and stops; the user chooses how to install.
- After install → `wiki-install` confirms ready; it does not suggest scaffolding.
- **wiki-deploy** mirrors [`.github/workflows/deploy-pages.yml`](../.github/workflows/deploy-pages.yml) via uv and pip templates — embed one template wholesale (substitute paths only); do not commit `_site/`, use GitHub Actions as the Pages source, and upload `_site/<base>` not bare `_site` when `site.base_url` is set.

## Improve

| Skill | Purpose |
| ----- | ------- |
| [wiki-improve](wiki-improve/SKILL.md) | Survey a wiki: fmt, lint, check, render; prioritized findings report |

## Deploy

| Skill | Purpose |
| ----- | ------- |
| [wiki-deploy](wiki-deploy/SKILL.md) | GitHub Pages workflow and path alignment |

## Docs

- Wiki skills reference: [Wiki_Skills.md](../docs/wiki/Wiki_Skills.md), [Wiki_Skill_install.md](../docs/wiki/Wiki_Skill_install.md), [Wiki_Skill_create.md](../docs/wiki/Wiki_Skill_create.md), [Wiki_Skill_improve.md](../docs/wiki/Wiki_Skill_improve.md), [Wiki_Skill_deploy.md](../docs/wiki/Wiki_Skill_deploy.md)
- User walkthrough: [Getting_Started.md](../docs/wiki/Getting_Started.md)
