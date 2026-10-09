"""The ``wiki`` console script: the Python twin of ``bin/wiki.js``."""

from __future__ import annotations

import os
import signal
import subprocess
import sys
from collections.abc import Sequence

from ._runtime import WikiSetupError, create_wiki_command

#: Signals forwarded to the engine, as ``bin/wiki.js`` does. A ``kill`` aimed
#: at this process alone would otherwise orphan the Deno child.
FORWARDED_SIGNALS = (signal.SIGINT, signal.SIGTERM)


def main(argv: Sequence[str] | None = None) -> int:
    """Run the Wiki CLI with inherited stdio and return its exit code."""
    try:
        command = create_wiki_command(sys.argv[1:] if argv is None else argv)
    except WikiSetupError as error:
        print(error, file=sys.stderr)
        return 1
    try:
        child = subprocess.Popen(command)
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
