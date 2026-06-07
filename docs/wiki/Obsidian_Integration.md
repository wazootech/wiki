---
type: TechArticle
headline: Obsidian integration
description: Run Wiki CLI from Obsidian via Shell Commands.
---

# Obsidian integration

The CLI works well beside [Obsidian](Obsidian.md) because Obsidian markdown is natively supported by the CLI.

Use the community **Shell Commands** plugin to run `wiki` against your vault root (where `wiki.yaml` lives).

## Suggested commands

| Trigger       | Command               | Purpose                    |
| ------------- | --------------------- | -------------------------- |
| On save       | `wiki check`          | Fast SHACL + link feedback |
| Hotkey        | `wiki render`         | Refresh all SPARQL tables  |
| Before commit | `wiki check --strict` | CI-parity validation       |

Point the plugin’s working directory at the folder containing `wiki.yaml`.

## Internal links

This vault uses Markdown links (`Page_Name.md`). [Obsidian](Obsidian.md) vaults may use wikilinks (`[[Page]]`); the [Wiki CLI](Wiki_CLI.md) still resolves them when filenames follow vault route rules, and `check.broken_links` validates that each link resolves.

## Related

- [Obsidian](Obsidian.md)
- [Style_Guide](Style_Guide.md)
- [Wiki_Subcommand_check](Wiki_Subcommand_check.md)
- [Wiki_Subcommand_render](Wiki_Subcommand_render.md)
