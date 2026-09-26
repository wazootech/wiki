---
type: TechArticle
headline: wiki upgrade
description: Check for Wiki CLI updates and upgrade supported installations.
---

# `wiki upgrade`

Compare the installed CLI version with the latest JSR release. A global Deno installation can be upgraded in place; npm installations are updated with npm, and standalone binaries are replaced from GitHub Releases.

## Usage

```bash
wiki upgrade -c          # check only; exit 1 if outdated
wiki upgrade             # prompt to upgrade when outdated
wiki upgrade -y          # upgrade without prompt
wiki upgrade -y -v       # show Deno install output
```

## Options

| Flag              | Description                        |
| ----------------- | ---------------------------------- |
| `-c`, `--check`   | Report status only; do not install |
| `-y`, `--yes`     | Skip confirmation                  |
| `-v`, `--verbose` | Show Deno install output           |

## Updating npm and standalone installations

`wiki upgrade` cannot replace a command installed by npm. Update it with:

```bash
npm update -g wazootech-wiki
```

For a local npm project, run `npm update wazootech-wiki`. For a standalone executable, download the current binary from [GitHub Releases](https://github.com/wazootech/wiki/releases), verify it against `SHA256SUMS`, and replace the installed file. The command can update a global Deno installation directly.

## Related

- [Getting Started](Getting_Started.md)
