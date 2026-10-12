---
type: TechArticle
description: Check for Wiki CLI updates and upgrade supported installations.
---

# `wiki upgrade`

`wiki upgrade` compares the installed CLI version with the latest `@wazoo/wiki` release on JSR. A global Deno installation can be upgraded in place; npm and pip installations are updated with their own package manager, and standalone binaries are replaced from GitHub Releases.

## When JSR cannot answer

When JSR cannot be reached, or holds no published version to compare against, `wiki upgrade` **steps aside rather than failing**: it explains why and exits **0**, having installed nothing. This is a no-op, not a success report — the message says which happened, so "could not check" is never mistaken for "you are up to date".

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

`wiki upgrade` cannot replace a command installed by npm. Update a global npm install with:

```bash
npm update -g wazootech-wiki
```

For a local npm project, run `npm update wazootech-wiki`. Replace a standalone executable with the current binary from [GitHub Releases](https://github.com/wazootech/wiki/releases), verify it against `SHA256SUMS`, and replace the installed file. The command can update a global Deno installation directly.

## Related

- [Getting Started](Getting_Started.md)
