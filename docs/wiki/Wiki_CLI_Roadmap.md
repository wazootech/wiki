---
type: TechArticle
name: Wiki CLI roadmap
description: Prioritized triage of near-term and longer-term ideas for the Wiki CLI repository.
---

# Wiki CLI roadmap

This page captures repo-relevant ideas gathered during the day and orders them by **implementation priority**, not just ambition. The ranking favors work that improves the core CLI loop first: **correctness, performance evidence, local development, and scaffolding**.

## Current state check

Some ideas below are already partly implemented and should be treated as **verify and tighten**, not greenfield work:

- The RDF graph is already cached **once per process** in [Graph_Cache](Graph_Cache.md); see `src/wiki/graph.py` and `src/wiki/graph_cache.py`.
- `wiki serve --watch` already exists and rebuilds the site on file changes.
- `wiki init` already scaffolds `README.md`, `wiki.yaml`, starter wiki files, and `index.html`.
- Agent-memory comparison duplication was reduced by consolidating the shared matrix in [Agent_Memory_Filesystems](Agent_Memory_Filesystems.md).

## Priority order

| Priority | Idea | Why this order | Suggested next action |
| --- | --- | --- | --- |
| **P1** | Verify `wiki render` performance with OWL-RL and graph caching | This is core-path work and may already be mostly solved in-process. The immediate need is to measure whether the remaining pain is cold-start cost, watch-loop rebuild cost, or something else. | Add a focused benchmark or timing test for cold vs warm `query`, `render`, and `build --render`; document expected behavior clearly. |
| **P2** | Strengthen `wiki serve` stability and shutdown behavior | Local preview is part of the main edit loop. If watch mode or Ctrl+C is flaky, developer trust drops fast. | Expand endpoint and shutdown tests around `wiki serve`, especially watch refreshes and clean exit behavior. |
| **P3** | Polish `wiki init` scaffolding and decide Git behavior | `init` shapes first-run UX for every new user. The command already creates useful files, so the remaining work is product polish and explicit Git policy. | Decide whether Git should be opt-in (`--git`) or opt-out (`--no-git`), then add tests and README wording to match. |
| **P4** | Update README for local development and testing workflows | The repo should explain the preferred dev loop directly, especially if docs later move elsewhere. | Add explicit local-dev instructions such as `python -m wiki serve --watch`, editable install, and where docs live. |
| **P5** | Track the structural shift from `wiki/wiki` to `wiki` | This is migration hygiene work that can prevent broken assumptions in docs, tests, and templates. | Audit hard-coded path assumptions in docs, fixtures, and generated examples. |
| **P6** | Add `RDF_XML` and `XML` pages with hello-world snippets | Useful docs, but not as urgent as core CLI loop quality. | Add concise pages focused on W3C machine-to-machine serialization, then link them from [Semantic_Web](Semantic_Web.md) and related pages. |
| **P7** | Build out ecosystem templates: Mintlify, Next.js, SvelteKit, Astro | High upside, but templates amplify whatever the current DX already is. Better after core workflow polish. | Start with one canonical template target and document the contract between generated wiki output and the host framework. |
| **P8** | Explore a Next.js inventory viewer / navigator using static props and LDFlex-style ideas | Interesting integration work, but it depends on clearer template boundaries and data-shape decisions. | Define the content model and whether the viewer consumes built artifacts, live SPARQL, or exported RDF. |
| **P9** | Serve a SPARQL endpoint and MCP integration (`comunica-feature-mcp`) | Strategically important, but larger in scope and easier to design after the cache/runtime story is explicit. | Write a design note covering trust boundaries, query execution model, and reuse of the existing graph cache. |
| **P10** | Project Wiki CLI as a World linked to [Graph_Cache](Graph_Cache.md) | This is a broader platform direction rather than a near-term repo task. | Turn it into an architecture doc once endpoint and MCP scope are clearer. |
| **P11** | Move wiki docs to a new repo | Potentially valuable, but repo split work should follow clearer ownership and deployment goals. | Decide first whether the problem is discoverability, release cadence, or contributor friction. |
| **P12** | "Markdown as a programming language demonstrated by wiki CLI" | Strong essay or positioning piece, but not a blocker for product quality. | Publish later as docs or blog copy after the implementation roadmap stabilizes. |

## Triage notes

### Performance and architecture

The biggest ambiguity is not whether graph reuse exists, but **where the remaining reload cost still happens**. The current implementation already reuses the graph inside one process. That means the next step is measurement:

- cold CLI process vs warm long-lived process
- `render` vs `build --render` vs `serve --watch`
- inference on vs inference off
- full-vault render vs scoped render

If the observed problem is shell-to-shell cold start, the likely answers are **better docs, benchmarks, and long-lived server workflows** before adding an on-disk cache.

### Subcommand polish

`wiki serve` and `wiki init` are already present, so the work here is mostly **hardening and product decisions**:

- confirm watch refresh behavior under repeated edits
- confirm clean shutdown under Ctrl+C on supported platforms
- decide Git initialization semantics explicitly instead of leaving them implicit
- make the generated `README.md` reflect the preferred dev workflow

### Templates and integration

Template ecosystem work is promising, but it is downstream of the core contract the CLI exposes:

- what artifact shape template consumers read
- whether consumers depend on static HTML, RDF export, or live query APIs
- how much framework-specific glue the repo should own

That makes template expansion a better second-wave investment than a first-wave one.

### Documentation additions

The planned `RDF_XML` and `XML` pages are straightforward, bounded work and a good candidate for a quick documentation slice after the CLI loop items above.

## Suggested execution sequence

1. Benchmark and document actual graph-cache behavior.
2. Harden `wiki serve` tests, especially watch mode and shutdown.
3. Decide and implement `wiki init` Git behavior.
4. Refresh README local-dev instructions.
5. Add RDF/XML and XML docs.
6. Design template and endpoint expansion from a stable core.

## Related pages

- [Wiki_CLI](Wiki_CLI.md)
- [Graph_Cache](Graph_Cache.md)
- [Wiki_Subcommand_render](Wiki_Subcommand_render.md)
- [Wiki_Subcommand_serve](Wiki_Subcommand_serve.md)
- [Wiki_Subcommand_init](Wiki_Subcommand_init.md)
