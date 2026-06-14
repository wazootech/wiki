---
type: TechArticle
headline: wiki-create Agent Skill
description: Scaffold a Wiki CLI workspace with wiki init and a light preferences wizard.
---

# wiki-create Agent Skill

The **wiki-create** skill scaffolds a new workspace: non-interactive `wiki init` (flags, not prompts) plus a short preferences wizard for logo glyph (`--site-name`), first page, and light `wiki.yaml` tweaks.

Canonical skill file: [`skills/wiki-create/SKILL.md`](../../skills/wiki-create/SKILL.md) in the [Wiki CLI](https://github.com/wazootech/wiki) repository. Requires **`wiki` on PATH** (`wiki fmt --help` must work) before any init or file edits.

## Install

```bash
npx skills add wazootech/wiki@wiki-create -g -y
```

`-g` installs for all projects; omit `-g` for the current project only. `-y` skips prompts. See [Wiki Skills](Wiki_Skills.md) to install all Wiki CLI skills or list available skills.

## When to use it

- New wiki, `wiki init`, or bootstrap semantic markdown
- Customize an existing scaffold (`wiki.yaml` already present → wizard-only)
- GitHub Pages defaults via `--repo owner/repo`

## Prerequisite

Run `wiki --help` and `wiki fmt --help`. If either fails, state that **`wiki` on PATH is required** (install Wiki CLI from PyPI package **`wazootech-wiki`**), and **stop** — do not run `wiki init` or name other skills.

## Workflow summary

| Mode                | Action                                                                                  |
| ------------------- | --------------------------------------------------------------------------------------- |
| No `wiki.yaml`      | Phase A: `wiki init` with explicit flags → post-init `check --strict` → Phase B: wizard |
| `wiki.yaml` present | Wizard-only; no re-init unless the user wants `--force`                                 |

Post-init `check --strict` runs by default after new init; the user may opt out in the same turn (e.g. “skip check”).

Gather init flags before running (see [Wiki Subcommand init](Wiki_Subcommand_init.md)): `--repo`, `--graph-context-wiki`, `--site-base-url`, `--site-url-style`, `--graph-content-predicate`, `--link-style`, `--site-name`, `--wiki-inputs`, `--graph-base-iri`, `--site-theme-color`, `--graph-implicit-types`, `--graph-implicit-types-policy`, `--graph-include-file-extension`. Prefer flags over bare `wiki init` in agent sessions (stdin blocks).

`--site-name` and `--site-theme-color` affect only the generated `assets/logo.svg` at init (not written to `wiki.yaml`). Site title, theme color meta, and other chrome → edit `layouts/default.html.j2`.

After approved edits to markdown or config, run `wiki fmt` on changed paths.

## Modularity

This skill **only** scaffolds or customizes a workspace. It does not install the CLI, run `lint` / `serve` unsolicited, or suggest other skills. **`check --strict` after new init is the one default exception.**

## Related

- [Wiki Subcommand init](Wiki_Subcommand_init.md) — all `wiki init` flags
- [Wiki Configuration](Wiki_Configuration.md) — `wiki.yaml` semantics
- [Getting Started](Getting_Started.md) — daily workflow after scaffold
- [Wiki Skill install](Wiki_Skill_install.md) — install CLI when missing
- [Wiki Skills](Wiki_Skills.md)
- [Procedural Knowledge](Procedural_Knowledge.md)
