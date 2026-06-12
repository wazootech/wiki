---
type: TechArticle
headline: wiki-improve agent skill
description: Survey a wiki with fmt, lint, check, and render; produce a prioritized findings report.
---

# wiki-improve agent skill

The **wiki-improve** skill surveys a Wiki CLI wiki as a read-only advisor: run `fmt --check`, `lint --strict`, `check --strict`, and `render --check` in order, interpret `wiki.yaml`, spot-check [Style Guide](Style_Guide.md) conventions, and deliver a prioritized findings report with evidence.

Canonical skill file: [`skills/wiki-improve/SKILL.md`](../../skills/wiki-improve/SKILL.md) in the [wiki-cli](https://github.com/wazootech/wiki) repository. Includes [`skills/wiki-improve/scripts/audit.sh`](../../skills/wiki-improve/scripts/audit.sh) for the strict pipeline.

## Install

```bash
npx skills add wazootech/wiki@wiki-improve -g -y
```

`-g` installs for all projects; omit `-g` for the current project only. `-y` skips prompts. See [Wiki Skills](Wiki_Skills.md) to install all wiki-cli skills or list available skills.

## When to use it

- Wiki audit or improve pass before a PR
- `check` or `lint` failures, broken links, or `wiki.yaml` review
- Deploy alignment with [Deploying to GitHub Pages](Deploying_to_GitHub_Pages.md) (setup: [Wiki Skill deploy](Wiki_Skill_deploy.md))

## Quick start

From a directory containing `wiki.yaml`:

```bash
bash skills/wiki-improve/scripts/audit.sh -c path/to/wiki.yaml
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
