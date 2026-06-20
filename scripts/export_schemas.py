"""Export Pydantic models to JSON Schema files.

Iterates CLI option models and domain models, writes ``model_json_schema(by_alias=True)``
output to ``docs/schemas/{name}.schema.json``.

Run from repo root::

    uv run python scripts/export_schemas.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

# Insert src so we can import the project
_src = Path(__file__).resolve().parent.parent / "src"
sys.path.insert(0, str(_src))

from wiki.schemas import (
    AuditReport,
    BuildOptions as DomainBuildOptions,
    BuildResult,
    CliBuildOptions,
    CliCheckOptions,
    CliExportOptions,
    CliFmtOptions,
    CliInitOptions,
    CliLinkOptions,
    CliLintOptions,
    CliMainOptions,
    CliQueryOptions,
    CliRenderOptions,
    CliServeOptions,
    CliUpgradeOptions,
    Config,
    ExportResult,
    FmtReport,
    InitOptions,
    Issue,
    LinkReport,
    RenderReport,
    ScaffoldResult,
)

SCHEMAS_DIR = Path("docs/schemas")

# (filename_stem, model_instance_getter)
SCHEMAS: list[tuple[str, type]] = [
    # CLI option models (aliased → camelCase for TS consumers)
    ("cli_main", CliMainOptions),
    ("cli_check", CliCheckOptions),
    ("cli_lint", CliLintOptions),
    ("cli_link", CliLinkOptions),
    ("cli_query", CliQueryOptions),
    ("cli_render", CliRenderOptions),
    ("cli_build", CliBuildOptions),
    ("cli_export", CliExportOptions),
    ("cli_serve", CliServeOptions),
    ("cli_init", CliInitOptions),
    ("cli_fmt", CliFmtOptions),
    ("cli_upgrade", CliUpgradeOptions),
    # Domain models (unaliased — snake_case, internal use)
    ("audit_report", AuditReport),
    ("build_options", DomainBuildOptions),
    ("build_result", BuildResult),
    ("config", Config),
    ("export_result", ExportResult),
    ("fmt_report", FmtReport),
    ("init_options", InitOptions),
    ("issue", Issue),
    ("link_report", LinkReport),
    ("render_report", RenderReport),
    ("scaffold_result", ScaffoldResult),
]


def export_schema(stem: str, model: type) -> None:
    """Write a single model's JSON Schema to disk."""
    schema = model.model_json_schema(by_alias=True)
    out = SCHEMAS_DIR / f"{stem}.schema.json"
    out.write_text(
        json.dumps(schema, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


def main() -> None:
    SCHEMAS_DIR.mkdir(parents=True, exist_ok=True)
    written: list[str] = []
    for stem, model in SCHEMAS:
        export_schema(stem, model)
        written.append(stem)
    print(f"Exported {len(written)} schemas to {SCHEMAS_DIR}/")
    for name in sorted(written):
        print(f"  {name}.schema.json")


if __name__ == "__main__":
    main()
