---
type: TechArticle
name: Letta MemFS
description: Git-backed markdown memory for Letta Code agents with a special system directory always loaded into context.
---

# Letta MemFS

**MemFS** (memory filesystem), also called a **context repository** in Letta marketing, is [Letta Code](https://docs.letta.com/letta-code/)’s git-backed memory system. An agent’s long-term state lives as a tree of markdown files in a local Git repository—human-readable, diffable, and versioned—instead of opaque memory blocks or a proprietary vector store alone. It is one variant of the broader [Agent_Memory_Filesystems](Agent_Memory_Filesystems.md) pattern and addresses the same agent-memory problem as the [LLM_Wiki](LLM_Wiki.md) pattern and [Supermemory_SMFS](Supermemory_SMFS.md), but optimizes for **deterministic, personalized coding agents** with clear always-on vs on-demand context.

Official reference: [MemFS | Letta Docs](https://docs.letta.com/letta-code/memfs). Overview: [Letta Code memory](https://docs.letta.com/letta-code/memory/). Announcement: [Context repositories blog](https://www.letta.com/blog/context-repositories).

## Design philosophy

MemFS treats memory as **a repo the agent edits with bash**, then commits. Letta API agents clone to `~/.letta/agents/<id>/memory` and push commits to sync with Letta Cloud; local-mode agents use `~/.letta/lc-local-backend/memfs/<id>/memory` (or `$LETTA_LOCAL_BACKEND_DIR`). Progressive disclosure keeps filenames and YAML `description` frontmatter visible while full file bodies load only when needed—similar in spirit to agent “skills” with `SKILL.md` metadata.

MemFS is default for new Letta Code agents (v0.15+) on the Letta API and in local mode. It is **not** available on Docker-server deployments (legacy memory blocks remain). Migrate with `/memfs enable`.

## The `system/` directory

The distinguishing layout rule:

- **`system/`** — Every markdown file here is loaded **in full** into the system prompt on **every** turn (persona, user preferences, core project facts).
- **Outside `system/`** — The agent sees the tree and descriptions; contents are pulled in only when relevant.

The agent is expected to **move files** between `system/` and the rest of the tree as it learns what must stay hot vs what can stay lazy. Changes take effect after a **Git commit** (and push for API agents).

Example frontmatter on a memory file:

```yaml
---
description: Coding preferences learned during /init
---
```

## Bootstrap and evolution

- **`/init`** — Subagent workflow that crawls the codebase and captures preferences; seeds the repository.
- **Agent-driven hierarchy** — Unlike SMFS’s heavier background graph updates, MemFS relies on the agent (and you, in an editor) to curate structure over time.
- **Human-in-the-loop** — Open the memory folder in VS Code or Cursor and edit markdown directly; Git history provides audit and rollback.

## Comparison with [Wiki CLI](Wiki_CLI.md) and [Supermemory_SMFS](Supermemory_SMFS.md)

Choose MemFS when you run **Letta Code** and want Git-auditable, human-editable agent memory with a crisp hot/cold split and an always-on `system/` slice. Choose the Wiki CLI when you want a **shared, schema-checked wiki** with [Second_Brain](Second_Brain.md)-style linking and semantic web tooling independent of a single agent runtime.

For the full cross-tool comparison, see [Agent_Memory_Filesystems](Agent_Memory_Filesystems.md).

## Sources

| Resource             | Link                                            |
| -------------------- | ----------------------------------------------- |
| MemFS reference      | https://docs.letta.com/letta-code/memfs         |
| Memory overview      | https://docs.letta.com/letta-code/memory/       |
| Context repositories | https://www.letta.com/blog/context-repositories |
