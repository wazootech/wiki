"""Python binding for the Wiki CLI.

``wazootech-wiki`` 0.2.0 and later ships the Wiki CLI as a native binary, not
a Python engine: each platform wheel embeds the ``deno compile`` standalone
for its target and installs it as ``wiki``. This package finds that binary and
runs it. See ``docs/wiki/Python_API_Reference.md``.
"""

from __future__ import annotations

from importlib.metadata import PackageNotFoundError, version

from ._runtime import (
    Runtime,
    WikiResult,
    WikiSetupError,
    create_wiki_command,
    find_runtime,
    run,
)

try:
    __version__ = version("wazootech-wiki")
except PackageNotFoundError:  # pragma: no cover - running from a bare checkout
    __version__ = "0.0.0"

__all__ = [
    "Runtime",
    "WikiResult",
    "WikiSetupError",
    "__version__",
    "create_wiki_command",
    "find_runtime",
    "run",
]
