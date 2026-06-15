# Create Wiki

Scaffold a new [Wiki CLI](https://github.com/wazootech/wiki) workspace: `wiki init` (Phase A) plus a tweak step (Phase B). Requires **`wiki` on PATH** (PyPI package `wazootech-wiki`).

This workflow **only** scaffolds or customizes a workspace. When done, summarize and **stop**. If the CLI is missing, state the blocker and stop — read [install.md](install.md) only when the user wants install help.

## Resolve wiki command

Run `bash skills/wiki/scripts/verify-cli.sh` first.

Prefer `wiki` on PATH when exit code is `0`. In the **Wiki CLI repository checkout**, if PATH `wiki` is missing or stale, try `uv run wiki` or `python -m wiki`. If neither works, stop and recommend upgrading **`wazootech-wiki`** (one-liner only).

## Prerequisite gate

Before init or file edits:

```bash
wiki --help
wiki fmt --help
```

If either fails:

1. Say that **creating a wiki requires `wiki` on PATH** (install Wiki CLI — package **`wazootech-wiki`**).
2. If `--help` passes but `fmt` fails, note stale or shadowed `wiki` — upgrade/reinstall before init.
3. **Do not** run `wiki init`, write scaffold files, or paste a step-by-step pip guide.
4. **Stop.**

## Workflow (CLI present)

Prefer **flags** over interactive `wiki init` prompts (stdin blocks agents). Batch optional config preferences when defaults are fine; branding belongs in Phase B.

### Infer before asking

When context already supplies values, **do not re-prompt**:

- **`--repo owner/repo`** — from a GitHub repo attachment, `gh repo view --json nameWithOwner`, or `git remote get-url origin`
- **Link style** — default to standard page links (omit `--link-style`) unless the user asks for wikilinks
- **Logo, theme, sidebar title** — Phase B tweak comments (not init flags)
- **Inputs dir, URL style** — skip unless the user wants customization at init

### Choose mode

- **`wiki.yml` and `wiki.yaml` absent** → Phase A (init) then Phase B (tweak).
- **Either config file present** → **Wizard-only** (Phase B). Do not re-init; init requires a clean directory.

### Phase A — Init

1. **Directory** — Confirm workspace root. `wiki init` writes to the **current directory**.
2. **Init options** — Run `wiki init --help` and map answers to **config flags** only. Prefer flags over bare `wiki init`.

| Topic | When to ask | Flag |
| ----- | ----------- | ---- |
| GitHub Pages | User publishes to `{owner}.github.io/{repo}` | `--repo owner/repo` |
| Custom namespace | No GitHub / custom site | `--graph-context-wiki https://…/` and optional `--site-base-url` |
| Git repository | User wants `git init` now | `--git` |
| Link style | Wikilinks vs standard page links | `--link-style wikilink` |
| Page layout | Vector UI vs minimal | `--site-layout wikipedia` or `minimal` |
| Inputs directory | Custom markdown folder | `--wiki-inputs myfolder` |
| URL style | File vs directory routes | `--site-url-style dir` or `file` |
| Content predicate | Body text RDF predicate | `--graph-content-predicate schema:articleBody` |
| Document IRIs | IRIs differ from `wiki:` namespace | `--graph-base-iri https://…/` |
| Implicit types | Wiki-wide default `rdf:type` CURIEs | `--graph-implicit-types schema:TechArticle` (repeatable) |
| Implicit types policy | Merge vs fallback | `--graph-implicit-types-policy append` or `fallback` |
| File extension in IRIs | Include `.md` in document URIs | `--graph-include-file-extension` |

If no preference for namespace and no `--repo`, pass `--graph-context-wiki https://wiki.example.org/`.

3. **Preflight** — Init fails if `wiki.yml`, `wiki.yaml`, `README.md`, or non-empty `wiki/` exist. Use a new directory or remove those files first.
4. **Run** — Example: `wiki init --repo owner/repo --git`

### Post-init smoke (new scaffold only)

After Phase A succeeds, **default:** run `wiki check --strict` with the resolved wiki command.

- **Opt-out:** skip when the user explicitly declines (e.g. “skip check”, “just init”).
- **On failure:** report CLI output; do not auto-fix.
- **Wizard-only mode:** do not run this step.

### Phase B — Tweak

Edit scaffold files marked with `<!-- wiki tweak: … -->` comments (with user approval):

| Topic | Action |
| ----- | ------ |
| Logo letter | Edit `<!-- wiki tweak: logo letter -->` in `assets/logo.svg` |
| Theme color | Edit globeGrad/gridGrad stops in `assets/logo.svg`; match `theme-color` meta in layout |
| Sidebar title | Edit `<!-- wiki tweak: site display name -->` in `layouts/wikipedia.html` (or your `site.layout` file) |
| First page | Replace `wiki/Ethan_Davidson.md` (starter includes a tweak comment) or add the user's page |
| Config extras | Uncomment optional blocks in `wiki.yml` — see [wiki-config-preferences.md](wiki-config-preferences.md) |
| Lint strictness | Only if user asks — see [wiki-config-preferences.md](wiki-config-preferences.md) |

**Only edit files with explicit user approval.** After markdown or config edits, run `wiki fmt` on changed paths.

### What init creates

- `wiki.yml`, `layouts/wikipedia.html`, `assets/logo.svg` (with tweak comments)
- `wiki/Person_Shape.md`, `wiki/Ethan_Davidson.md`, `README.md`

## Post-init hygiene

With user approval, recommend adding `_site/` to `.gitignore`. Do not commit `.agents/skills/` unless the user explicitly wants vendored skills.

## Clean exit

Summarize: workspace path, init flags used, post-init `check --strict` result (if run), tweak edits (if any). For GitHub Pages CI, read [deploy.md](deploy.md) when the user is ready — not part of scaffolding.

**Do not** run `wiki lint` or `wiki serve` unsolicited. **`wiki check --strict` after new init is the one default exception** (unless the user opts out).

## Troubleshooting

| Issue | Response |
| ----- | -------- |
| `wiki.yml` or `wiki.yaml` already exists | Wizard-only (Phase B) or use a new directory |
| `README.md` or non-empty `wiki/` blocks init | New directory or remove conflicting files |
| Invalid `--repo` | Fix `owner/repo` or use `--graph-context-wiki` |
| `--git` fails | Report error; init may have completed without git |
| Interactive prompt during init | Re-run with explicit flags |
