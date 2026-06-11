---
type: TechArticle
headline: wiki-best-practices agent skill
description: Audit a vault with fmt, lint, check, and render in CI order.
---

# wiki-best-practices agent skill

The **wiki-best-practices** skill audits a Wiki CLI vault for CI-ready hygiene: run `fmt --check`, `lint --strict`, `check --strict`, and `render --check` in order, interpret `wiki.yaml`, and spot-check [Style_Guide](Style_Guide.md) conventions.

Canonical skill file: `skills/wiki-best-practices/SKILL.md` in the [wiki-cli](https://github.com/wazootech/wiki) repository. Includes `skills/wiki-best-practices/scripts/audit.sh` for the strict pipeline.

## When to use it

- Vault audit before a PR
- `check` or `lint` failures, broken links, or `wiki.yaml` review
- Deploy alignment with [Deploying_to_GitHub_Pages](Deploying_to_GitHub_Pages.md)

## Quick start

From a directory containing `wiki.yaml`:

```bash
bash skills/wiki-best-practices/scripts/audit.sh -c path/to/wiki.yaml
```

In this repository: `-c docs/wiki.yaml`. Append vault file paths to scope fmt, lint, and check to changed pages.

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

Never edit vault files unless the user asks. Suggest `wiki fmt`, `wiki link --fix-broken`, or `wiki link --apply` as separate repair steps ([Design_Philosophies](Design_Philosophies.md)).

## Related

- [Wiki_Configuration](Wiki_Configuration.md) — `check` vs `lint` vs `fmt`
- [Wiki_Subcommand_check](Wiki_Subcommand_check.md)
- [Wiki_Subcommand_lint](Wiki_Subcommand_lint.md)
- [Wiki_Subcommand_fmt](Wiki_Subcommand_fmt.md)
- [Wiki_Subcommand_render](Wiki_Subcommand_render.md)
- [Wiki_Skills](Wiki_Skills.md)
- [Procedural_Knowledge](Procedural_Knowledge.md)
