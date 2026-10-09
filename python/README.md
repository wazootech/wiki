# wazootech-wiki

`wazootech-wiki` 0.2.0 and later installs the [Wiki](https://github.com/wazootech/wiki)
CLI as a native binary, the way ruff and uv ship. Each platform wheel embeds the
standalone executable that `deno compile` builds from the Deno/TypeScript engine
and installs it as `wiki` on your `PATH`. No Python runs in the command's hot
path, and no Deno, Node.js, or download step is needed.

```sh
pip install wazootech-wiki
wiki init
wiki check
```

Wheels exist for Linux (glibc 2.27+), macOS 12+, and Windows, each on x64 and
ARM64. Elsewhere (musl Linux such as Alpine), pip installs a binary-less
fallback whose `wiki` runs a standalone `wazootech-wiki` from `PATH`, and says
so clearly when there is none.

A small typed Python API runs the same binary:

```python
import wiki

result = wiki.run(["check"], cwd="path/to/project")
if not result.ok:
    print(result.stderr)
```

`wiki.run` returns a `WikiResult` (`args`, `returncode`, `stdout`, `stderr`,
`ok`) and always decodes output as UTF-8. `wiki.create_wiki_command` returns
the argv without running it, and `wiki.find_runtime` reports which binary was
resolved. Set `WIKI_BINARY` to use a different binary.

To upgrade, run `pip install -U wazootech-wiki` (or `uv tool upgrade
wazootech-wiki`); `wiki upgrade` says the same for a pip-installed binary.

Upgrading from 0.1.x: 0.1.23 was the last Python engine release, and its
Python library API (`Wiki`, `wiki.audit`, and the rest) is gone. See the
Migration section of the
[changelog](https://github.com/wazootech/wiki/blob/main/CHANGELOG.md) and the
[Python API reference](https://github.com/wazootech/wiki/blob/main/docs/wiki/Python_API_Reference.md).
