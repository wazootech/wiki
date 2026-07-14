---
type: TechArticle
headline: wiki upgrade
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

## Windows PATH troubleshooting

If `python -m wiki upgrade` works but `wiki upgrade` says `No such command 'upgrade'`, PATH is probably resolving `wiki` to an older `wiki.exe` from a different Python install.

Check which launcher is active:

```powershell
Get-Command wiki
where.exe wiki
python -m wiki --help
```

If the PATH launcher is stale, upgrade through the intended interpreter and remove or refresh the older shim:

```powershell
python -m wiki upgrade -y
python -m pip install --upgrade wazootech-wiki
```

## Related

- [Getting Started](Getting_Started.md)
