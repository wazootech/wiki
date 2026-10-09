"""Locate a Deno runtime and build the argv that runs the packaged Wiki engine.

This is the Python twin of ``src/runtime.ts``. The engine is Deno-only, and
CPython cannot embed the Deno runtime, so every call crosses a process
boundary. This module keeps that boundary small and honest: it resolves a
runtime, checks the vendored engine is present, and returns an argv.
"""

from __future__ import annotations

import os
import shutil
import subprocess
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Literal, Union

ENGINE_ROOT = Path(__file__).resolve().parent / "_engine"
DENO_CONFIG = ENGINE_ROOT / "deno.json"
DENO_LOCK = ENGINE_ROOT / "deno.lock"
ENGINE_ENTRY = ENGINE_ROOT / "src" / "wiki" / "cli.ts"

#: The executable name a `deno compile` standalone from GitHub Releases is
#: expected to have once it is on ``PATH``.
STANDALONE_NAME = "wazootech-wiki"

RuntimeKind = Literal["bundled", "path", "standalone"]
StrPath = Union[str, "os.PathLike[str]"]


class WikiSetupError(RuntimeError):
    """Raised when no Deno runtime is found or the vendored engine is missing."""


@dataclass(frozen=True)
class Runtime:
    """The executable that runs the engine, and where it came from."""

    kind: RuntimeKind
    executable: str


@dataclass(frozen=True)
class WikiResult:
    """The outcome of one :func:`run` call."""

    args: tuple[str, ...]
    returncode: int
    stdout: str
    stderr: str

    @property
    def ok(self) -> bool:
        """``True`` when the CLI exited 0."""
        return self.returncode == 0


def _bundled_deno() -> str | None:
    """The binary from the ``deno`` PyPI dependency, if it is installed."""
    try:
        from deno import find_deno_bin
    except ImportError:
        return None
    try:
        return find_deno_bin()
    except FileNotFoundError:
        return None


def find_runtime() -> Runtime:
    """Resolve the runtime, in the order #325 specifies.

    1. the binary from the ``deno`` PyPI dependency (the default; matches npm)
    2. ``deno`` on ``PATH`` (a developer override)
    3. a ``deno compile`` standalone named ``wazootech-wiki`` on ``PATH``
    """
    bundled = _bundled_deno()
    if bundled is not None:
        return Runtime("bundled", bundled)
    on_path = shutil.which("deno")
    if on_path is not None:
        return Runtime("path", on_path)
    standalone = shutil.which(STANDALONE_NAME)
    if standalone is not None:
        return Runtime("standalone", standalone)
    raise WikiSetupError(
        "Unable to find a Deno runtime for the Wiki engine. wazootech-wiki "
        "depends on the `deno` PyPI package, which ships Deno for "
        "Windows/macOS/Linux on x64 or ARM64; reinstall wazootech-wiki to "
        "restore it, put `deno` on PATH, or put a standalone "
        f"`{STANDALONE_NAME}` binary from "
        "https://github.com/wazootech/wiki/releases on PATH."
    )


def create_wiki_command(args: Sequence[str]) -> list[str]:
    """Build the argv that runs the Wiki CLI with ``args``.

    Mirrors ``createWikiCommand`` in ``src/runtime.ts`` flag for flag. A
    standalone binary already embeds the engine, so it takes ``args`` directly.
    """
    if isinstance(args, str):
        raise TypeError("args must be a sequence of strings, not a string")
    runtime = find_runtime()
    if runtime.kind == "standalone":
        return [runtime.executable, *args]
    for name, path in (
        ("Deno config", DENO_CONFIG),
        ("Deno lockfile", DENO_LOCK),
        ("Wiki engine", ENGINE_ENTRY),
    ):
        if not path.is_file():
            raise WikiSetupError(
                f"The packaged {name} is missing at {path}. "
                "Reinstall wazootech-wiki."
            )
    return [
        runtime.executable,
        "run",
        "--node-modules-dir=none",
        "--allow-all",
        "--config",
        str(DENO_CONFIG),
        "--lock",
        str(DENO_LOCK),
        "--frozen",
        str(ENGINE_ENTRY),
        *args,
    ]


def run(
    args: Sequence[str],
    *,
    cwd: StrPath | None = None,
    env: Mapping[str, str] | None = None,
    input: str | None = None,
    timeout: float | None = None,
) -> WikiResult:
    """Run the Wiki CLI and capture its output.

    The engine writes UTF-8, so output is always decoded as UTF-8 rather than
    in the platform's locale codepage (see #326). A non-zero exit is returned,
    not raised; check :attr:`WikiResult.ok`.
    """
    command = create_wiki_command(args)
    completed = subprocess.run(
        command,
        cwd=cwd,
        env=None if env is None else dict(env),
        input=input,
        capture_output=True,
        encoding="utf-8",
        errors="replace",
        timeout=timeout,
        check=False,
    )
    return WikiResult(
        args=tuple(args),
        returncode=completed.returncode,
        stdout=completed.stdout,
        stderr=completed.stderr,
    )
