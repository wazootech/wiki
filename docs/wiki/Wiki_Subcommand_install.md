---
type: TechArticle
headline: wiki install
description: Fetch and lock external data sources declared in wiki.yml.
---

# `wiki install`

Fetch external data sources (git repositories with wiki pages or RDF data), resolve commit SHAs, and pin them in `wiki.lock`. Without arguments, installs all sources declared in the `sources:` block of `wiki.yml`. With a URL, adds the source to `wiki.yml` first, then fetches and locks it.

## Usage

```bash
wiki install
wiki install https://github.com/example/taxonomy.wiki.git
wiki install https://github.com/example/taxonomy.wiki.git#v1.2.0
```

## Options

| Flag  | Description                                                                                                                                |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `URL` | Git repository URL to add and install. Supports `#ref` pinning (branch, tag, or commit). If omitted, installs all sources from `wiki.yml`. |

## Lockfile

`wiki install` produces `wiki.lock` in the same directory as `wiki.yml`. This machine-authored JSON file records the resolved commit SHA, requested ref, and fetch timestamp for each source. Check it into version control so builds are reproducible — the lockfile is the source of truth for which version of each source is used.

## Source cache

Cloned repositories are cached under `.wiki/sources/<name>/repo/` relative to the wiki config root. `wiki install` always fetches the latest remote refs (shallow clone, `--depth 1`) so it stays fast.

## Related

- [Wiki Subcommand remove](Wiki_Subcommand_remove.md)
- [Wiki Configuration](Wiki_Configuration.md#external-data-sources-sources)
