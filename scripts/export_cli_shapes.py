"""Print CLI command → option names as JSON, derived from Pydantic models.

Usage:
    uv run python scripts/export_cli_shapes.py

Output is a JSON object mapping command names to sorted option names
(matching the ``alias`` in each Pydantic field, which is the camelCase
name that TypeScript consumers use).
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

_src = Path(__file__).resolve().parent.parent / "src"
sys.path.insert(0, str(_src))

from wiki.schemas import COMMAND_MODELS  # noqa: E402 — path inserted above

manifest: dict[str, list[str]] = {}
for cmd_name, model_cls in sorted(COMMAND_MODELS.items()):
    fields: list[str] = []
    for field_name, field_info in model_cls.model_fields.items():
        alias = field_info.alias or field_name
        fields.append(alias)
    manifest[cmd_name] = sorted(fields)

json.dump(manifest, sys.stdout, indent=2)
sys.stdout.write("\n")
