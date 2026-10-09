"""Python binding for the Wiki CLI.

``wazootech-wiki`` 0.2.0 and later is a binding, not an engine: it runs the
Deno/TypeScript engine (vendored in this package) on the Deno runtime from the
``deno`` PyPI package. See ``docs/wiki/Python_API_Reference.md``.
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
