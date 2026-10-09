---
type: TechArticle
headline: Python API Reference
description: The wazootech-wiki PyPI package, a typed Python binding that runs the Deno/TypeScript engine on a bundled Deno runtime.
---

# Python API Reference

From 0.2.0, the `wazootech-wiki` package on PyPI is a **binding**, not an engine. The wheel carries the Deno/TypeScript engine source and runs it on the Deno runtime from the [`deno`](https://pypi.org/project/deno/) PyPI package, the same way the npm package uses the `deno` npm package. No system Deno, Node.js, or second install step is needed.

Version 0.1.23 was the last Python engine release. Its library API (`Wiki`, `wiki.audit`, and the rest of the Python modules) is gone and is not coming back; the binding covers the CLI surface. See the Migration section of the [changelog](https://github.com/wazootech/wiki/blob/main/CHANGELOG.md).

## Install

Python 3.10 or newer:

```bash
pip install wazootech-wiki
wiki --help
```

`uv tool install wazootech-wiki` and `pipx install wazootech-wiki` install the same `wiki` command. Supported platforms are the ones the `deno` PyPI package ships wheels for: Windows x64, macOS on x64 or ARM64, and Linux on x64 or ARM64 with glibc.

The first run needs network access, as with the npm package: the engine's JSR/npm module graph is fetched into `DENO_DIR` on first use and cached afterwards.

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
- `wiki.find_runtime() -> Runtime` reports the resolved runtime as `Runtime(kind, executable)`.
- `wiki.WikiSetupError` is raised when no runtime is found or the packaged engine is missing, with a message that names the fix.

The package ships a `py.typed` marker, so the signatures are visible to type checkers. Command output is text: typed result payloads arrive with the structured `wiki check` output tracked in [#310](https://github.com/wazootech/wiki/issues/310).

## Runtime resolution

The binding looks for a runtime in this order:

1. the Deno binary from the `deno` PyPI dependency (the default);
2. `deno` on `PATH`;
3. a standalone `wazootech-wiki` executable from [GitHub Releases](https://github.com/wazootech/wiki/releases) on `PATH`, which already embeds the engine.

The first two run the packaged engine with the same flags as the npm package: `run --node-modules-dir=none --allow-all --config deno.json --lock deno.lock --frozen`.

## Related

- [Deno API Reference](Deno_API_Reference.md)
- [TypeScript API Reference](TypeScript_API_Reference.md)
- [Wiki Programmatic API](Wiki_Programmatic_API.md)
