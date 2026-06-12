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

Senior wiki **advisor, not implementer**. Run validators, cite evidence, deliver a prioritized findings report. The user or a later session applies fixes.

## Hard rules

1. **Never edit wiki pages** unless the user explicitly asks.
2. **Never guess** — cite CLI output or `file:line` for every finding.
3. **No config migration shims** — unknown `wiki.yaml` keys fail at load; document upgrades in CHANGELOG and wiki docs only.
4. **Skills are not wiki inputs** — do not index or build `skills/`.
5. **Stop after the report.** Deploy **setup** → name **wiki-deploy** (not relative paths like `../../wiki-deploy/`).

## Quick start

```bash
bash skills/wiki-improve/scripts/audit.sh -c path/to/wiki.yaml
# vendored: bash .agents/skills/wiki-improve/scripts/audit.sh -c path/to/wiki.yaml
```

Prefers `wiki` on PATH; else `uv run wiki` or `python -m wiki` (stale global install in this repo). Append file paths after `-c` to scope fmt, lint, and check. In **this repo**: `-c docs/wiki.yaml`.

[`scripts/audit.sh`](scripts/audit.sh) runs fmt → lint → check → render (`--strict` / `--check`), then `wiki link --check` only when wired in `.github/workflows/`. Stop on first failure; paste relevant CLI output.

| Block | Command | Purpose |
| ----- | ------- | ------- |
| `fmt:` | `wiki fmt` | Mechanical markdown |
| `lint:` | `wiki lint` | Conventions — links, filenames, headings |
| `check:` | `wiki check` | Integrity — SHACL, routes, layouts |

Regex belongs in `wiki.filename_pattern`, not under `check:`.

## Workflow

### 1. Recon

Read `wiki.yaml` (`wiki.inputs`, `lint:`, `check:`, `link.style`, `wiki.filename_pattern`). Scan `.github/workflows/` for wiki CI and whether `wiki link --check` is wired.

### 2. Audit

Run `audit.sh` (or equivalent commands). For deploy-related pages or CI, read [references/deploy-alignment.md](references/deploy-alignment.md). When `lint.*` is off, spot-check [references/style-spot-check.md](references/style-spot-check.md).

### 3. Vet

Confirm each finding against cited output. Drop false positives (intentional `wiki.yaml` relaxations, documented deploy tradeoffs). List rejected candidates under **Considered and rejected**.

### 4. Report

Use the template below. Order findings by leverage (integrity and strict lint before style). Categories: `integrity`, `conventions`, `formatting`, `config`, `deploy`, `docs`, `style`. Impact / effort: `H` / `M` / `L`. Optional **Direction**: 2–3 grounded sentences only.

**Repairs (user must ask first):** `wiki fmt`; `wiki link --fix-broken` (separate from lint); `wiki link --apply` (enrichment, not `lint.broken_links`).

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
- <candidate> — <why not reported>

### Direction (optional)
- <grounded suggestion>

### Recommended next steps
1. ...
```

## References

- [references/deploy-alignment.md](references/deploy-alignment.md) — deploy audit red flags
- [references/style-spot-check.md](references/style-spot-check.md) — conventions when lint rules are off
