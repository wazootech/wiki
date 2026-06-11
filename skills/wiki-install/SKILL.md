---
name: wiki-install
description: >-
  Install and verify the Wiki CLI (wazootech-wiki on PyPI). Use when the user needs
  to install wiki, wiki is not found on PATH, pip or PyPI setup, or the CLI is
  missing — even if they do not say "skill".
---

# Install Wiki CLI

Install and verify the [Wiki CLI](https://github.com/wazootech/wiki) (`wiki` command, PyPI package **`wazootech-wiki`**).

Skills under `skills/` are agent procedural knowledge — not vault pages and not indexed by `wiki`.

## Modularity

This skill **only** installs and verifies the CLI. When done, say the CLI is ready and **stop**. Do not suggest creating a wiki, scaffolding a vault, or any follow-on task. Do not name other skills or skills paths.

## Workflow

### 1. Detect

Run:

```bash
wiki --help
```

If that succeeds, the CLI is already installed. Confirm briefly (help output or version if available), then tell the user:

**Wiki CLI is installed and ready to go.**

Exit.

### 2. Install (CLI missing)

Tell the user the CLI was not found. Give the standard install block:

```bash
pip install wazootech-wiki
wiki --help
```

You may offer to run `pip install wazootech-wiki` **only if the user explicitly approves** (network and environment vary).

**Contributors in the wiki-cli repository** may instead use:

```bash
uv pip install -e .
uv run wiki --help
```

Use `uv run wiki` only when the current working directory is this checkout and the user is developing the CLI — not as the default for end users.

### 3. Verify

After install (user-run or agent-run with approval), run `wiki --help` again.

- **Success** → **Wiki CLI is installed and ready to go.** Exit.
- **Failure** → Report the error output. Exit. The user chooses whether to retry, fix their environment, or ask again.

## Do not

- Suggest `wiki init`, creating a workspace, or daily workflow commands as a required next step.
- Auto-run `pip install` without user approval.
- Duplicate full vault or configuration documentation.
