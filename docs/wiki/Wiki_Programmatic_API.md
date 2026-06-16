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
from wiki import Wiki, AuditReport, BuildResult
```

Symbols listed in `wiki.__all__` are semver-stable. Other modules (`wiki.site`, `wiki.graph`, …) are internal unless documented here.

The package ships a [PEP 561](https://peps.python.org/pep-0561/) marker (`py.typed`).

## Wiki session

`Wiki` wraps a loaded [Config](Wiki_Configuration.md) and graph lifecycle:

```python
from pathlib import Path
from wiki import Wiki

w = Wiki.load("wiki.yml")
# or override inputs (same as --wiki-inputs):
w = Wiki.load("wiki.yml", wiki_inputs=["docs/wiki"])

report = w.check()
if not report.ok:
    for issue in report.errors:
        print(issue.code, issue.path, issue.message)

# File-scoped check (SHACL + JSON Schema per file; no full-wiki-only rules):
report = w.check([Path("docs/wiki/Some_Page.md")])

lint_report = w.lint()
preflight = w.preflight()  # lint merged with check — same as wiki build preflight

graph = w.graph(infer=True, reload=False)
```

Runtime overrides (global `-b` / `--url-style`):

```python
w = w.with_runtime(base_url="/wiki", url_style="dir")
```

## Validation reports

`run_check`, `run_lint`, and `Wiki.check` / `.lint` return an `AuditReport`:

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

Invoke builds directly on the `Wiki` instance using CLI-aligned arguments:

```python
from pathlib import Path
from wiki import Wiki

w = Wiki.load("wiki.yml")
result = w.build(
    output_dir=Path("_site"),
    render=False,
    no_check=False,
    verbose=False,
)
if not result.ok:
    # preflight AuditReport on result.preflight when lint/check failed
    ...
print(result.page_count, result.written_paths)
```

Alternatively, use the low-level functional entry point:

```python
from wiki import BuildOptions, build_workspace

result = build_workspace(w, BuildOptions(output_dir=Path("_site"), skip_preflight=False))
```

`BuildError` is raised when the output directory overlaps wiki inputs or config root.

## Link, render, export, format, and query

`Wiki` instances expose direct, option-free methods for executing wiki operations matching the CLI parameters:

```python
# Run on the whole wiki with clean OOP methods:
link_report = w.link(check=True)
render_report = w.render(check=True)
export_result = w.export(format="turtle", mode="expanded")
fmt_report = w.format(check=True)

# Run a SPARQL query directly:
query_res = w.query("SELECT ?s WHERE { ?s ?p ?o }")

# Start local server:
w.serve(port=8080)

# Or target specific files:
from pathlib import Path
fmt_report = w.format([Path("docs/wiki/Some_Page.md")])
```

Alternatively, use functional entry points:

```python
from wiki import LinkOptions, run_link, render_workspace, export_documents, format_files

link_report = run_link(w, options=LinkOptions(check=True))
render_report = render_workspace(w, check_only=True)
export_result = export_documents(w, rdf_format="turtle", mode="expanded")
fmt_report = format_files(w, check_only=True)
```

## Scaffold

Init logic is available as a static helper:

```python
from pathlib import Path
from wiki import Wiki, InitOptions

options = InitOptions(...)  # see wiki.schemas.init
result = Wiki.init(Path.cwd(), options, git=False)
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

Library operations mirror subcommands documented under [Wiki CLI](Wiki_CLI.md). The CLI adds silence-on-success, `--strict`, pipe formats, and exit codes. For agent workflows that shell out, prefer `skills/wiki/scripts/audit.sh`; for in-process CI, prefer `Wiki` and typed reports.

## Related

- [Wiki CLI](Wiki_CLI.md) — command reference
- [Wiki Configuration](Wiki_Configuration.md) — config semantics
- [Design Philosophies](Design_Philosophies.md) — silent success, composable stdout
