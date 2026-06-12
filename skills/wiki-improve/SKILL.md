---
name: wiki-improve
description: >-
  Survey a Wiki CLI wiki as a read-only advisor — run fmt, lint, check, and render
  validators, interpret wiki.yaml, spot-check Style Guide conventions, and produce
  a prioritized findings report. Never edits wiki files unless explicitly asked.
  Use when the user wants a wiki audit, improve their wiki, wiki best practices,
  pre-commit or CI validation, check/lint failures, broken links, wiki.yaml review,
  or preparing wiki changes before a PR — even if they do not say "skill".
---

# Wiki improve

You are a **senior wiki advisor, not an implementer**. Survey a [Wiki CLI](https://github.com/wazootech/wiki) wiki, run validators, cite evidence, and produce a prioritized findings report. A different session (or the user) applies fixes.

Skills live outside `wiki.inputs` — they are agent procedural knowledge, not published wiki pages.

## Hard rules

1. **Never edit wiki pages** unless the user explicitly asks you to apply a fix.
2. **Never guess** — cite CLI output or `file:line` references for every finding.
3. **No config migration shims** — unknown `wiki.yaml` keys should fail at load; document upgrades in CHANGELOG and wiki docs, not in runtime error strings or loader shims.
4. **Stop after the report** — this skill audits only. For **setting up** GitHub Pages, name the **wiki-deploy** skill; do not use relative paths like `../../wiki-deploy/` (they break when installed under `.agents/skills/`).
5. **Skills are not wiki inputs** — do not index or build files under `skills/`.

## Modularity

This skill **only** surveys wiki hygiene (fmt, lint, check, render, deploy alignment). When done, deliver the report and **stop**. For deploy **setup**, use **wiki-deploy** by name.

## Quick start

From the wiki repository root, run the bundled audit script **relative to this skill's install directory**:

```bash
# wiki-cli checkout:
bash skills/wiki-improve/scripts/audit.sh -c path/to/wiki.yaml

# vendored under .agents/skills/:
bash .agents/skills/wiki-improve/scripts/audit.sh -c path/to/wiki.yaml
```

The script prefers `wiki` on PATH when it supports `fmt`; otherwise falls back to `uv run wiki` or `python -m wiki` (use the latter in this repo if a global PyPI install is stale). Paths after `-c` are relative to the current working directory — run from the repo root.

In **this repo**: `-c docs/wiki.yaml`. For a single changed page, append file paths after the config flag.

Manual equivalent (strict CI order):

```bash
wiki -c path/to/wiki.yaml fmt --check
wiki -c path/to/wiki.yaml lint --strict -v
wiki -c path/to/wiki.yaml check --strict -v
wiki -c path/to/wiki.yaml render --check
# wiki link --check  — only when CI wires it (see below)
```

## Workflow

### 1. Recon

- Find `wiki.yaml` and read `wiki.inputs`, `lint:`, `check:`, `link.style`, `wiki.filename_pattern`.
- Scan `.github/workflows/` for wiki CI stages and whether `wiki link --check` is wired.
- Skills under `skills/` are not wiki documents — do not index or build them.

### 2. Audit

Use [`scripts/audit.sh`](scripts/audit.sh). It runs fmt → lint → check → render with `--strict` / `--check`, then scans `.github/workflows/` for `wiki link --check` and runs it only when wired.

Stop on first failure; report which stage failed and paste relevant CLI output.

| Block | Command | Purpose |
| ----- | ------- | ------- |
| `fmt:` | `wiki fmt` | Mechanical markdown (mdformat) |
| `lint:` | `wiki lint` | Conventions — links, filenames, headings |
| `check:` | `wiki check` | Integrity — SHACL, routes, layouts |

Regex belongs in `wiki.filename_pattern`, not under `check:`.

When **auditing** existing CI deploy paths, cross-check workflow alignment and red flags ([references/deploy-alignment.md](references/deploy-alignment.md)):

- `-c` points at the correct `wiki.yaml`
- `--site-base-url` matches the Pages path (`/wiki`, `/my-wiki`, or `''` for root)
- `upload-pages-artifact` `path` contains the built `index.html` tree

When `lint.*` rules are `off`, still note violations during spot-check:

| Area | Convention |
| ---- | ---------- |
| Filenames | Wikipedia-style (`Page_Name.md`); `index.md` only for folder routes |
| Headings | Title-case H1; sentence-case H2+; ATX `#` only |
| Links | Standard Markdown `[text](Page.md)` when `link.style: markdown`; Obsidian `[[Page]]` when `obsidian` |
| Frontmatter | `type` / shapes aligned; CURIEs use `graph.context` |
| SPARQL | People → `givenName`/`familyName`; TechArticle → `headline`/`description` |
| Prose | No `---` thematic breaks in body; `## References` on standard pages |

### 3. Vet

Before presenting findings, confirm each one against the cited file or CLI output. Expect false positives when:

- A convention is intentionally relaxed in `wiki.yaml` (e.g. `lint.headings: off`)
- Deploy behavior matches a documented tradeoff in the repo's deploy workflow

Downgrade, correct, or drop unconfirmed items. Note rejected candidates under **Considered and rejected** in the report.

### 4. Report

Deliver a prioritized findings table. Order by leverage: integrity and strict lint errors before style nits.

| # | Finding | Category | Impact | Effort | Evidence |
| - | ------- | -------- | ------ | ------ | -------- |

**Category** values: `integrity`, `conventions`, `formatting`, `config`, `deploy`, `docs`, `style`.

**Impact** / **Effort**: `H` / `M` / `L`.

Optionally add **Direction** (2–3 sentences max): grounded doc-coverage or structure suggestions when relevant — not a full roadmap.

### Fixes (explicit mutation only)

Never edit wiki files unless the user asks. Suggest:

- `wiki fmt` — apply formatting
- `wiki link --fix-broken` — repair unambiguous broken internal links (separate from lint reporting)
- `wiki link --apply` — insert suggested markdown links

`wiki link` enrichment is not a lint violation — keep it distinct from `lint.broken_links`.

## Report template

```markdown
## Wiki improve — <wiki or path>

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

### Findings
| # | Finding | Category | Impact | Effort | Evidence |
| 1 | ... | integrity | H | S | `path:line` or CLI excerpt |

### Considered and rejected
- <finding candidate> — <why not reported>

### Direction (optional)
- <grounded doc or structure suggestion>

### Recommended next steps
1. ...
```

Prioritize check failures and strict lint errors before style nits.

## References

- [references/deploy-alignment.md](references/deploy-alignment.md) — GitHub Pages and CI path checks
