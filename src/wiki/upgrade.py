"""Self-upgrade logic: version check (pure Python) and pip upgrade (subprocess)."""

from __future__ import annotations

import json
import ntpath
import os
import shutil
import subprocess
import sys
import sysconfig
from pathlib import PureWindowsPath
from importlib.metadata import version
from urllib.error import URLError
from urllib.request import urlopen

import click

PYPI_JSON_URL = "https://pypi.org/pypi/wazootech-wiki/json"
PACKAGE_NAME = "wazootech-wiki"


def get_current_version() -> str | None:
    """Return the installed version string, or None if package not found."""
    try:
        return version(PACKAGE_NAME)
    except Exception:
        return None


def get_latest_version() -> str | None:
    """Return the latest version on PyPI, or None on network error."""
    try:
        with urlopen(PYPI_JSON_URL, timeout=10) as resp:
            data = json.loads(resp.read().decode())
        return data["info"]["version"]
    except (URLError, OSError, json.JSONDecodeError, KeyError):
        return None


def check_version() -> tuple[str | None, str | None, bool]:
    """Return (current, latest, is_outdated).

    If either version is unobtainable, the corresponding value is None and
    is_outdated is False.
    """
    current = get_current_version()
    latest = get_latest_version()

    if current is not None and latest is not None:
        is_outdated = _parse_version(latest) > _parse_version(current)
    else:
        is_outdated = False

    return current, latest, is_outdated


def get_windows_path_mismatch_warning() -> str | None:
    """Return a warning when PATH resolves `wiki` outside this interpreter's scripts dir."""
    if os.name != "nt":
        return None

    resolved = shutil.which("wiki")
    scripts_dir = sysconfig.get_path("scripts")
    if not resolved or not scripts_dir:
        return None

    resolved_path = PureWindowsPath(ntpath.normpath(resolved))
    scripts_path = PureWindowsPath(ntpath.normpath(scripts_dir))
    normalized_resolved_parent = PureWindowsPath(ntpath.normcase(str(resolved_path.parent)))
    normalized_scripts_path = PureWindowsPath(ntpath.normcase(str(scripts_path)))

    if normalized_resolved_parent == normalized_scripts_path:
        return None

    return (
        "Warning: PATH resolves `wiki` to a different scripts directory than the current Python "
        f"environment.\n"
        f"  PATH wiki: {resolved_path}\n"
        f"  Current Python scripts: {scripts_path}\n"
        "If `wiki upgrade` or newer subcommands are missing, PATH may be preferring a stale launcher.\n"
        "Check with `Get-Command wiki` or `where.exe wiki`, then run `python -m wiki upgrade -y` "
        "or remove the stale `wiki.exe`."
    )


def _parse_version(v: str) -> tuple[int, ...]:
    """Convert '0.1.4' -> (0, 1, 4) for comparison. Ignores pre/post tags."""
    parts = v.split(".")[:3]
    while len(parts) < 3:
        parts.append("0")
    result: list[int] = []
    for p in parts:
        try:
            result.append(int(p))
        except ValueError:
            result.append(0)
    return tuple(result)


def perform_upgrade(verbose: bool) -> None:
    """Run 'pip install --upgrade wazootech-wiki' in a subprocess."""
    cmd = [sys.executable, "-m", "pip", "install", "--upgrade", PACKAGE_NAME]
    if verbose:
        click.echo(f"Running: {' '.join(cmd)}")
        subprocess.check_call(cmd)
    else:
        subprocess.check_call(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
