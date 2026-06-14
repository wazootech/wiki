---
type: TechArticle
headline: wiki-install Agent Skill
description: Install Wiki CLI and verify `wiki` on PATH for agents and contributors.
---

# wiki-install Agent Skill

The **wiki-install** skill is procedural knowledge for coding agents: detect whether `wiki` is on PATH, install **`wazootech-wiki`** when needed, verify with `wiki --help` and a **`fmt` capability probe**, and exit with a ready-to-go message.

Canonical skill file: [`skills/wiki-install/SKILL.md`](../../skills/wiki-install/SKILL.md) in the [Wiki CLI](https://github.com/wazootech/wiki) repository. Skills live under `skills/` and are **not** wiki content — do not add that folder to `wiki.inputs`.

## Install

```bash
npx skills add wazootech/wiki@wiki-install -g -y
```

`-g` installs for all projects; omit `-g` for the current project only. `-y` skips prompts. See [Wiki Skills](Wiki_Skills.md) to install all Wiki CLI skills or list available skills.

## When to use it

- The user needs the CLI but `wiki` is not found
- Pip or PyPI setup for `wazootech-wiki`
- Verify an existing install before other work
- `wiki --help` works but subcommands like `fmt` are missing (stale install)

## What it does

1. Run `wiki --help`, then `wiki fmt --help` (capability probe).
1. If both pass, confirm **`wiki` is on PATH and ready to go** and stop.
1. If missing, give `pip install wazootech-wiki` or `npm install -g wazootech-wiki` (run install only with explicit user approval). Zero-install: `npx wazootech-wiki` accepts the same subcommands as `wiki`.
1. If `--help` passes but `fmt` fails, recommend upgrade/reinstall — do not say ready-to-go.
1. Contributors in the Wiki CLI checkout may use `uv pip install -e .` and `uv run wiki --help` instead.
1. Re-verify after install; report errors if verification still fails.

## Modularity

This skill **only** installs and verifies the CLI. It does not suggest `wiki init`, scaffolding, or invoking other skills.

## Related

- [Getting Started](Getting_Started.md) — install and daily commands for humans
- [Wiki Skill create](Wiki_Skill_create.md) — scaffold a workspace (requires CLI on PATH)
- [Wiki Skills](Wiki_Skills.md) — all agent skills
- [Procedural Knowledge](Procedural_Knowledge.md)
