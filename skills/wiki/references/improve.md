# Wiki Improve

Senior wiki **advisor, not implementer**. Run validators, cite evidence, deliver a prioritized findings report. The user or a later session applies fixes.

## Hard rules

1. **Never edit wiki pages** unless the user explicitly asks.
2. **Never guess** — cite CLI output or `file:line` for every finding.
3. **No config migration shims** — unknown wiki config keys fail at load; document upgrades in CHANGELOG and wiki docs only.
4. **Skills are not wiki inputs** — do not index or build `skills/`.
5. **Stop after the report.** Deploy setup → read [deploy.md](deploy.md) when the user asks (not in the same turn unless they asked for deploy).

## Quick start

```bash
bash skills/wiki/scripts/audit.sh -c path/to/wiki.yml
# vendored: bash .agents/skills/wiki/scripts/audit.sh -c path/to/wiki.yml
```

Run `verify-cli.sh` first if wiki command resolution is unclear. Prefers `wiki` on PATH; checkout fallbacks: `uv run wiki`, `python -m wiki`; else `npx wazootech-wiki`. In **this repo**: `-c docs/wiki.yml`. Legacy `wiki.yaml` also loads when passed to `-c`.

[`scripts/audit.sh`](../scripts/audit.sh) runs fmt → lint → check → render, then `wiki link --check` only when wired in `.github/workflows/`. Stop on first failure; paste relevant CLI output.

| Block | Command | Purpose |
| ----- | ------- | ------- |
| `fmt:` | `wiki fmt` | Mechanical markdown |
| `lint:` | `wiki lint` | Conventions — links, filenames, headings |
| `check:` | `wiki check` | Integrity — SHACL, JSON Schema, routes, layouts |

Regex belongs in `wiki.filename_pattern`, not under `check:`.

## Workflow

### Recon

Read wiki config (`wiki.yml` or legacy `wiki.yaml`): `wiki.inputs`, `lint:`, `check:`, `link.style`, `wiki.filename_pattern`, `site:`. Scan `.github/workflows/` for wiki CI and whether `wiki link --check` is wired.

When config load fails (unknown keys): report as **`config`** finding with full error text; point to CHANGELOG Migration and [Wiki Configuration](https://github.com/wazootech/wiki/blob/main/docs/wiki/Wiki_Configuration.md). Do not suggest runtime rename hints or automated migration commands.

Flag removed branding surface as **`config`** findings: `site.manifest`, `site.title`, `site.theme_color`; Jinja `{{ site.manifest.* }}` in layouts; `<link rel="manifest">` expecting `manifest.webmanifest`.

### Audit

Run `audit.sh` (or equivalent commands). For deploy-related pages or CI, read [alignment-checklist.md](alignment-checklist.md). When `lint.*` is off, spot-check [style-spot-check.md](style-spot-check.md).

### Vet

Confirm each finding against cited output. Drop false positives. List rejected candidates under **Considered and rejected**.

### Report

Use the template below. Order findings by leverage. Categories: `integrity`, `conventions`, `formatting`, `config`, `deploy`, `docs`, `style`. Impact / effort: `H` / `M` / `L`.

**Repairs (user must ask first):** `wiki fmt`; `wiki link --fix-broken`; `wiki link --apply`.

```markdown
## Wiki improve — <wiki or path>

**Config:** <wiki.yml path>
**Date:** <ISO date>

### Automated checks
| Check | Result | Notes |
| fmt --check | pass/fail | |
| lint --strict | pass/fail | |
| check --strict | pass/fail | |
| render --check | pass/fail | |
| link --check | skipped/pass/fail | only if CI wired |

### Config review
- <wiki config observations>

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
