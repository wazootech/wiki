---
type: TechArticle
headline: Wiki Programmatic API
description: Stable Python library entry points for loading a wiki, validating, building, and scaffolding without subprocess CLI.
---

# Wiki Programmatic API

Wiki CLI (`wazootech-wiki`) exposes a **library-first** Python API for CI pipelines, tests, and agent automation. The `wiki` command remains the primary user surface; library calls return typed results and raise domain exceptions instead of printing or exiting.

See [Design Philosophies](Design_Philosophies.md) for the CLI vs library split. Semver applies to symbols in `wiki.__all__` (listed below); other `wiki.*` modules are internal unless documented on this page.

## Install and imports

```bash
pip install wazootech-wiki
```

Import stable symbols from the top-level package:

```python
from wiki import Workspace, AuditReport, BuildOptions, build_workspace
```

Symbols listed in `wiki.__all__` are semver-stable. Other modules (`wiki.site`, `wiki.graph`, …) are internal unless documented here.

The package ships a [PEP 561](https://peps.python.org/pep-0561/) marker (`py.typed`).

## Workspace session

`Workspace` wraps a loaded [Config](Wiki_Configuration.md) and graph lifecycle:

```python
from pathlib import Path
from wiki import Workspace

ws = Workspace.load("wiki.yml")
# or override inputs (same as --wiki-inputs):
ws = Workspace.load("wiki.yml", wiki_inputs=["docs/wiki"])

report = ws.check()
if not report.ok:
    for issue in report.errors:
        print(issue.code, issue.path, issue.message)

# File-scoped check (SHACL + JSON Schema per file; no full-wiki-only rules):
report = ws.check([Path("docs/wiki/Some_Page.md")])

lint_report = ws.lint()
preflight = ws.preflight()  # lint merged with check — same as wiki build preflight

graph = ws.graph(infer=True, reload=False)
```

Runtime overrides (global `-b` / `--url-style`):

```python
ws = ws.with_runtime(base_url="/wiki", url_style="dir")
```

## Validation reports

`run_check`, `run_lint`, and `Workspace.check` / `.lint` return an `AuditReport`:

| Field      | Meaning                                      |
| ---------- | -------------------------------------------- |
| `ok`       | No errors (warnings allowed unless promoted) |
| `errors`   | List of `Issue` with `severity="error"`      |
| `warnings` | List of `Issue` with `severity="warning"`    |

Each `Issue` has a stable machine-readable `code` (aligned with config rule keys such as `broken_links`, `shacl_violation`, `frontmatter_schema`) and a human `message` for CLI-style output.

```python
from wiki import run_check, Config

config = Config.load(Path("wiki.yml"))
report = run_check(config)
strict = report.apply_strict()  # promote warnings to errors
errors, warnings = report.messages()
merged = report.merge(other_report)
```

## Build

```python
from pathlib import Path
from wiki import Workspace, BuildOptions, build_workspace

ws = Workspace.load("wiki.yml")
result = build_workspace(
    ws,
    BuildOptions(
        output_dir=Path("_site"),
        render_first=False,
        skip_preflight=False,
        verbose=False,
    ),
)
if not result.ok:
    # preflight AuditReport on result.preflight when lint/check failed
    ...
print(result.page_count, result.written_paths)
```

`BuildError` is raised when the output directory overlaps wiki inputs or config root.

## Link, render, export, and format

```python
from wiki import LinkOptions, run_link, render_workspace, export_documents, format_files

link_report = run_link(ws, None, LinkOptions(check=True))
render_report = render_workspace(ws, None, check_only=True)
export_result = export_documents(ws, None, rdf_format="turtle", mode="expanded")
fmt_report = format_files(ws, None, check_only=True)
```

## Scaffold

Init logic is available without Click prompts when options are already resolved:

```python
from pathlib import Path
from wiki import InitOptions, scaffold_workspace

options = InitOptions(...)  # see wiki.schemas.init
result = scaffold_workspace(Path.cwd(), options, force=False)
print(result.written_paths)
```

Interactive `wiki init` still owns prompts, `--git`, and preflight guards in the CLI.

## Layout slot contract

Page layouts substitute `%wiki.*%` slots. `build_layout_context` validates a typed `LayoutContext` (internal schema in `wiki.schemas.layout`) before markup and slot substitution. The contract boundary for tests and downstream layout tools is `wiki.site.layout_tokens.build_layout_token_map`. Contract tests assert the context key tree, markup paths, and that every slot in packaged layouts is produced by that map. See [Wiki Configuration](Wiki_Configuration.md#layout-slots).

## Exceptions

| Exception      | Typical cause                          |
| -------------- | -------------------------------------- |
| `WikiError`    | Base class for domain failures         |
| `BuildError`   | Unsafe or overlapping build output dir |
| `UpgradeError` | Frozen binary or pip upgrade failure   |

## CLI parity

Library operations mirror subcommands documented under [Wiki CLI](Wiki_CLI.md). The CLI adds silence-on-success, `--strict`, pipe formats, and exit codes. For agent workflows that shell out, prefer `skills/wiki/scripts/audit.sh`; for in-process CI, prefer `Workspace` and typed reports.

## Related

- [Wiki CLI](Wiki_CLI.md) — command reference
- [Wiki Configuration](Wiki_Configuration.md) — config semantics
- [Design Philosophies](Design_Philosophies.md) — silent success, composable stdout
