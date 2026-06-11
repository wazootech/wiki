---
type: TechArticle
headline: wiki-install agent skill
description: Install and verify the Wiki CLI on PATH for agents and contributors.
---

# wiki-install agent skill

The **wiki-install** skill is procedural knowledge for coding agents: detect whether `wiki` is on PATH, install **`wazootech-wiki`** when needed, verify with `wiki --help`, and exit with a ready-to-go message.

Canonical skill file: `skills/wiki-install/SKILL.md` in the [wiki-cli](https://github.com/wazootech/wiki) repository. Skills live under `skills/` and are **not** vault content — do not add that folder to `vault.inputs`.

## When to use it

- The user needs the CLI but `wiki` is not found
- Pip or PyPI setup for `wazootech-wiki`
- Verify an existing install before other work

## What it does

1. Run `wiki --help`. If it succeeds, confirm **Wiki CLI is installed and ready to go** and stop.
1. If missing, give `pip install wazootech-wiki` (run install only with explicit user approval).
1. Contributors in the wiki-cli checkout may use `uv pip install -e .` and `uv run wiki --help` instead.
1. Re-verify after install; report errors if verification still fails.

## Modularity

This skill **only** installs and verifies the CLI. It does not suggest `wiki init`, scaffolding, or invoking other skills.

## Related

- [Getting_Started](Getting_Started.md) — install and daily commands for humans
- [Wiki_Skill_create](Wiki_Skill_create.md) — scaffold a workspace (requires CLI on PATH)
- [Wiki_Skills](Wiki_Skills.md) — all agent skills
- [Procedural_Knowledge](Procedural_Knowledge.md)
