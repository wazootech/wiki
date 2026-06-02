---
id: wiki:GlobalOptions
type: TechArticle
name: Global options
description: Flags shared by every wiki subcommand.
---

# Global options

These options apply to all subcommands on the root `wiki` group.

## `-c, --config PATH`

Path to `wiki.yaml`, `wiki.yml`, `wiki.json`, or a directory that contains one of those files.

Default: current directory (`.`).

Example for this repo’s documentation vault:

```bash
wiki -c docs/wiki.yaml check
```

## `--input-dir PATH` (repeatable)

Override or extend `inputDirs` from config for a single invocation. Useful for one-off queries against a subdirectory without editing `wiki.yaml`.

```bash
wiki --input-dir ./wiki --input-dir ./imported query "SELECT * WHERE { ?s ?p ?o } LIMIT 5"
```

## Help

```bash
wiki --help
wiki check --help
```

## Related

- [[Wiki_Configuration]]
- [[Getting_Started]]
