---
type: TechArticle
name: Supermemory SMFS
description: Agent memory exposed as a mountable filesystem backed by Supermemory's semantic graph and vector index.
---

# Supermemory SMFS

**SMFS** (Supermemory Filesystem) is an open-source layer that exposes a [Supermemory](https://supermemory.ai/) container as a directory agents can treat like normal files. Agents use familiar tools (`ls`, `cat`, `grep`) instead of wiring a vector-database SDK or reloading entire chat histories into context. It targets the same problem as the [LLM_Wiki](LLM_Wiki.md) pattern—**long-term, stateful memory for agents**—but optimizes for cloud-backed semantic retrieval and multi-modal ingestion rather than a local, RDF-validated markdown vault.

Official docs: [SMFS overview](https://supermemory.ai/docs/smfs/overview). Source: [github.com/supermemoryai/smfs](https://github.com/supermemoryai/smfs).

## Design philosophy

SMFS is a **RAG-augmented context layer**: a knowledge graph and vector index sit behind a POSIX-like surface. The goal is to combine structured file-tree navigation with semantic ranking so agents spend fewer tokens and miss fewer relevant facts at scale. Background sync and graph maintenance are largely automatic (“dynamic dreaming” and entity updates on the Supermemory side), so the agent is not solely responsible for rewriting flat memory files after every session.

## Architecture

| Aspect                     | SMFS                                                                                                                                   |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **Storage**                | Supermemory API, semantic graph, hosted vector index                                                                                   |
| **Surface**                | Mount via **FUSE** (Linux) or **NFSv3 on localhost** (macOS); or `@supermemory/bash` / `supermemory-bash` where mounting is impossible |
| **Local cache**            | SQLite-backed cache; bidirectional sync (default pull ~30s)                                                                            |
| **Version control**        | No Git as source of truth; durability and history live in the cloud container                                                          |
| **Docker / devcontainers** | Supported for mount mode                                                                                                               |

Typical workflow:

```bash
curl -fsSL https://smfs.ai/install | bash
smfs login
smfs mount agent_memory
```

Files under configured **memory paths** (for example `user.md`, `memory.md`, or custom `--memory-paths`) are distilled and indexed by Supermemory; ordinary paths behave more like a synced file tree.

## How agents experience it

- **Semantic grep** — Intercepted `grep` runs meaning-ranked search across the container; standard flags can force literal string match.
- **`profile.md`** — Virtual root file: a live, token-lean digest of the container the agent can `cat` instead of walking every subtree.
- **Multi-modal** — PDFs, images, and other types can be ingested; text representations become searchable through the same shell tools.

## Comparison with [Wiki CLI](Wiki_CLI.md) and [Letta_MemFS](Letta_MemFS.md)

| Dimension                 | [Wiki CLI](Wiki_CLI.md)                                     | SMFS                                                            | [Letta_MemFS](Letta_MemFS.md)                   |
| ------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------- | ----------------------------------------------- |
| **Primary artifact**      | Interlinked `.md` + YAML-LD frontmatter in *your* repo      | Files in a mounted Supermemory container                        | Markdown in a **Git** context repo              |
| **Retrieval**             | [SPARQL](SPARQL.md), [SHACL](SHACL.md), explicit links      | Semantic grep + cloud graph                                     | Progressive disclosure + `system/` always-on    |
| **Validation**            | Deterministic shapes and link audits                        | Cloud-side memory extraction rules                              | Agent + Git commits                             |
| **Offline / local-first** | Yes (vault is yours)                                        | Cache-assisted; authority is cloud                              | Yes (local clone; API sync for Letta Cloud)     |
| **Best fit**              | Publishable semantic wikis, OWL/RDF reasoning, static sites | Large corpora, integrations (Drive, Notion, Slack), multi-modal | Letta Code coding agents, auditable Git history |

Choose SMFS when you want **semantic search hidden behind bash**, multi-platform sync, and managed scale without maintaining a vault toolchain. Choose the Wiki CLI when you want **explicit, inspectable [Declarative_Knowledge](Declarative_Knowledge.md)**, [Procedural_Knowledge](Procedural_Knowledge.md) via `wiki check` / `wiki render`, and a compounding markdown codebase under your control.

See [Agent_Memory_Filesystems](Agent_Memory_Filesystems.md) for a consolidated view.

## Sources

| Resource     | Link                                      |
| ------------ | ----------------------------------------- |
| SMFS docs    | https://supermemory.ai/docs/smfs/overview |
| Mount guide  | https://supermemory.ai/docs/smfs/mount    |
| Project site | https://smfs.ai/                          |
| GitHub       | https://github.com/supermemoryai/smfs     |
