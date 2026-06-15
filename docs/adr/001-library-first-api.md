# ADR 001: Library-first API with CLI as thin wrapper

**Status:** Accepted  
**Date:** 2026-06-15  
**Issue:** [#112](https://github.com/wazootech/wiki/issues/112)

## Context

Wiki CLI (`wazootech-wiki`) compiles markdown wikis into RDF, validates with SHACL, and publishes static HTML. Domain logic already lives in modules outside `cli.py`, but:

- The public Python surface is undeclared (`wiki/__init__.py` exports only `__version__`).
- Operation outputs use loose `dict[str, Any]` while config inputs are Pydantic models.
- `cli.py` mixes orchestration, Click prompts, and presentation (~990 lines).
- Tests import ~30 internal modules directly with no stability contract.

Architecture decision [#44](https://github.com/wazootech/wiki/issues/44) keeps Python as the engine source of truth; this ADR defines how that engine is exposed programmatically.

## Decision

1. **Library first, CLI as wrapper** — stable operations live in importable modules; Click handles args, stdout, exit codes, and interactive prompts only.
2. **`Workspace` session** — `wiki.workspace.Workspace` wraps loaded `Config` and graph lifecycle for in-process use.
3. **Typed reports** — `AuditReport`, `Issue`, and operation-specific result models in `wiki.schemas.reports` replace audit dicts.
4. **Public exports** — curated `wiki.__all__`; semver applies to symbols listed there.
5. **Flat module layout** — keep `wiki.audit`, `wiki.site`, etc.; add `wiki.publish`, `wiki.workspace`, `wiki.cli_output` rather than deep renames.
6. **Issue codes** — stable machine-readable `Issue.code` aligned with config rule keys (`broken_links`, `shacl_violation`, …).

## CLI vs library responsibilities

| Concern | Library | CLI |
|---------|---------|-----|
| Config load | `Config.load`, `Workspace.load` | `-c`, `--wiki-inputs` |
| Validation | `run_check`, `run_lint` → `AuditReport` | `--strict`, `-v`, silence on success |
| Graph | `Workspace.graph()` | `--reload`, `--cache`, `--no-inference` |
| Build | `build_workspace()` → `BuildResult` | `--output-dir`, verbose path listing |
| Init | `scaffold_workspace()` → `ScaffoldResult` | prompts, `--force`, `--git` |
| Output | structured results / exceptions | `click.echo`, `sys.exit` |

## Public API (initial)

Exported from `wiki` package:

- `Config`, `Workspace`, `InitOptions`
- `AuditReport`, `Issue`
- `build_workspace`, `scaffold_workspace`
- `run_check`, `run_lint` (via `wiki.audit` re-export)

**Internal** (no semver guarantee): modules prefixed with `_`, test-only helpers, HTML builders not listed in `__all__`.

## Appendix: CLI subcommand → library mapping

| Subcommand | Library operation |
|------------|-------------------|
| `check` | `Workspace.check()` / `run_check` |
| `lint` | `Workspace.lint()` / `run_lint` |
| `link` | `run_link` |
| `query` | `Workspace.graph()` + `run_query` |
| `render` | `render_workspace` |
| `build` | `build_workspace` |
| `export` | `export_documents` |
| `init` | `scaffold_workspace` |
| `fmt` | `format_files` |
| `serve` | `run_server` |
| `upgrade` | `perform_upgrade` |

## Consequences

- Tests can target library contracts without subprocess CLI harnesses.
- Breaking change: audit dict API removed; callers use `AuditReport`.
- Agent skills and npm wrapper can document programmatic entry points.
- `py.typed` marker added for PEP 561 consumers.
