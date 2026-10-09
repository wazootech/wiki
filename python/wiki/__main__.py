"""The ``wiki`` console script: the Python twin of ``bin/wiki.js``."""

from __future__ import annotations

import subprocess
import sys
from collections.abc import Sequence

from ._runtime import WikiSetupError, create_wiki_command


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
    while True:
        try:
            code = child.wait()
            break
        except KeyboardInterrupt:
            # The child shares the console and gets the same Ctrl-C; let it
            # finish its own shutdown and report its exit code.
            continue
    # POSIX reports death-by-signal as -N; shells report it as 128 + N.
    return 128 - code if code < 0 else code


def entry() -> None:
    sys.exit(main())


if __name__ == "__main__":
    entry()
