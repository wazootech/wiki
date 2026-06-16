# Programmatic API (Python)

Use the CLI for agent workflows (`audit.sh`, `verify-cli.sh`). Use the library when CI or tests need in-process calls without subprocess overhead.

```python
from pathlib import Path
from wiki import Wiki

w = Wiki.load("wiki.yml")
if not w.preflight().ok:
    raise SystemExit("preflight failed")

result = w.build(output_dir=Path("_site"))
```

Stable exports: `Wiki`, `AuditReport`, `Issue`, `build_workspace`, `run_check`, `run_lint`, `scaffold_workspace`, and related report types — see `wiki.__all__`.

Full reference: [Wiki Programmatic API](https://github.com/wazootech/wiki/blob/main/docs/wiki/Wiki_Programmatic_API.md).
