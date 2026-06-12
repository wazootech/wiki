---
name: wiki-create
description: >-
  Scaffold a Wiki CLI workspace with wiki init, then walk through site name, first
  page, and light preferences. Use when the user wants a new wiki, wiki init,
  bootstrap semantic markdown, get started with a new vault, or customize an
  existing scaffold — even if they do not say "skill". Requires the wiki command
  on PATH.
---

# Create Wiki

Scaffold a new [Wiki CLI](https://github.com/wazootech/wiki) workspace: `wiki init` plus a short preferences wizard. Requires **`wiki` on PATH** (PyPI package `wazootech-wiki`).

Skills under `skills/` are agent procedural knowledge — not vault pages and not indexed by `wiki`.

## Modularity

This skill **only** scaffolds or customizes a workspace. When done, summarize and **stop**. Do not suggest installing the CLI or name other skills. If the CLI is missing, state the blocker and stop — the user chooses how to follow up.

## Resolve wiki command

Prefer `wiki` on PATH. In the **wiki-cli repository checkout** only, if global `wiki` is missing or stale:

```bash
uv run wiki --help
python -m wiki --help
```

Use the command that works for all steps below (`wiki`, `uv run wiki`, or `python -m wiki`).

## Prerequisite gate

Before init or file edits, verify the CLI:

```bash
wiki --help
```

If it fails:

1. Say that **creating a wiki requires the Wiki CLI on PATH**.
2. Optional one-liner: PyPI package name is **`wazootech-wiki`** (not a full install tutorial).
3. **Do not** run `wiki init`, write scaffold files, or paste a step-by-step pip guide.
4. **Do not** say “use wiki-install” or reference any skill path.
5. **Stop.**

## Workflow (CLI present)

Ask **one decision at a time** with a short explainer. Prefer **flags** over interactive `wiki init` prompts (stdin blocks agents).

### Choose mode

- **`wiki.yaml` absent** → Phase A (init) then Phase B (wizard).
- **`wiki.yaml` present** → **Wizard-only** (Phase B). Do not re-init unless the user explicitly wants `--force`.

### Phase A — Init

1. **Directory** — Confirm workspace root. `wiki init` writes to the **current directory** (`wiki.yaml`, `README.md`, `wiki/`, `layouts/`).
2. **Init options** — Gather flags before running (see [references/init-options.md](references/init-options.md)):

| Topic | When to ask | Flag |
| ----- | ----------- | ---- |
| GitHub Pages | User publishes to `{owner}.github.io/{repo}` | `--repo owner/repo` |
| Custom namespace | No GitHub / custom site | `--graph-context-wiki https://…/` and optional `--site-base-url` |
| Git repository | User wants `git init` now | `--git` (requires `git` on PATH) |
| Link style | Obsidian-style wikilinks vs markdown | `--link-style wikilink` (default: omit → markdown) |
| Site display name | Custom display title | `--site-manifest-name "My Title"` |
| Inputs directory | Custom markdown folder | `--vault-inputs myfolder` |
| Theme color | Manifest theme color | `--site-manifest-theme-color "#3b82f6"` |

If the user has no preference for namespace and no `--repo`, pass:

`--graph-context-wiki https://wiki.example.org/`

3. **Preflight** — Without `--force`, init fails if any exist:

- `wiki.yaml`
- `README.md`
- non-empty `wiki/`

If blocked, ask: different directory, or `wiki init --force` (overwrites scaffold files).

4. **Run** — Example:

```bash
wiki init --repo owner/repo --git
```

Capture stdout/stderr.

### Phase B — Preferences wizard

Gather **before init** when it affects flags (`--repo`, `--link-style`). **After init** for file edits:

| Topic | Action |
| ----- | ------ |
| Site display name | Edit `site.manifest.name` in `wiki.yaml` |
| First page | Replace or rename `wiki/Ethan_Davidson.md`, or add the user’s page |
| Lint strictness | Only if user asks — see [references/wiki-yaml-preferences.md](references/wiki-yaml-preferences.md) |

**Only edit files with explicit user approval.** After markdown or config edits, run `wiki fmt` on changed paths when a config exists.

### What init creates

- `wiki.yaml` — vault, graph, site, lint, fmt defaults
- `layouts/default.html`
- `wiki/Person_Shape.md`, `wiki/Ethan_Davidson.md`
- `README.md`

See [references/init-options.md](references/init-options.md) for full flag detail.

## Clean exit

Summarize: workspace path, init flags used, wizard edits (if any). Do not suggest daily commands (`check`, `lint`, `serve`) unless the user asks.

**Do not** run `wiki check`, `wiki lint`, or `wiki serve` unless the user asks.

## Troubleshooting

| Issue | Response |
| ----- | -------- |
| `wiki.yaml already exists` | Wizard-only, new directory, or `--force` with user consent |
| Invalid `--repo` | Fix `owner/repo` or use `--graph-context-wiki` |
| `--git` fails | Report error; init may have completed without git |
| Interactive prompt during init | Re-run with explicit flags — avoid bare `wiki init` in agent sessions |

## References

- [references/init-options.md](references/init-options.md) — `wiki init` flags and generated layout
- [references/wiki-yaml-preferences.md](references/wiki-yaml-preferences.md) — wizard `wiki.yaml` edits
