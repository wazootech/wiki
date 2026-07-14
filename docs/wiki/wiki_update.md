---
type: TechArticle
headline: wiki update
description: Check locked sources for newer commits and update wiki.lock.
---

# `wiki update`

Fetch each locked source, resolve the current HEAD (or the configured ref), and compare against the pinned commit in `wiki.lock`. If the commit has changed, update the lockfile entry.

This is the incremental counterpart to `wiki install` — it only writes the lockfile when something actually changed, and reports what updated.

**Transitive dependency re-sync:** after updating commits, `wiki update` re-discovers each source's declared transitive dependencies. Newly declared sources are automatically installed and locked. Orphaned sources (transitive deps that were dropped by a source's new commit) are reported as warnings but not automatically removed — run `wiki remove <name>` to clean up.

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

- [wiki install](wiki_install.md)
- [wiki remove](wiki_remove.md)
- [Wiki Configuration](Wiki_Configuration.md#external-data-sources-sources)
