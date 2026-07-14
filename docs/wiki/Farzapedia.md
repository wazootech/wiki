---
type: TechArticle
headline: Farzapedia
description: An interlinked digital garden serving as an example for the LLM Wiki pattern.
about: wiki:wiki
---

# Farzapedia

**Farzapedia** is a pioneering, private [personal knowledge](Personal_Knowledge.md) wiki developed by **Farza** (founder of buildspace). It serves as the definitive real-world implementation of the **[LLM Wiki](LLM_Wiki.md)** design pattern, [announced on X in April 2026](https://x.com/FarzaTV/status/2040563939797504467).

## The architecture of Farzapedia

Rather than relying on complex, black-boxed, and expensive vector database infrastructure ([Retrieval-Augmented Generation](Retrieval_Augmented_Generation.md) / RAG), Farzapedia uses a simple, compiled approach:

1. **Unstructured Source Materials**: Approximately **2,500 raw records** comprising Apple Notes, personal diaries, and raw iMessage chat histories.
1. **The LLM Compiler**: An LLM agent (e.g., Claude) is instructed to act as a disciplined editor and gardener of the mind.
1. **The Interlinked Wiki**: The LLM parses, deduplicates, and synthesizes the unorganized inputs, generating **~400 structured, clean, and heavily interlinked Markdown files** tied together with standard WikiLinks.

## The four principles of owned knowledge

Farzapedia champions four crucial properties of modern knowledge engineering:

- **Explicit**: The memory artifact is human-readable, navigable, and fully inspectable. There are no opaque vector embeddings or proprietary database formats.
- **Yours (Local First)**: All data lives securely on your local hard drive under your control. No vendor lock-in or subscription APIs.
- **File Over App**: Universal, standardized Markdown files mean your [second brain](Second_Brain.md) is completely independent of any single app or operating system.
- **BYOAI (Bring Your Own AI)**: A flat directory of clean files allows you to plug in any LLM agent (Claude, OpenAI, Codex) to query, write, or refactor your knowledge base without altering the underlying data.

## Dynamic querying in this wiki

The [wiki](wiki.md) is a fully realized software pipeline built to make the Farzapedia pattern deterministic. By treating Markdown frontmatter as a queryable RDF knowledge graph, you can run powerful [SPARQL](SPARQL.md) queries with [wiki query](wiki_query.md) and refresh live indexes with [wiki render](wiki_render.md)—fulfilling the dream of a queryable, self-updating mind map.

## References

- [Farza on X: This is Farzapedia](https://x.com/FarzaTV/status/2040563939797504467) — origin thread on compiling ~2,500 diary, Notes, and iMessage entries into ~400 interlinked articles for agent use.

## Related

- [LLM Wiki](LLM_Wiki.md)
- [wiki](wiki.md)
- [SPARQL](SPARQL.md)
- [wiki query](wiki_query.md)
- [wiki render](wiki_render.md)
- [Getting Started](Getting_Started.md)
