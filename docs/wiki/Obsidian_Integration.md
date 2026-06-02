---
id: wiki:ObsidianIntegration
type: TechArticle
name: Obsidian integration
description: Run wiki CLI from Obsidian via Shell Commands.
---

# Obsidian integration

The CLI works well beside [Obsidian](https://obsidian.md/) when `markdownFlavor` is `obsidian` (the default from `wiki init`).

Use the community **Shell Commands** plugin to run `wiki` against your vault root (where `wiki.yaml` lives).

## Suggested commands

| Trigger | Command | Purpose |
| --- | --- | --- |
| On save | `wiki check` | Fast SHACL + link feedback |
| Hotkey | `wiki render` | Refresh all SPARQL tables |
| Before commit | `wiki check --strict` | CI-parity validation |

Point the plugin’s working directory at the folder containing `wiki.yaml`.

## Wikilinks

Obsidian wikilinks match the CLI resolver when filenames follow vault route rules. After [[CLI_check]] renames files with `--fix`, wikilinks in the vault are updated to match.

## Related

- [[Authoring_Guide]]
- [[CLI_check]]
- [[CLI_render]]
