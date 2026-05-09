---
id: wiki:farzapedia
type: TechArticle
name: Farzapedia and personal AI wikis
description: An interlinked digital garden serving as an example for the LLM Wiki pattern.
about: wiki:wiki-cli
---

# Farzapedia and personal AI wikis

**Farzapedia** is a pioneering, private personal knowledge wiki developed by **Farza** (founder of buildspace). It serves as the definitive real-world implementation of the **LLM Wiki** design pattern popularized by [[llm-wiki]].


## The architecture of Farzapedia

Rather than relying on complex, black-boxed, and expensive vector database infrastructure (Retrieval-Augmented Generation / RAG), Farzapedia uses a simple, compiled approach:

1. **Unstructured Source Materials**: Approximately **2,500 raw records** comprising Apple Notes, personal diaries, and raw iMessage chat histories.
2. **The LLM Compiler**: An LLM agent (e.g., Claude) is instructed to act as a disciplined editor and gardener of the mind.
3. **The Interlinked Wiki**: The LLM parses, deduplicates, and synthesizes the unorganized inputs, generating **~400 structured, clean, and heavily interlinked Markdown files** tied together with standard WikiLinks.


## The four principles of owned knowledge

Farzapedia champions four crucial properties of modern knowledge engineering:

* **Explicit**: The memory artifact is human-readable, navigable, and fully inspectable. There are no opaque vector embeddings or proprietary database formats.
* **Yours (Local First)**: All data lives securely on your local hard drive under your control. No vendor lock-in or subscription APIs.
* **File Over App**: Universal, standardized Markdown files mean your second brain is completely independent of any single app or operating system.
* **BYOAI (Bring Your Own AI)**: A flat directory of clean files allows you to plug in any LLM agent (Claude, OpenAI, Codex) to query, write, or refactor your knowledge base without altering the underlying data.


## Dynamic querying in this vault

The [[wiki-cli]] is a fully realized software pipeline built to make the Farzapedia pattern deterministic. By treating Markdown frontmatter as a queryable RDF knowledge graph, you can run powerful SPARQL queries and use command-line pipelines to synthesize indexes on the fly—fulfilling the dream of a queryable, self-updating mind map.
