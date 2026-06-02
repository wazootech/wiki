---
type: TechArticle
name: wiki upgrade
description: Check PyPI for updates and upgrade wazootech-wiki.
---

# `wiki upgrade`

Compare the installed **wazootech-wiki** version to PyPI and optionally upgrade with pip.

## Usage

```bash
wiki upgrade -c          # check only; exit 1 if outdated
wiki upgrade             # prompt to upgrade when outdated
wiki upgrade -y          # upgrade without prompt
wiki upgrade -y -v       # show pip output
```

## Options

| Flag              | Description                        |
| ----------------- | ---------------------------------- |
| `-c`, `--check`   | Report status only; do not install |
| `-y`, `--yes`     | Skip confirmation                  |
| `-v`, `--verbose` | Show pip install logs              |

## Related

- [Getting_Started](Getting_Started.md)
