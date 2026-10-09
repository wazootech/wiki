"""Locate the Wiki binary and build the argv that runs it.

Each platform wheel embeds the ``deno compile`` standalone for its target in
``.data/scripts/``, so pip installs it as ``wiki`` (``wiki.exe``) straight onto
``PATH`` with no Python in between, the way ruff and uv ship. This module is
for Python callers: it finds that installed binary and runs it.

The ``py3-none-any`` fallback wheel, which pip picks only where no platform
wheel fits (musl Linux, for example), carries no binary. Its ``wiki`` console
script is :mod:`wiki.__main__`, which runs a standalone ``wazootech-wiki``
from ``PATH``.
"""

from __future__ import annotations

import os
import shutil
import subprocess
import sysconfig
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from importlib.metadata import PackageNotFoundError, distribution
from pathlib import Path
from typing import Literal, Union

try:
    # Written into each wheel by `scripts/build_wheel.py`; absent from a
    # source checkout or a plain `pip install .`, which build the fallback.
    from ._build import BUNDLED, TARGET
except ImportError:  # pragma: no cover - only outside a built wheel
    BUNDLED, TARGET = False, None

#: The name of the standalone binary on GitHub Releases, as the fallback wheel
#: expects to find it on ``PATH``. ``wiki`` itself is never looked up: in the
#: fallback wheel it is this launcher, and running it would recurse.
STANDALONE_NAME = "wazootech-wiki"

#: Set in the environment of every binary this package starts. A launcher
#: that starts with it already set has been pointed back at itself.
LAUNCHER_ENV = "WAZOOTECH_WIKI_LAUNCHER"

RuntimeKind = Literal["env", "bundled", "path"]
StrPath = Union[str, "os.PathLike[str]"]


class WikiSetupError(RuntimeError):
    """Raised when no Wiki binary can be found for this install."""


@dataclass(frozen=True)
class Runtime:
    """The binary that runs the Wiki CLI, and where it came from."""

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


def _binary_name() -> str:
    return "wiki" + (".exe" if os.name == "nt" else "")


def _bundled_binary() -> Path | None:
    """The binary this wheel installed, wherever pip put the scripts.

    The dist-info ``RECORD`` holds the installed path of every file, the
    binary included, so it is right for venvs, ``--user``, ``--prefix``, and
    ``uv tool`` alike. The ``sysconfig`` scripts directories are the fallback
    for an installer that wrote no usable ``RECORD``.
    """
    name = _binary_name()
    try:
        files = distribution("wazootech-wiki").files or []
    except PackageNotFoundError:
        files = []
    for entry in files:
        if entry.name == name and ".." in entry.parts:
            located = Path(str(entry.locate())).resolve()
            if located.is_file():
                return located
    for scheme in (sysconfig.get_default_scheme(), f"{os.name}_user"):
        try:
            scripts = sysconfig.get_path("scripts", scheme)
        except KeyError:
            continue
        candidate = Path(scripts) / name
        if candidate.is_file():
            return candidate
    return None


def find_runtime() -> Runtime:
    """Resolve the Wiki binary, first match wins.

    1. ``WIKI_BINARY``: an explicit path to a Wiki binary
    2. the binary embedded in this platform wheel
    3. in the fallback wheel only, a standalone ``wazootech-wiki`` on ``PATH``
    """
    override = os.environ.get("WIKI_BINARY")
    if override:
        if not Path(override).is_file():
            raise WikiSetupError(f"WIKI_BINARY is set to {override}, which is not a file.")
        return Runtime("env", override)
    if BUNDLED:
        bundled = _bundled_binary()
        if bundled is None:
            raise WikiSetupError(
                f"The Wiki binary this wheel ships for {TARGET} is missing "
                "from the scripts directory. Reinstall wazootech-wiki."
            )
        return Runtime("bundled", str(bundled))
    on_path = shutil.which(STANDALONE_NAME)
    if on_path is not None:
        return Runtime("path", on_path)
    raise WikiSetupError(
        "wazootech-wiki has no Wiki binary for this platform (there are wheels "
        "for Linux glibc, macOS, and Windows on x64 and ARM64; musl Linux, "
        f"such as Alpine, has none). Put a standalone `{STANDALONE_NAME}` on "
        "PATH, or set WIKI_BINARY to one. Standalone binaries: "
        "https://github.com/wazootech/wiki/releases."
    )


def create_wiki_command(args: Sequence[str]) -> list[str]:
    """Build the argv that runs the Wiki CLI with ``args``."""
    if isinstance(args, str):
        raise TypeError("args must be a sequence of strings, not a string")
    return [find_runtime().executable, *args]


def child_env(env: Mapping[str, str] | None = None) -> dict[str, str]:
    """``env`` (default ``os.environ``), marked so a recursive launch fails."""
    marked = dict(os.environ if env is None else env)
    marked[LAUNCHER_ENV] = "1"
    return marked


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
        env=child_env(env),
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
