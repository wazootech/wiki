---
name: wiki
description: >-
  Manages Wiki CLI end to end — install and verify wazootech-wiki, scaffold with wiki init,
  audit vault hygiene (fmt, lint, check, render), and deploy to GitHub Pages. Use whenever
  the user mentions wiki, Wiki CLI, wazootech-wiki, wiki init, wiki.yaml, broken links,
  lint/check failures, pre-PR wiki review, GitHub Pages for a wiki, or getting started with
  semantic markdown — even if they do not say "skill". Route to one workflow reference,
  complete that job, and stop.
---

# Wiki CLI

Procedural knowledge for coding agents working with [Wiki CLI](https://github.com/wazootech/wiki) (`wiki` command, PyPI **`wazootech-wiki`**).

Skills under `skills/` are agent knowledge — **not** wiki pages. Do not add `skills/` to `wiki.inputs`.

## Principles

1. **Deterministic work belongs in scripts and the CLI** — run `scripts/verify-cli.sh` and `scripts/audit.sh` instead of reimplementing validator pipelines in prose.
2. **One workflow per turn** — read the matching reference below, finish that job, stop. Do not chain install → create → deploy unless the user asked for the full flow.
3. **Improve is advisory** — survey and report; never edit wiki files unless the user explicitly asks.
4. **Deploy uses wholesale templates** — embed [workflow-template-uv.yml](references/workflow-template-uv.yml) or [workflow-template-pip.yml](references/workflow-template-pip.yml) in full; substitute placeholders only.
5. **No config migration shims** — unknown `wiki.yaml` keys fail at load; document upgrades in CHANGELOG and wiki docs only.

## Route first

| User intent | Read | Stop when |
| ----------- | ---- | --------- |
| CLI missing, stale, or verify install | [references/install.md](references/install.md) | CLI verified or blocker reported |
| New wiki, `wiki init`, preferences wizard | [references/create.md](references/create.md) | Scaffold summarized |
| Audit, improve, pre-PR, lint/check failures | [references/improve.md](references/improve.md) | Findings report delivered |
| GitHub Pages, deploy workflow, CI publish | [references/deploy.md](references/deploy.md) | Workflow + URLs summarized |

When the user asks for multiple intents in one message, pick the **blocking** workflow first (usually install), or the workflow they emphasized. Offer the next step in plain language — do not name removed skill paths.

## Shared CLI resolution

Before any wiki command:

1. Run `bash skills/wiki/scripts/verify-cli.sh` (or `.agents/skills/wiki/scripts/verify-cli.sh` when vendored).
2. Exit `0` → use PATH `wiki`.
3. Exit `2` (stale) → upgrade **`wazootech-wiki`** per [install.md](references/install.md).
4. Exit `1` (missing) → install or stop with one-line PyPI hint; read [install.md](references/install.md) for paths.

In the **Wiki CLI repository checkout**, if PATH `wiki` fails but `pyproject.toml` exists, use `uv run wiki` or `python -m wiki` when both `--help` and `fmt` capability pass.

Zero-install equivalent: `npx wazootech-wiki <args>` or `uvx wazootech-wiki <args>` in place of `wiki <args>`.

## Deterministic scripts

```bash
bash skills/wiki/scripts/verify-cli.sh
bash skills/wiki/scripts/audit.sh -c path/to/wiki.yaml [FILE...]
```

`audit.sh` runs fmt → lint → check → render (`--strict` / `--check`), then `wiki link --check` only when wired in `.github/workflows/`. In this repo: `-c docs/wiki.yml`.

## Reference index

| File | Purpose |
| ---- | ------- |
| [references/install.md](references/install.md) | Install and verify CLI |
| [references/create.md](references/create.md) | `wiki init` + wizard |
| [references/improve.md](references/improve.md) | Audit report template |
| [references/deploy.md](references/deploy.md) | GitHub Pages workflow |
| [references/wiki-yaml-preferences.md](references/wiki-yaml-preferences.md) | Post-init `wiki.yaml` edits |
| [references/deploy-alignment.md](references/deploy-alignment.md) | Deploy audit red flags |
| [references/style-spot-check.md](references/style-spot-check.md) | Conventions when lint is off |
| [references/alignment-checklist.md](references/alignment-checklist.md) | Path alignment checklist |

Human docs: [Wiki Skill](https://github.com/wazootech/wiki/blob/main/docs/wiki/Wiki_Skill.md), [Getting Started](https://github.com/wazootech/wiki/blob/main/docs/wiki/Getting_Started.md).
