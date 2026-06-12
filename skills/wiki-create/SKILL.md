---
name: wiki-create
description: >-
  Scaffold a Wiki CLI workspace with wiki init, then walk through site name, first
  page, and light preferences. Use when the user wants a new wiki, wiki init,
  bootstrap semantic markdown, get started with a new wiki, or customize an
  existing scaffold — even if they do not say "skill". Requires the wiki command
  on PATH.
---

# Create Wiki

Scaffold a new [Wiki CLI](https://github.com/wazootech/wiki) workspace: `wiki init` plus a short preferences wizard. Requires **`wiki` on PATH** (PyPI package `wazootech-wiki`).

Skills under `skills/` are agent procedural knowledge — not wiki pages and not indexed by `wiki`.

## Modularity

This skill **only** scaffolds or customizes a workspace. When done, summarize and **stop**. Do not suggest installing the CLI or name other skills. If the CLI is missing, state the blocker and stop — the user chooses how to follow up.

## Resolve wiki command

Prefer `wiki` on PATH when `wiki fmt --help` succeeds (or `fmt` appears in `wiki --help`).

In the **wiki-cli repository checkout**, if PATH `wiki` is missing or stale (`--help` works but `fmt` fails), try:

```bash
uv run wiki --help
python -m wiki --help
```

Use the command that passes both `--help` and the `fmt` capability probe for all steps below (`wiki`, `uv run wiki`, or `python -m wiki`). If neither PATH nor checkout fallbacks work, stop and recommend upgrading **`wazootech-wiki`** (one-liner only — do not name other skills).

## Prerequisite gate

Before init or file edits, verify the CLI:

```bash
wiki --help
wiki fmt --help
```

If either fails:

1. Say that **creating a wiki requires a current Wiki CLI on PATH** (package **`wazootech-wiki`**).
2. If `--help` passes but `fmt` fails, note stale or shadowed `wiki` — upgrade/reinstall before init.
3. **Do not** run `wiki init`, write scaffold files, or paste a step-by-step pip guide.
4. **Do not** say “use wiki-install” or reference any skill path.
5. **Stop.**

## Workflow (CLI present)

Prefer **flags** over interactive `wiki init` prompts (stdin blocks agents). Ask **one decision at a time** for destructive or ambiguous choices (`--force`, overwrite README). Batch optional preferences when defaults are fine.

### Infer before asking

When context already supplies values, **do not re-prompt**:

- **`--repo owner/repo`** — from a GitHub repo attachment, `gh repo view --json nameWithOwner`, or `git remote get-url origin` (parse `github.com:owner/repo` or `github.com/owner/repo.git`)
- **Link style** — default to markdown (omit `--link-style`) unless the user asks for Obsidian wikilinks
- **Theme color, inputs dir, URL style** — skip unless the user wants customization

### Choose mode

- **`wiki.yaml` absent** → Phase A (init) then Phase B (wizard).
- **`wiki.yaml` present** → **Wizard-only** (Phase B). Do not re-init unless the user explicitly wants `--force`.

### Phase A — Init

1. **Directory** — Confirm workspace root. `wiki init` writes to the **current directory** (`wiki.yaml`, `README.md`, `wiki/`, `layouts/`).
2. **Init options** — Run `wiki init --help` (same resolved `wiki` command as above) and map the user’s answers to flags from the output. Prefer flags over bare `wiki init` — stdin prompts block agents.

**Optional preferences (one turn):** If not already inferred, ask link style (markdown vs Obsidian) and whether they want a custom site display name (`--site-manifest-name`). Only ask about theme color, inputs directory, or other flags when the user wants to customize.

| Topic | When to ask | Flag |
| ----- | ----------- | ---- |
| GitHub Pages | User publishes to `{owner}.github.io/{repo}` | `--repo owner/repo` |
| Custom namespace | No GitHub / custom site | `--graph-context-wiki https://…/` and optional `--site-base-url` |
| Git repository | User wants `git init` now | `--git` (requires `git` on PATH) |
| Link style | Obsidian wikilinks vs standard Markdown | `--link-style obsidian` (default: omit → `markdown`) |
| Site display name | Custom display title | `--site-manifest-name "My Title"` |
| Inputs directory | Custom markdown folder | `--wiki-inputs myfolder` |
| Theme color | Manifest theme color | `--site-manifest-theme-color "#3b82f6"` |
| URL style | File vs directory routes | `--site-url-style dir` or `file` |
| Content predicate | Body text RDF predicate | `--graph-content-predicate schema:articleBody` |
| Document IRIs | IRIs differ from `wiki:` namespace | `--graph-base-iri https://…/` |
| Implicit types | Wiki-wide default `rdf:type` CURIEs | `--graph-implicit-types schema:TechArticle` (repeatable) |
| Implicit types policy | Merge vs fallback for types | `--graph-implicit-types-policy append` or `fallback` |
| File extension in IRIs | Include `.md` in document URIs | `--graph-include-file-extension` |

If the user has no preference for namespace and no `--repo`, pass:

`--graph-context-wiki https://wiki.example.org/`

**URL resolution** (when `--graph-context-wiki` is omitted): `--graph-context-wiki` from flags always wins; else `--repo` or git `origin` when GitHub; else an interactive prompt (avoid in agent runs).

3. **Preflight** — Without `--force`, init fails if any exist:

- `wiki.yaml`
- `README.md`
- non-empty `wiki/`

If blocked by an existing `README.md` (common in repos initialized with a GitHub template), recover by: use an empty directory, temporarily rename/remove `README.md`, or `wiki init --force` with user consent (overwrites scaffold files including `README.md`).

4. **Run** — Example:

```bash
wiki init --repo owner/repo --git
```

Capture stdout/stderr.

### Post-init smoke (new scaffold only)

After Phase A succeeds, **default:** run `wiki check --strict` with the resolved wiki command (same `-c` / cwd as init).

- **Opt-out:** skip when the user explicitly declines in the same turn (e.g. “skip check”, “just init”).
- **On failure:** report CLI output; do not auto-fix; include in exit summary.
- **Wizard-only mode:** do not run this step.

### Phase B — Preferences wizard

Gather **before init** when it affects flags (`--repo`, `--link-style`). **After init** for file edits:

| Topic | Action |
| ----- | ------ |
| Site display name | Edit `site.manifest.name` in `wiki.yaml` |
| First page | Replace or rename `wiki/Ethan_Davidson.md`, or add the user’s page |
| Lint strictness | Only if user asks — see [references/wiki-yaml-preferences.md](references/wiki-yaml-preferences.md) |

**Only edit files with explicit user approval.** After markdown or config edits, run `wiki fmt` on changed paths when a config exists.

### What init creates

- `wiki.yaml` — wiki, graph, site, lint, fmt defaults
- `layouts/default.html.j2`
- `wiki/Person_Shape.md`, `wiki/Ethan_Davidson.md`
- `README.md`

## Post-init hygiene

With user approval, recommend:

- Add `_site/` to `.gitignore` (build output should not be committed)
- Do not commit `.agents/skills/` or other agent skill bundles unless the user explicitly wants them vendored in the repo

## Clean exit

Summarize: workspace path, init flags used, post-init `check --strict` result (if run), wizard edits (if any). Do not suggest `lint` or `serve` unless the user asks.

For GitHub Pages CI, the **wiki-deploy** skill is a separate step when they are ready — it is not part of scaffolding.

**Do not** run `wiki lint` or `wiki serve` unsolicited. **`wiki check --strict` after new init is the one default exception** (unless the user opts out).

## Troubleshooting

| Issue | Response |
| ----- | -------- |
| `wiki.yaml already exists` | Wizard-only, new directory, or `--force` with user consent |
| Invalid `--repo` | Fix `owner/repo` or use `--graph-context-wiki` |
| `--git` fails | Report error; init may have completed without git |
| Interactive prompt during init | Re-run with explicit flags — avoid bare `wiki init` in agent sessions |

## References

- [references/wiki-yaml-preferences.md](references/wiki-yaml-preferences.md) — wizard `wiki.yaml` edits
