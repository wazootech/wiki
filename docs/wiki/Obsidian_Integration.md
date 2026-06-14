---
type: TechArticle
headline: Obsidian Integration
description: Run Wiki CLI from Obsidian via Shell Commands.
---

# Obsidian Integration

The CLI works well beside [Obsidian](Obsidian.md) because Obsidian markdown is natively supported by the CLI.

Use the community **Shell Commands** plugin to run `wiki` against your wiki root (where `wiki.yaml` lives).

## Suggested commands

| Trigger       | Command               | Purpose                           |
| ------------- | --------------------- | --------------------------------- |
| On save       | `wiki check`          | Fast SHACL + JSON Schema feedback |
| Hotkey        | `wiki render`         | Refresh all SPARQL tables         |
| Before commit | `wiki check --strict` | CI-parity validation              |

Point the plugin’s working directory at the folder containing `wiki.yaml`.

## Internal links

This wiki uses Markdown links (`Page_Name.md`). [Obsidian](Obsidian.md) wikis may use wikilinks (`[[Page]]`); the [Wiki CLI](Wiki_CLI.md) still resolves them when filenames follow wiki route rules, and `lint.broken_links` validates that each link resolves.

## Related

- [Obsidian](Obsidian.md)
- [Dataview Integration](Dataview_Integration.md)
- [Getting Started](Getting_Started.md)
- [Style Guide](Style_Guide.md)
- [Wiki Subcommand check](Wiki_Subcommand_check.md)
- [Wiki Subcommand lint](Wiki_Subcommand_lint.md)
- [Wiki Subcommand render](Wiki_Subcommand_render.md)
- [Wiki Subcommand serve](Wiki_Subcommand_serve.md) — preview with `--watch`
