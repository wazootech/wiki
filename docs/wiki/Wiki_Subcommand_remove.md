---
type: TechArticle
headline: wiki remove
description: Remove a data source from wiki.yml, its cache, and wiki.lock.
---

# `wiki remove`

Remove a previously installed source by name. Deletes the source entry from the `sources:` block in `wiki.yml`, removes the cached repository under `.wiki/sources/<name>/`, and deletes the entry from `wiki.lock`.

## Usage

```bash
wiki remove shared-taxonomy
```

## Arguments

| Argument | Description                                               |
| -------- | --------------------------------------------------------- |
| `name`   | Name of the source to remove (as declared in `wiki.yml`). |

## Related

- [Wiki Subcommand install](Wiki_Subcommand_install.md)
- [Wiki Configuration](Wiki_Configuration.md#external-data-sources-sources)
