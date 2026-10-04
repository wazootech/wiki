---
type: TechArticle
headline: wiki upgrade
description: Check for Wiki CLI updates and upgrade supported installations.
---

# `wiki upgrade`

The Deno-backed `wiki upgrade` command becomes available with the first tagged Deno release. Before then, the published npm package is still the Python CLI and no Deno standalone binary is available. After release, compare the installed CLI version with the latest JSR release. A global Deno installation can be upgraded in place; npm installations are updated with npm, and standalone binaries are replaced from GitHub Releases.

## Deferred until the JSR release

The command compares against the published `@wazoo/wiki` on JSR, and JSR publication follows the first tagged Deno release. Until it is published there is no version to compare against, so `wiki upgrade` **steps aside rather than failing**: it explains that it is waiting and exits **0**, having installed nothing. The same applies when JSR cannot be reached.

This is a no-op, not a success report — the message says which happened, so "waiting for the first JSR release" is never mistaken for "you are up to date". Once the package is published, the command behaves as described below with no further change.

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

`wiki upgrade` cannot replace a command installed by npm. After the first tagged Deno release, update a global npm install with:

```bash
npm update -g wazootech-wiki
```

For a local npm project, run `npm update wazootech-wiki`. After release, replace a standalone executable with the current binary from [GitHub Releases](https://github.com/wazootech/wiki/releases), verify it against `SHA256SUMS`, and replace the installed file. The command can update a global Deno installation directly.

## Related

- [Getting Started](Getting_Started.md)
