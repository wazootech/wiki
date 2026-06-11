---
type: TechArticle
headline: wiki-create agent skill
description: Scaffold a Wiki CLI workspace with wiki init and a light preferences wizard.
---

# wiki-create agent skill

The **wiki-create** skill scaffolds a new workspace: non-interactive `wiki init` (flags, not prompts) plus a short preferences wizard for site name, first page, and light `wiki.yaml` tweaks.

Canonical skill file: [`skills/wiki-create/SKILL.md`](../../skills/wiki-create/SKILL.md) in the [wiki-cli](https://github.com/wazootech/wiki) repository. Requires **`wiki` on PATH** before any init or file edits.

## Install

```bash
npx skills add wazootech/wiki@wiki-create -g -y
```

`-g` installs for all projects; omit `-g` for the current project only. `-y` skips prompts. See [Wiki Skills](Wiki_Skills.md) to install all wiki-cli skills or list available skills.

## When to use it

- New wiki, `wiki init`, or bootstrap semantic markdown
- Customize an existing scaffold (`wiki.yaml` already present → wizard-only)
- GitHub Pages defaults via `--repo owner/repo`

## Prerequisite

Run `wiki --help` first. If it fails, state that the Wiki CLI must be on PATH, optionally name PyPI package **`wazootech-wiki`**, and **stop** — do not run `wiki init` or name other skills.

## Workflow summary

| Mode                | Action                                                                     |
| ------------------- | -------------------------------------------------------------------------- |
| No `wiki.yaml`      | Phase A: `wiki init` with explicit flags, then Phase B: preferences wizard |
| `wiki.yaml` present | Wizard-only; no re-init unless the user wants `--force`                    |

Gather init flags before running (see [Wiki Subcommand init](Wiki_Subcommand_init.md)): `--repo`, `--graph-context-wiki`, `--site-base-url`, `--git`, `--link-style`. Prefer flags over bare `wiki init` in agent sessions (stdin blocks).

After approved edits to markdown or config, run `wiki fmt` on changed paths.

## Modularity

This skill **only** scaffolds or customizes a workspace. It does not install the CLI, run `check` / `lint` / `serve` unsolicited, or suggest other skills.

## Related

- [Wiki Subcommand init](Wiki_Subcommand_init.md) — all `wiki init` flags
- [Wiki Configuration](Wiki_Configuration.md) — `wiki.yaml` semantics
- [Getting Started](Getting_Started.md) — daily workflow after scaffold
- [Wiki Skill install](Wiki_Skill_install.md) — install CLI when missing
- [Wiki Skills](Wiki_Skills.md)
- [Procedural Knowledge](Procedural_Knowledge.md)
