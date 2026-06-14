---
type: TechArticle
headline: wiki-improve Agent Skill
description: Survey a wiki with fmt, lint, check, and render; produce a prioritized findings report.
---

# wiki-improve Agent Skill

The **wiki-improve** skill surveys a Wiki CLI wiki as a read-only advisor and delivers a prioritized findings report with evidence. Canonical instructions: [`skills/wiki-improve/SKILL.md`](../../skills/wiki-improve/SKILL.md). Strict pipeline script: [`skills/wiki-improve/scripts/audit.sh`](../../skills/wiki-improve/scripts/audit.sh).

## Install

```bash
npx skills add wazootech/wiki@wiki-improve -g -y
```

See [Wiki Skills](Wiki_Skills.md) for `-g` / `-y` and installing all skills.

## When to use it

- Wiki audit or improve pass before a PR
- `check` or `lint` failures, broken links, or `wiki.yaml` review
- Deploy alignment in existing CI (setup: [Wiki Skill deploy](Wiki_Skill_deploy.md))

## What it does

1. Recon `wiki.yaml` and CI workflows — including removed `site.manifest` / `site.title` / `site.theme_color` keys and `{{ site.manifest.* }}` in custom layouts (report as `config` findings; migrate branding into layout files).
1. Run `audit.sh` (fmt → lint → check → render; optional `link --check` when wired).
1. Vet findings; report with categorized table, evidence, and next steps.
1. Suggest repairs (`wiki fmt`, `wiki link --fix-broken`) only when asked — never auto-edit.

## Modularity

Surveys hygiene only. Does not set up GitHub Pages — use **wiki-deploy** for that.

## Related

- [Wiki Configuration](Wiki_Configuration.md) — `check` vs `lint` vs `fmt`
- [Design Philosophies](Design_Philosophies.md) — lint vs `wiki link`
- [Wiki Skills](Wiki_Skills.md)
- [Procedural Knowledge](Procedural_Knowledge.md)
