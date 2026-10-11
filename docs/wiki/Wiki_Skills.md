---
type: TechArticle
headline: Wiki CLI Agent Skills
description: Procedural knowledge for coding agents — install, scaffold, edit, improve, and deploy wikis.
---

# Wiki CLI Agent Skills

[Procedural Knowledge](Procedural_Knowledge.md) for coding agents lives in the Wiki CLI repository under `skills/`. The **`wiki`** skill routes operational workflows to focused references, including code-wiki sync. Skills are **not** wiki pages — do not add `skills/` to `wiki.input`.

Onboarding workflows are **independent modules** with no required order. Each completes its job and stops unless the user asks for the next step in the same turn.

Canonical operational skill file: [`skills/wiki/SKILL.md`](https://github.com/wazootech/wiki/blob/main/skills/wiki/SKILL.md). Integration proposal feedback follows the [contributing guide in wazootech/wiki-templates](https://github.com/wazootech/wiki-templates/blob/main/CONTRIBUTING.md), where proposals are filed.

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

Project-local copies under `.agents/skills/` do not update automatically. Avoid committing vendored skill snapshots unless intentional; they can drift from upstream quickly.

## Workflows and routing

The **`wiki`** skill routes operational workflows to focused references:

| Intent                             | Reference                           | Stop when                        |
| ---------------------------------- | ----------------------------------- | -------------------------------- |
| CLI missing or stale               | `skills/wiki/references/install.md` | CLI verified or blocker reported |
| New wiki / `wiki init`             | `skills/wiki/references/init.md`    | Scaffold summarized              |
| Audit / pre-PR / lint failures     | `skills/wiki/references/improve.md` | Findings report delivered        |
| Create, rename, delete, set, patch | `skills/wiki/references/edit.md`    | Edit applied and checks pass     |
| GitHub Pages / CI deploy           | `skills/wiki/references/deploy.md`  | Workflow + URLs summarized       |
| Docs out of sync with source       | `skills/wiki/references/sync.md`    | Sync PR opened and validated     |

Read one reference per turn unless the user explicitly asked for a multi-step flow (for example install → create → deploy).

Integration and template proposals follow the [contributing guide in wazootech/wiki-templates](https://github.com/wazootech/wiki-templates/blob/main/CONTRIBUTING.md). Use it when comparing an external tool with Wiki CLI, drafting a template proposal issue, or turning an integration idea into a repeatable GitHub issue. It preserves the boundary between Wiki CLI and downstream integrations and files through the `integration-template.yml` issue form in `wazootech/wiki-templates`.

Code-wiki **sync** lives inside the `wiki` skill as a routed workflow (`skills/wiki/references/sync.md`). It maintains _code wikis_ (a repo's `docs/` folder, e.g. `wazootech/sparql-engine`) — the Git-anchored delta process that keeps documentation truthful to source after code changes: anchor at `docs/.sync-base`, diff `origin/main` forward, check file inventory with `git ls-tree`, edit only the affected pages, validate, and land. It defaults to drift-free docs — no line numbers, machine-specific measurements, or test counts — with an opt-in `detail_level` directive in the repo's `AGENTS.md` (`line-numbers`, `measurements`, or `full`) that re-enables the execute-to-verify steps (`deno doc --json` lines, runner counts, bench snapshots). A wholesale scheduled-sync template ships alongside it: [`skills/wiki/references/workflow-template-wiki-sync.yml`](https://github.com/wazootech/wiki/blob/main/skills/wiki/references/workflow-template-wiki-sync.yml).

## Scripts

```bash
bash skills/wiki/scripts/verify.sh
bash skills/wiki/scripts/audit.sh -c path/to/wiki.yml [FILE...]
```

`verify.sh` exits `0` when `wiki` and `fmt` capability pass, `1` when missing, `2` when stale. On `0` it also prints whether the write verbs are available; an older CLI without them is still ready, and the skill falls back to hand edits. `audit.sh` runs fmt → lint → check → render (`--strict` / `--check`), then `wiki link --check` only when wired in `.github/workflows/`.

## Install workflow

Detect whether `wiki` is on PATH, install **`wazootech-wiki`** when needed, verify with `wiki --help` and a **`fmt` capability probe**, and exit with a ready-to-go message. Does not suggest `wiki init` unless the user asks.

See `skills/wiki/references/install.md`.

## Init workflow

Non-interactive `wiki init` for wiki project structure (config, starter pages), then a short **tweak** step: replace the starter first page, and optionally uncomment blocks in `wiki.yml`. Requires **`wiki` on PATH** before any init or file edits. Default post-init `wiki check --strict` with opt-out.

See `skills/wiki/references/init.md` and [wiki init](wiki_init.md).

## Edit workflow

Structural changes go through the engine's write verbs instead of hand-written Markdown: [wiki new](wiki_new.md) for a typed page, [wiki set](wiki_set.md) for a frontmatter field, [wiki patch](wiki_patch.md) for a section, [wiki mv](wiki_mv.md) and [wiki rm](wiki_rm.md) for renames and deletes that keep inbound links whole, and [wiki edit](wiki_edit.md) to batch several into one atomic change. The agent reads the page with [wiki show](wiki_show.md) to get its content hash, dry-runs the change, then applies it with that hash as `expect`, so a page that changed in between is refused (exit `3`) rather than overwritten. A change that would introduce a check or lint error is rejected (exit `1`) before anything is written.

The advisor-executor model carries over: an improvement plan whose fixes are structural ships a dry-run-clean edit JSON next to the Markdown plan, and the executor applies exactly that. When `verify.sh` reports the write verbs unavailable, agents edit by hand and validate with `fmt`, `lint`, and `check` as before.

See `skills/wiki/references/edit.md`.

## Improve workflow

Survey a wiki as a read-only advisor: run validators, cite evidence, deliver a prioritized findings report. Never edits wiki files unless explicitly asked. Suggest repairs (`wiki fmt`, `wiki link --fix-broken`) only when asked.

See `skills/wiki/references/improve.md`, [Wiki Configuration](Wiki_Configuration.md), and [Design Philosophies](Design_Philosophies.md).

## Deploy workflow

Align `site.base_url`, add `.github/workflows/deploy.yml` from the Deno-native template, set the correct `upload-pages-artifact` path, and remind you to enable **Pages → GitHub Actions**. Requires a supported Wiki CLI path and an existing wiki config (`wiki.yml`, or legacy `wiki.yaml`).

Workflow asset (embed the template in full; substitute `CONFIG_PATH`, `SITE_BASE_URL`, `ARTIFACT_PATH` only):

- `skills/wiki/references/workflow-template-deno.yml` — Deno-native JSR CLI

See `skills/wiki/references/deploy.md` (which includes the Deploy Alignment Checklist) and [Deploying to GitHub Pages](Deploying_to_GitHub_Pages.md).

## Repository layout

```
skills/
  wiki/SKILL.md
  wiki/evals/evals.json
  wiki/scripts/audit.sh
  wiki/scripts/verify.sh
  wiki/references/install.md
  wiki/references/init.md
  wiki/references/improve.md
  wiki/references/audit.md
  wiki/references/plan.md
  wiki/references/loop.md
  wiki/references/deploy.md
  wiki/references/enrich.md
  wiki/references/edit.md
  wiki/references/sync.md
  wiki/references/workflow-template-deno.yml
  wiki/references/workflow-template-wiki-sync.yml
```

Human-oriented install and daily workflow: [Getting Started](Getting_Started.md).

## Related

- [LLM Wiki](LLM_Wiki.md)
- [Procedural Knowledge](Procedural_Knowledge.md)
- [wiki](wiki.md)
