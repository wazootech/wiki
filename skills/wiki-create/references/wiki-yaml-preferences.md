# Preferences wizard — `wiki.yaml` touches

Use after `wiki init` when the user approves file edits. Run `wiki fmt` on changed markdown paths.

## Site display name

```yaml
site:
  manifest:
    name: My Wiki
```

Maps to layout chrome and `manifest.webmanifest`.

## Lint strictness (only if asked)

| Key | Values | Effect |
| --- | ------ | ------ |
| `lint.headings` | `off`, `warning`, `error` | Sentence-case H2+ and numbered headings |
| `lint.filename_pattern` | severity | Wikipedia-style filenames |
| `lint.broken_links` | severity | Unresolved internal links |
| `lint.link_style` | severity | Wikilinks in body when `link.style: markdown` |

Severity is `off`, `warning`, or `error`. Unknown top-level keys fail at config load.

## Config lanes (do not confuse)

| Block | Command | Purpose |
| ----- | ------- | ------- |
| `fmt:` | `wiki fmt` | Mechanical markdown |
| `lint:` | `wiki lint` | Conventions |
| `check:` | `wiki check` | SHACL, routes, layouts |

Regex belongs in `vault.filename_pattern`, not under `check:`.
