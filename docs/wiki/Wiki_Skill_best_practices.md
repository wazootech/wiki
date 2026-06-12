---
type: TechArticle
headline: wiki-best-practices agent skill
description: Audit a wiki with fmt, lint, check, and render in CI order.
---

# wiki-best-practices agent skill

The **wiki-best-practices** skill audits a Wiki CLI wiki for CI-ready hygiene: run `fmt --check`, `lint --strict`, `check --strict`, and `render --check` in order, interpret `wiki.yaml`, and spot-check [Style Guide](Style_Guide.md) conventions.

Canonical skill file: [`skills/wiki-best-practices/SKILL.md`](../../skills/wiki-best-practices/SKILL.md) in the [wiki-cli](https://github.com/wazootech/wiki) repository. Includes [`skills/wiki-best-practices/scripts/audit.sh`](../../skills/wiki-best-practices/scripts/audit.sh) for the strict pipeline.

## Install

```bash
npx skills add wazootech/wiki@wiki-best-practices -g -y
```

`-g` installs for all projects; omit `-g` for the current project only. `-y` skips prompts. See [Wiki Skills](Wiki_Skills.md) to install all wiki-cli skills or list available skills.

## When to use it

- Wiki audit before a PR
- `check` or `lint` failures, broken links, or `wiki.yaml` review
- Deploy alignment with [Deploying to GitHub Pages](Deploying_to_GitHub_Pages.md) (setup: [Wiki Skill deploy](Wiki_Skill_deploy.md))

## Quick start

From a directory containing `wiki.yaml`:

```bash
bash skills/wiki-best-practices/scripts/audit.sh -c path/to/wiki.yaml
```

In this repository: `-c docs/wiki.yaml`. Append wiki file paths to scope fmt, lint, and check to changed pages.

Manual equivalent:

```bash
wiki -c path/to/wiki.yaml fmt --check
wiki -c path/to/wiki.yaml lint --strict -v
wiki -c path/to/wiki.yaml check --strict -v
wiki -c path/to/wiki.yaml render --check
```

## Config semantics

| Block    | Command      | Purpose                                  |
| -------- | ------------ | ---------------------------------------- |
| `fmt:`   | `wiki fmt`   | Mechanical markdown                      |
| `lint:`  | `wiki lint`  | Conventions — links, filenames, headings |
| `check:` | `wiki check` | Integrity — SHACL, routes, layouts       |

Never edit wiki files unless the user asks. Suggest `wiki fmt`, `wiki link --fix-broken`, or `wiki link --apply` as separate repair steps ([Design Philosophies](Design_Philosophies.md)).

## Related

- [Wiki Configuration](Wiki_Configuration.md) — `check` vs `lint` vs `fmt`
- [Wiki Subcommand check](Wiki_Subcommand_check.md)
- [Wiki Subcommand lint](Wiki_Subcommand_lint.md)
- [Wiki Subcommand fmt](Wiki_Subcommand_fmt.md)
- [Wiki Subcommand render](Wiki_Subcommand_render.md)
- [Wiki Skills](Wiki_Skills.md)
- [Procedural Knowledge](Procedural_Knowledge.md)
