---
type: TechArticle
name: Retrieval-augmented generation
description: Pattern where an LLM retrieves external chunks at query time instead of relying on a precompiled knowledge structure.
---

# Retrieval-augmented generation

**Retrieval-augmented generation (RAG)** is a pattern where a language model answers questions by retrieving relevant passages from an external corpus—often via vector embeddings—at query time, then conditioning its reply on those chunks.

RAG is flexible for ad hoc document sets but can feel opaque: similarity search does not guarantee explicit structure, stable cross-links, or inspectable memory. The [LLM Wiki](LLM_Wiki.md) pattern popularized by [Andrej Karpathy](Andrej_Karpathy.md) argues for **compiling** sources into a persistent, interlinked markdown wiki that agents maintain and traverse—exemplified by [Farzapedia](Farzapedia.md).

Both approaches support [Personal_Knowledge](Personal_Knowledge.md) workflows; many practitioners combine compiled wikis with targeted retrieval when corpora grow very large.

## GraphRAG

**GraphRAG** is a RAG variant that first **indexes a corpus into a knowledge graph**—entities, relationships, and hierarchical **community summaries**—then retrieves through that structure at query time. It was popularized by [Microsoft’s GraphRAG project](https://github.com/microsoft/graphrag) for questions that need both local detail (“what did this document say about X?”) and **global synthesis** (“what are the main themes across the whole collection?”).

Compared with embedding-only RAG:

|          | Vector RAG              | GraphRAG                                       |
| -------- | ----------------------- | ---------------------------------------------- |
| Index    | Chunk embeddings        | Graph + community reports                      |
| Strength | Fast similarity lookup  | Cross-document themes, structured hops         |
| Tradeoff | Weak explicit structure | Heavier indexing pipeline; graph can be opaque |

GraphRAG sits between opaque vector stores and human-inspectable wikis. You get explicit [declarative knowledge](Declarative_Knowledge.md) in the graph, but the artifact is usually generated and queried through tooling—not necessarily a folder of markdown you edit in [Obsidian](Obsidian_Integration.md). The [LLM Wiki](LLM_Wiki.md) pattern pushes further toward **files as the source of truth**: interlinked pages, visible WikiLinks, and optional [RDF](RDF.md) / [SPARQL](SPARQL.md) validation in vaults like this one.

For agent memory, the practical spectrum is: **vector RAG** (retrieve chunks) → **GraphRAG** (retrieve graph neighborhoods and summaries) → **compiled wiki** (traverse linked articles the agent maintains). [Farzapedia](Farzapedia.md) and [HydraDB](https://docs.hydradb.com/get-started/introduction)-style substrates (see [WikiThon](WikiThon.md)) mix file-first wikis with managed recall APIs.
