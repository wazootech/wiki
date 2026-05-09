---
id: wiki:llm-wiki
type: TechArticle
name: LLM Wiki
description: A persistent knowledge codebase for AI-assisted knowledge management.
---

# LLM Wiki

An **LLM Wiki** is a modern design pattern for [[personal-knowledge]] (PKM). It treats a user's personal knowledge repository as a clean, interlinked, machine-readable "codebase" that growing AI agents can operate on over time.

This replaces fleeting AI chats and unstructured RAG databases with a persistent, compounding core of intelligence.

The **LLM Wiki** is a modern design pattern for personal knowledge management (PKM) popularized by **Andrej Karpathy** in early April 2026. It represents a paradigm shift from traditional **Retrieval-Augmented Generation (RAG)**—where an AI searches through unstructured files on the fly—to a **compiled, persistent, and compounding knowledge base**.


## Karpathy's viral analogy

Karpathy summarized the ultimate relationship between the human, the AI, and the files with his famous analogy:

> "Obsidian is the IDE; the LLM is the programmer; the wiki is the codebase."

He highlighted that traditional AI chat windows are "stateless" and fleeting, forcing you to reconstruct context every time you start a session. In contrast, an LLM Wiki compiles your unstructured raw inputs (diaries, PDFs, articles, research notes) into a clean, interlinked Markdown codebase (`[slug]`) that grows more intelligent and interconnected over time.


## Farza's follow-up & Farzapedia

Developer **Farza** (founder of buildspace) created [[farzapedia]] as the definitive real-world proof of concept for the LLM Wiki pattern:

* **The Input**: Fed approximately **2,500 unstructured entries** (comprising personal diary entries, Apple Notes, and raw iMessage histories) to an LLM agent.
* **The Compilation**: The LLM agent parsed, categorized, and synthesized the raw materials, outputting **~400 beautifully structured, clean, and heavily interlinked wiki articles**.
* **The Takeaway**: Farzapedia demonstrated that an LLM can act as an objective, disciplined "gardener" of a human's mind, creating a private, local, and navigably explicit knowledge base that can be queried by any downstream AI.


## Integrating the LLM Wiki in this vault

This [[wiki-cli]] repository is built directly on the principles of the LLM Wiki design pattern. It enforces:

1. **Declarative Frontmatter**: Structuring YAML-LD metadata to make pages machine-readable.
2. **Procedural Automation**: Using subcommands like `wiki check` to validate shapes, and `wiki render` to execute SPARQL queries dynamically, compiling the graph's intelligence back into static Markdown.

