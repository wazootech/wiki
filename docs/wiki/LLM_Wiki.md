---
type: TechArticle

headline: LLM Wiki

description: A persistent knowledge codebase for AI-assisted knowledge management.
---

# LLM Wiki

An **LLM Wiki** is a modern design pattern for [Personal Knowledge](Personal_Knowledge.md) (PKM). It treats a user's [personal knowledge](Personal_Knowledge.md) repository as a clean, interlinked, machine-readable "codebase" that growing AI agents can operate on over time.

This replaces fleeting AI chats and unstructured RAG databases with a persistent, compounding core of intelligence.

The **LLM Wiki** is a modern design pattern for [personal knowledge](Personal_Knowledge.md) management (PKM) popularized by **[Andrej Karpathy](https://x.com/karpathy/status/2039805659525644595)** in early April 2026. It represents a paradigm shift from traditional **[Retrieval-Augmented Generation](Retrieval_Augmented_Generation.md) (RAG)**—where an AI searches through unstructured files on the fly—to a **compiled, persistent, and compounding knowledge base**.

## Karpathy's viral analogy

Karpathy summarized the ultimate relationship between the human, the AI, and the files with his famous analogy:

> "[Obsidian](Obsidian.md) is the IDE; the LLM is the programmer; the wiki is the codebase."

He highlighted that traditional AI chat windows are "stateless" and fleeting, forcing you to reconstruct context every time you start a session. In contrast, an LLM Wiki compiles your unstructured raw inputs (diaries, PDFs, articles, research notes) into a clean, interlinked Markdown codebase (`[slug]`) that grows more intelligent and interconnected over time.

## Farza's follow-up and [Farzapedia](Farzapedia.md)

Developer **Farza** (founder of buildspace) created [Farzapedia](Farzapedia.md) as the definitive real-world proof of concept for the LLM Wiki pattern:

- **The Input**: Fed approximately **2,500 unstructured entries** (comprising personal diary entries, Apple Notes, and raw iMessage histories) to an LLM agent.

- **The Compilation**: The LLM agent parsed, categorized, and synthesized the raw materials, outputting **~400 beautifully structured, clean, and heavily interlinked wiki articles**.

- **The Takeaway**: [Farzapedia](Farzapedia.md) demonstrated that an LLM can act as an objective, disciplined "gardener" of a human's mind, creating a private, local, and navigably explicit knowledge base that can be queried by any downstream AI.

## Integrating the LLM Wiki in this wiki

This [Wiki CLI](Wiki_CLI.md) repository is built directly on the principles of the LLM Wiki design pattern. It enforces:

1. **Declarative Frontmatter**: Structuring YAML-LD metadata to make pages machine-readable.

1. **Procedural Automation**: Using subcommands like [Wiki Subcommand check](Wiki_Subcommand_check.md) to validate shapes, and [Wiki Subcommand render](Wiki_Subcommand_render.md) to execute [SPARQL](SPARQL.md) queries dynamically, compiling the graph's intelligence back into static Markdown.

## Managing drift and schema evolution

A common challenge in text-based memory bases is metadata drift—especially when files are updated programmatically by external LLM agents. The Wiki CLI provides two strategies to keep a compounding codebase clean over long periods:

### Automated cleaning harness

To prevent drift mechanically, you can wire a local Git hook or CI workflow that executes the following checks in order:

1. **[Wiki Subcommand fmt](Wiki_Subcommand_fmt.md)**: Auto-formats Markdown structures and standardizes YAML frontmatter layout.
1. **[Wiki Subcommand lint](Wiki_Subcommand_lint.md) `--strict`**: Flags broken links, non-conforming filename patterns, and heading casing warnings as hard errors.
1. **[Wiki Subcommand check](Wiki_Subcommand_check.md) `--strict`**: Ensures frontmatter properties strictly conform to defined [SHACL](SHACL.md) shapes.

### Resilient schema evolution

Enforcing schemas on text databases can become problematic as structures evolve. The Wiki CLI avoids schema rigidity using semantic web principles:

- **Additive RDF properties**: Since frontmatter is compiled into a graph, new or unconstrained keys do not cause parsing failures. They are ingested as open-world triples that can be queried or ignored.
- **Decoupled validation**: SHACL validation is a diagnostic step, not an execution blocker. Files with invalid schemas can still be compiled, parsed, and queried.
- **Class-scoped shapes**: Shapes target specific classes (e.g., `sh:targetClass schema:TechArticle`). Introducing a new document type only requires writing a new shape constraint, leaving legacy documents untouched.
- **Namespace contexts**: Properties map to URIs via `graph.context` in [Wiki Configuration](Wiki_Configuration.md). You can rename or alias fields at the config layer without physically editing every source document.

## References

- [Andrej Karpathy on X: LLM Knowledge Bases](https://x.com/karpathy/status/2039805659525644595) — April 2026 thread on raw ingest, LLM compilation into markdown wikis, Obsidian as IDE, and incremental Q&A without RAG.

## Related

- [Wiki CLI](Wiki_CLI.md)
- [Declarative Knowledge](Declarative_Knowledge.md)
- [Procedural Knowledge](Procedural_Knowledge.md)
- [Farzapedia](Farzapedia.md)
- [Getting Started](Getting_Started.md)
- [SPARQL](SPARQL.md)
