"""Emit a normalized JSON manifest of the wiki CLI surface via Click introspection."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import click
from click.core import ParameterSource

# Insert src so we can import the CLI module
_src = Path(__file__).resolve().parent.parent / "src"
sys.path.insert(0, str(_src))

from wiki.__init__ import __version__
from wiki.cli import main as cli_main
from wiki.format_choice import FormatChoice


def _json_safe(value: object) -> object:
    """Convert Click-internal defaults to JSON-safe values."""
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, (tuple, list)) and not value:
        return None
    if isinstance(value, ParameterSource):
        return None
    return None


def _infer_type(param: click.Parameter) -> str:
    if isinstance(param, click.Argument):
        return "path[]" if param.nargs == -1 else "path"
    if param.is_flag:
        return "bool"
    if isinstance(param.type, FormatChoice):
        return "choice"
    if isinstance(param.type, click.Choice):
        return "choice"
    if param.multiple:
        return "string[]"
    return "str"


def _export_option(param: click.Parameter) -> dict:
    info: dict = {"name": param.name}

    if isinstance(param, click.Argument):
        info["positional"] = True
        info["type"] = _infer_type(param)
        info["required"] = param.required
        info["nargs"] = param.nargs
        return info

    info["flags"] = list(param.opts) if param.opts else [f"--{param.name.replace('_', '-')}"]
    info["type"] = _infer_type(param)

    if param.secondary_opts:
        info["negation_flags"] = list(param.secondary_opts)

    default = _json_safe(param.default)
    if default is not None:
        info["default"] = default

    if param.multiple:
        info["multiple"] = True

    if isinstance(param.type, FormatChoice):
        info["choices"] = list(param.type.choices)
        info["aliases"] = dict(param.type.FORMAT_ALIASES)
    elif isinstance(param.type, click.Choice):
        info["choices"] = list(param.type.choices)

    return info


def export_command(cmd: click.Command) -> dict:
    info: dict = {"name": cmd.name, "options": []}
    for param in cmd.params:
        info["options"].append(_export_option(param))
    return info


def main() -> None:
    manifest: dict = {
        "tool": "wiki",
        "version": __version__,
        "root_options": [_export_option(p) for p in cli_main.params],
        "commands": [],
    }

    for name in sorted(cli_main.commands):
        cmd = cli_main.get_command(None, name)
        if cmd is not None:
            manifest["commands"].append(export_command(cmd))

    json.dump(manifest, sys.stdout, indent=2)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
