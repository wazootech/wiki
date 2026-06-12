---
name: wiki-best-practices
description: >-
  Audit a Wiki CLI wiki and wiki.yaml for CI-ready hygiene — run fmt, lint, check,
  and render validators, interpret config semantics, and spot-check idiomatic
  conventions. Use whenever the user asks for a wiki audit, wiki best practices,
  pre-commit or CI validation, check/lint failures, broken links, wiki.yaml review,
  or preparing wiki changes before a PR — even if they do not say "skill".
---

# Wiki CLI best practices

Audit a [Wiki CLI](https://github.com/wazootech/wiki) wiki. Run tools and cite output; do not guess.

Skills live outside `wiki.inputs` — they are agent procedural knowledge, not published wiki pages.

## Quick start

From the repo root (directory containing `wiki.yaml`):

```bash
bash skills/wiki-best-practices/scripts/audit.sh -c path/to/wiki.yaml
```

The script prefers `wiki` on PATH when it supports `fmt`; otherwise falls back to `uv run wiki` or `python -m wiki` (use the latter in this repo if a global PyPI install is stale).

In **this repo**: `-c docs/wiki.yaml`. For a single changed page, append file paths after the config flag.

Manual equivalent (strict CI order):

```bash
wiki -c path/to/wiki.yaml fmt --check
wiki -c path/to/wiki.yaml lint --strict -v
wiki -c path/to/wiki.yaml check --strict -v
wiki -c path/to/wiki.yaml render --check
# wiki link --check  — only when CI wires it (see below)
```

## Audit workflow

### 1. Locate scope

- Find `wiki.yaml` and read `wiki.inputs`, `lint:`, `check:`, `link.style`, `wiki.filename_pattern`.
- Skills under `skills/` are not wiki documents — do not index or build them.

### 2. Run the audit script

Use [`scripts/audit.sh`](scripts/audit.sh). It runs fmt → lint → check → render with `--strict` / `--check`, then scans `.github/workflows/` for `wiki link --check` and runs it only when wired.

Stop on first failure; report which stage failed and paste relevant CLI output.

### 3. Config semantics

| Block | Command | Purpose |
| ----- | ------- | ------- |
| `fmt:` | `wiki fmt` | Mechanical markdown (mdformat) |
| `lint:` | `wiki lint` | Conventions — links, filenames, headings |
| `check:` | `wiki check` | Integrity — SHACL, routes, layouts |

Regex belongs in `wiki.filename_pattern`, not under `check:`. Unknown keys should fail at load — do not suggest runtime migration shims.

### 4. Deploy alignment (custom wikis)

When auditing deploy-related pages or CI, cross-check workflow paths ([references/deploy-alignment.md](references/deploy-alignment.md)):

- `-c` points at the correct `wiki.yaml`
- `--site-base-url` matches the Pages path (`/wiki`, `/my-wiki`, or `''` for root)
- `upload-pages-artifact` `path` contains the built `index.html` tree

### 5. Manual spot-check

When `lint.*` rules are `off`, still note violations. Use the spot-check table below.

| Area | Best practice |
| ---- | ------------- |
| Filenames | Wikipedia-style (`Page_Name.md`); `index.md` only for folder routes |
| Headings | Title-case H1; sentence-case H2+; ATX `#` only |
| Links | Markdown `[text](Page.md)` when `link.style: markdown` |
| Frontmatter | `type` / shapes aligned; CURIEs use `graph.context` |
| SPARQL | People → `givenName`/`familyName`; TechArticle → `headline`/`description` |
| Prose | No `---` thematic breaks in body; `## References` on standard pages |

### 6. Fixes (explicit mutation only)

Never edit wiki files unless the user asks. Suggest:

- `wiki fmt` — apply formatting
- `wiki link --fix-broken` — repair unambiguous broken internal links (separate from lint reporting)
- `wiki link --apply` — insert suggested markdown links

`wiki link` enrichment is not a lint violation — keep it distinct from `lint.broken_links`.

## Report template

```markdown
## Wiki wiki audit — <wiki or path>

**Config:** <wiki.yaml path>
**Date:** <ISO date>

### Automated checks
| Check | Result | Notes |
| fmt --check | pass/fail | |
| lint --strict | pass/fail | |
| check --strict | pass/fail | |
| render --check | pass/fail | |
| link --check | skipped/pass/fail | only if CI wired |

### Config review
- <wiki.yaml observations>

### Manual findings
- [severity] <file>: <issue> — <fix>

### Recommended next steps
1. ...
```

Prioritize check failures and strict lint errors before style nits.

## References

- [references/deploy-alignment.md](references/deploy-alignment.md) — GitHub Pages and CI path checks
