---
type: TechArticle
headline: wiki remove
description: Remove a data source from wiki.yml, its cache, and wiki.lock.
---

# `wiki remove`

Remove a previously installed source by name. Deletes the source entry from the `sources:` block in `wiki.yml`, removes the cached repository under `.wiki/sources/<name>/`, and deletes the entry from `wiki.lock`.

**Transitive dependency cleanup:** when a source is removed, transitive sources that are no longer required by any remaining top-level source are automatically cleaned up — their cache and lockfile entries are removed too.

## Usage

```bash
wiki remove shared-taxonomy
```

## Arguments

| Argument | Description                                               |
| -------- | --------------------------------------------------------- |
| `name`   | Name of the source to remove (as declared in `wiki.yml`). |

## Related

- [wiki install](wiki_install.md)
- [Wiki Configuration](Wiki_Configuration.md#external-data-sources-sources)
