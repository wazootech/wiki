---
name: wiki-install
description: >-
  Install and verify the Wiki CLI (wazootech-wiki on PyPI). Use when the user needs
  to install wiki, wiki is not found on PATH, pip or PyPI setup, or the CLI is
  missing — even if they do not say "skill".
---

# Install Wiki CLI

Install and verify the [Wiki CLI](https://github.com/wazootech/wiki) (`wiki` command, PyPI package **`wazootech-wiki`**).

Skills under `skills/` are agent procedural knowledge — not wiki pages and not indexed by `wiki`.

## Modularity

This skill **only** installs and verifies the CLI. When done, say the CLI is ready and **stop**. Do not suggest creating a wiki, scaffolding a wiki, or any follow-on task. Do not name other skills or skills paths.

## Workflow

### Detect

Run:

```bash
wiki --help
```

If that fails, go to **Install (CLI missing)** below.

If `--help` succeeds, run the **capability probe**:

```bash
wiki fmt --help
```

(or confirm `fmt` appears in `wiki --help` output)

- **Both pass** → confirm briefly, then **`wiki` is on PATH and ready to go.** Exit.
- **`--help` passes but `fmt` fails** → stale or wrong `wiki` on PATH; go to **Stale CLI** below (do not say ready-to-go).

### Install (CLI missing)

Tell the user the CLI was not found. Offer install paths in this order unless the user prefers otherwise:

**PyPI (requires Python 3.12+):**

```bash
pip install wazootech-wiki
wiki --help
wiki fmt --help
```

**Standalone binary (no Python):** download the archive for their OS from [GitHub Releases](https://github.com/wazootech/wiki/releases), verify `SHA256SUMS`, extract, and run `./wiki --help` (or `wiki.exe` on Windows).

You may offer to run `pip install wazootech-wiki` **only if the user explicitly approves** (network and environment vary).

If `wiki upgrade --yes` reports a standalone-binary message (`pip upgrade is not available`), point them to GitHub Releases instead of pip.

**Contributors in the Wiki CLI repository** may instead use:

```bash
uv pip install -e .
uv run wiki --help
```

Use `uv run wiki` only when the current working directory is this checkout and the user is developing the CLI — not as the default for end users.

### Verify

After install (user-run or agent-run with approval), run `wiki --help` and `wiki fmt --help` again.

- **Both pass** → **`wiki` is on PATH and ready to go.** Exit.
- **Failure** → Report the error output. Exit. The user chooses whether to retry, fix their environment, or ask again.

### Stale CLI (`--help` works, `fmt` missing)

Treat as an outdated or shadowed install — not ready:

1. Recommend `pip install --upgrade wazootech-wiki` or `python3 -m pip install --upgrade wazootech-wiki` (with user approval).
2. When the package is installed: `wiki upgrade --check` then `wiki upgrade --yes` (unless standalone binary — use GitHub Releases).
3. On Windows, multiple `wiki.exe` on PATH can shadow the upgraded install — run `where wiki` (or `which wiki`) and align PATH with the Python environment that owns `wazootech-wiki`.
4. Re-run capability probe before saying ready-to-go.

### Install troubleshooting

If `pip install` fails:

1. Confirm Python 3.12+: `python3 --version`
2. Retry with module invocation: `python3 -m pip install wazootech-wiki`
3. Optional isolated install: `pipx install wazootech-wiki` (when pipx is available)
4. Fallback: standalone binary from [GitHub Releases](https://github.com/wazootech/wiki/releases)

If an IDE-integrated pip or package tool fails but the user approves a terminal install, prefer **`python3 -m pip install wazootech-wiki` in the user’s shell** — especially on macOS with a system or python.org Python where sandboxed agent tools cannot write to site-packages.

| Issue | Response |
| ----- | -------- |
| `wiki --help` works but `fmt` missing | Stale or wrong `wiki` on PATH — upgrade/reinstall per **Stale CLI** |

## Do not

- Suggest `wiki init`, creating a workspace, or daily workflow commands as a required next step.
- Auto-run `pip install` without user approval.
- Say **ready to go** when the capability probe fails.
- Duplicate full wiki or configuration documentation.
