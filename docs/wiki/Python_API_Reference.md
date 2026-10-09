---
type: TechArticle
headline: Python API Reference
description: The wazootech-wiki PyPI package, which installs the Wiki CLI as a native binary and adds a typed Python API for running it.
---

# Python API Reference

From 0.2.0, the `wazootech-wiki` package on PyPI ships the Wiki CLI as a **native binary**, not a Python engine, the way ruff and uv ship. Each platform wheel embeds the standalone executable that `deno compile` builds from the Deno/TypeScript engine, and pip installs it as `wiki` directly on `PATH`: no Python runs between you and the binary, and no Deno, Node.js, or download step is needed. A small `wiki` Python package beside it finds that binary and runs it.

Version 0.1.23 was the last Python engine release. Its library API (`Wiki`, `wiki.audit`, and the rest of the Python modules) is gone and is not coming back; the package covers the CLI surface. See the Migration section of the [changelog](https://github.com/wazootech/wiki/blob/main/CHANGELOG.md).

## Install

Python 3.10 or newer:

```bash
pip install wazootech-wiki
wiki --help
```

`uv tool install wazootech-wiki` and `pipx install wazootech-wiki` install the same `wiki` command. There is one wheel per platform, about 47–52 MB each:

| Platform                   | Wheel tag                |
| -------------------------- | ------------------------ |
| Linux x64 (glibc 2.27+)    | `manylinux_2_27_x86_64`  |
| Linux ARM64 (glibc 2.27+)  | `manylinux_2_27_aarch64` |
| macOS 12+ on Intel         | `macosx_12_0_x86_64`     |
| macOS 12+ on Apple silicon | `macosx_12_0_arm64`      |
| Windows x64                | `win_amd64`              |
| Windows ARM64              | `win_arm64`              |

The glibc and macOS floors are measured from the compiled binaries (their newest `GLIBC_` symbol version and their `LC_BUILD_VERSION`), and the wheel build refuses a binary that needs more than its tag promises.

### Other platforms

Elsewhere, musl-based Linux such as Alpine above all, pip installs a binary-less `py3-none-any` wheel. Its `wiki` command is a Python launcher that runs a standalone `wazootech-wiki` from `PATH`; `deno compile` has no musl target, so that binary has to come from you. Without one, `wiki` exits 1 with a message saying so. Set `WIKI_BINARY` to a binary's path to point the launcher at one off `PATH`.

## Upgrade

`wiki upgrade` recognizes a binary pip installed (its path is listed in the `wazootech-wiki` dist-info `RECORD`) and prints `pip install -U wazootech-wiki` (or `uv tool upgrade wazootech-wiki`) instead of replacing the file, the same deferral the npm package gets.

## Run the CLI from Python

```python
import wiki

result = wiki.run(["check"], cwd="path/to/project")
if not result.ok:
    print(result.stderr)
```

- `wiki.run(args, *, cwd=None, env=None, input=None, timeout=None) -> WikiResult` runs the Wiki CLI and captures its output. Output is always decoded as UTF-8, whatever the platform's locale codepage. A non-zero exit is returned rather than raised.
- `WikiResult` is a frozen dataclass with `args`, `returncode`, `stdout`, `stderr`, and an `ok` property.
- `wiki.create_wiki_command(args) -> list[str]` returns the argv without running it, for callers that manage the process themselves.
- `wiki.find_runtime() -> Runtime` reports the resolved binary as `Runtime(kind, executable)`, where `kind` is `env`, `bundled`, or `path`.
- `wiki.WikiSetupError` is raised when no binary is found, with a message that names the fix.

`python -m wiki` runs the CLI too. The package ships a `py.typed` marker, so the signatures are visible to type checkers. Command output is text: typed result payloads arrive with the structured `wiki check` output tracked in [#310](https://github.com/wazootech/wiki/issues/310).

## Binary resolution

The package looks for the binary in this order:

1. `WIKI_BINARY`, an explicit path;
2. the binary this platform wheel installed, located through the dist-info `RECORD`, so venvs, `--user`, and `uv tool` installs all resolve;
3. in the fallback wheel only, a standalone `wazootech-wiki` on `PATH`.

`wiki` on `PATH` is never looked up, because in the fallback wheel it is the launcher itself. Every binary the package starts carries a marker in its environment, so a launcher pointed back at itself (for example a `WIKI_BINARY` naming the launcher) exits 1 instead of recursing.

## Related

- [Deno API Reference](Deno_API_Reference.md)
- [TypeScript API Reference](TypeScript_API_Reference.md)
- [Wiki Programmatic API](Wiki_Programmatic_API.md)
