"""``python -m wiki``, and the ``wiki`` console script of the fallback wheel.

A platform wheel installs the Wiki binary itself as ``wiki``, so this module
is not in that hot path; it serves ``python -m wiki`` everywhere, and is the
``wiki`` command only in the binary-less ``py3-none-any`` wheel. Its process
handling mirrors ``bin/wiki.js``: signals are forwarded and exit codes match.
"""

from __future__ import annotations

import os
import signal
import subprocess
import sys
from collections.abc import Sequence

from ._runtime import LAUNCHER_ENV, WikiSetupError, child_env, create_wiki_command

#: Signals forwarded to the binary, as ``bin/wiki.js`` does. A ``kill`` aimed
#: at this process alone would otherwise orphan the child.
FORWARDED_SIGNALS = (signal.SIGINT, signal.SIGTERM)


def main(argv: Sequence[str] | None = None) -> int:
    """Run the Wiki CLI with inherited stdio and return its exit code."""
    if os.environ.get(LAUNCHER_ENV):
        # Everything this package starts carries the marker, so a launcher
        # that sees it was started by a launcher: WIKI_BINARY or
        # `wazootech-wiki` on PATH resolves back to Python, and continuing
        # would recurse without end.
        print(
            "Error: the wazootech-wiki launcher started itself. WIKI_BINARY or "
            "`wazootech-wiki` on PATH is the Python launcher, not a Wiki binary; "
            "point it at a standalone binary from "
            "https://github.com/wazootech/wiki/releases.",
            file=sys.stderr,
        )
        return 1
    try:
        command = create_wiki_command(sys.argv[1:] if argv is None else argv)
    except WikiSetupError as error:
        print(f"Error: {error}", file=sys.stderr)
        return 1
    try:
        child = subprocess.Popen(command, env=child_env())
    except OSError as error:
        print(f"Unable to start the Wiki CLI: {error}", file=sys.stderr)
        return 1
    previous = {}
    if os.name == "posix":
        for signum in FORWARDED_SIGNALS:
            previous[signum] = signal.signal(
                signum, lambda received, _frame: child.send_signal(received)
            )
    try:
        while True:
            try:
                code = child.wait()
                break
            except KeyboardInterrupt:
                # Windows: the child shares the console and gets the same
                # Ctrl-C; let it finish its own shutdown and report its code.
                continue
    finally:
        for signum, handler in previous.items():
            signal.signal(signum, handler)
    # POSIX reports death-by-signal as -N; shells report it as 128 + N, which
    # is also what `bin/wiki.js` returns (130 for SIGINT, 143 for SIGTERM).
    return 128 - code if code < 0 else code


def entry() -> None:
    sys.exit(main())


if __name__ == "__main__":
    entry()
