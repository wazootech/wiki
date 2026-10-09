# wazootech-wiki (Python binding)

`wazootech-wiki` 0.2.0 and later is a typed Python binding for the
[Wiki](https://github.com/wazootech/wiki) CLI. It is **not** a Python engine:
the wheel carries the Deno/TypeScript engine source and runs it on the Deno
runtime from the [`deno`](https://pypi.org/project/deno/) PyPI package. No
system Deno, Node, or separate engine install is needed.

```sh
pip install wazootech-wiki
wiki init
wiki check
```

```python
import wiki

result = wiki.run(["check"], cwd="path/to/project")
if not result.ok:
    print(result.stderr)
```

`wiki.run` returns a `WikiResult` (`args`, `returncode`, `stdout`, `stderr`,
`ok`) and always decodes the engine's output as UTF-8. `wiki.create_wiki_command`
returns the argv without running it, and `wiki.find_runtime` reports which Deno
runtime was resolved.

Upgrading from 0.1.x: 0.1.23 was the last Python engine release, and its
Python library API (`Wiki`, `wiki.audit`, and the rest) is gone. See the
Migration section of the
[changelog](https://github.com/wazootech/wiki/blob/main/CHANGELOG.md) and the
[Python API reference](https://github.com/wazootech/wiki/blob/main/docs/wiki/Python_API_Reference.md).
