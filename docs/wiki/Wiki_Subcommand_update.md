---
type: TechArticle
headline: wiki update
description: Check locked sources for newer commits and update wiki.lock.
---

# `wiki update`

Fetch each locked source, resolve the current HEAD (or the configured ref), and compare against the pinned commit in `wiki.lock`. If the commit has changed, update the lockfile entry.

This is the incremental counterpart to `wiki install` — it only writes the lockfile when something actually changed, and reports what updated.

## Usage

```bash
wiki update
wiki update solar-system
wiki update --dry-run
```

## Arguments

| Argument | Description                                             |
| -------- | ------------------------------------------------------- |
| `name`   | Source name to check. Omit to check all locked sources. |

## Options

| Flag              | Description                                           |
| ----------------- | ----------------------------------------------------- |
| `-n`, `--dry-run` | Show what would update without modifying `wiki.lock`. |

## Related

- [Wiki Subcommand install](Wiki_Subcommand_install.md)
- [Wiki Subcommand remove](Wiki_Subcommand_remove.md)
- [Wiki Configuration](Wiki_Configuration.md#external-data-sources-sources)
