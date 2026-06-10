# Wiki CLI agent skills

Agent skills for [Wiki CLI](https://github.com/wazootech/wiki). They live under `skills/` and are **not** vault content — do not add this folder to `vault.inputs`.

## Onboarding (independent modules)

| Skill | Purpose |
| ----- | ------- |
| [install-wiki](install-wiki/SKILL.md) | Install and verify the CLI (`wazootech-wiki`). Exits with “installed and ready to go.” |
| [create-wiki](create-wiki/SKILL.md) | `wiki init` plus a preferences wizard (site name, first page). Requires CLI on PATH. |

No orchestrator and **no required order**. Each skill completes its own job and stops. Neither skill tells the user to invoke the other.

- Missing CLI while creating a wiki → `create-wiki` states the blocker and stops; the user chooses how to install.
- After install → `install-wiki` confirms ready; it does not suggest scaffolding.

## Vault hygiene

| Skill | Purpose |
| ----- | ------- |
| [best-practices](best-practices/SKILL.md) | Audit a vault: fmt, lint, check, render |

## Docs

Canonical user docs: [docs/wiki/Getting_Started.md](../docs/wiki/Getting_Started.md)
