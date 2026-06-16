# Programmatic API (Python)

Use the CLI for agent workflows (`audit.sh`, `verify-cli.sh`). Use the library when CI or tests need in-process calls without subprocess overhead.

```python
from pathlib import Path
from wiki import Workspace, BuildOptions, build_workspace

ws = Workspace.load("wiki.yml")
if not ws.preflight().ok:
    raise SystemExit("preflight failed")

result = build_workspace(ws, BuildOptions(output_dir=Path("_site")))
```

Stable exports: `Workspace`, `AuditReport`, `Issue`, `build_workspace`, `run_check`, `run_lint`, `scaffold_workspace`, and related report types — see `wiki.__all__`.

Full reference: [Wiki Programmatic API](https://github.com/wazootech/wiki/blob/main/docs/wiki/Wiki_Programmatic_API.md).
