---
type: TechArticle
label: WikiThon
comment: A 48-hour online hackathon to build personal Wikipedia-style knowledge bases with HydraDB, themed on the LLM Wiki trend.
---

# WikiThon

**WikiThon** was a 48-hour online hackathon hosted by [AI Valley](https://www.aivalley.io/), with Harnoor Singh and Kartik Chauhan as organizers, centered on the spring 2026 wave of personal, agent-readable wikis. The event's tagline was *Build your own Wikipedia with HydraDB*.

It rode the same cultural moment as the [LLM Wiki](LLM_Wiki.md) pattern (Andrej Karpathy's April 2026 threads, [Farzapedia](Farzapedia.md) by Farza Majeed, and markdown-first [Second_Brain](Second_Brain.md) tooling): treat interlinked articles as a **compiled knowledge base** for agents, not a one-off chat transcript.

## Schedule and links

|                  |                                                                                                                                                          |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Dates**        | 15 May 2026, 5:00 PM – 18 May 2026, 5:00 PM (per [AI Valley listing](https://www.aivalley.io/hackathons/wikithon-build-your-own-wikipedia-with-hydradb)) |
| **Format**       | Online; 48-hour build sprint                                                                                                                             |
| **Registration** | [Luma event page](https://luma.com/6pybuh79)                                                                                                             |
| **Status**       | Completed (as listed on AI Valley)                                                                                                                       |

## Theme and stack

Participants were asked to build systems that reason over **long context**, **memory**, and **workflows**—not shallow prompt wrappers. The sponsored substrate was [HydraDB](https://docs.hydradb.com/get-started/introduction), a unified context layer for agents (ingest documents and memories, recall ranked context via APIs such as `full_recall`, then ground an LLM on the result).

That complements file-first wikis like those described in [Personal_Knowledge](Personal_Knowledge.md): HydraDB emphasizes managed recall and graph-backed context, while the [Wiki CLI](Wiki_CLI.md) vault documents markdown + RDF + [SHACL](SHACL.md) validation for static, inspectable wikis.

## Prizes and community

The [Luma page](https://luma.com/6pybuh79) advertised roughly **$800** in prizes and bounties. [AI Valley](https://www.aivalley.io/) positions itself as a builder community running hackathons and workshops; project submissions were listed on the [hackathon gallery](https://www.aivalley.io/hackathons/wikithon-build-your-own-wikipedia-with-hydradb).

## See also

- [LLM_Wiki](LLM_Wiki.md) — design pattern and primary sources
- [Farzapedia](Farzapedia.md) — reference personal [[Wiki_Subcommand_build|wiki build]]
- [Obsidian_Integration](Obsidian_Integration.md) — common viewer for markdown wikis
