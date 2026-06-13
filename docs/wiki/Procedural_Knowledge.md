---
type: TechArticle
headline: Procedural knowledge
description: Knowing how — workflows, rules, and executable processes rather than static facts.
---

# Procedural knowledge

**Procedural knowledge** is "knowing how": skills, workflows, validation rules, and repeatable processes. It contrasts with [Declarative Knowledge](Declarative_Knowledge.md) ("knowing what")—facts, classifications, and relationships stored as data.

In a semantic [Personal Knowledge](Personal_Knowledge.md) wiki, procedural knowledge often lives in tooling rather than prose alone:

- [Wiki Skills](Wiki_Skills.md) — agent `SKILL.md` workflows for install, scaffold, and wiki audit (repository `skills/`, not indexed as wiki pages)
- [SHACL](SHACL.md) shapes and JSON Schema bindings that enforce how pages must be written
- [SPARQL](SPARQL.md) blocks and [Wiki Subcommand render](Wiki_Subcommand_render.md) that refresh tables from the graph
- [Wiki Subcommand check](Wiki_Subcommand_check.md) and [Wiki Subcommand render](Wiki_Subcommand_render.md) pipelines that automate hygiene and synthesis

An [LLM Wiki](LLM_Wiki.md) pairs declarative frontmatter (facts in the graph) with this procedural layer so notes stay structured and self-updating.

## Related

- [Wiki Skills](Wiki_Skills.md)
- [Declarative Knowledge](Declarative_Knowledge.md)
- [Wiki Subcommand query](Wiki_Subcommand_query.md)
- [Wiki Subcommand render](Wiki_Subcommand_render.md)
- [Wiki Subcommand check](Wiki_Subcommand_check.md)
- [SHACL](SHACL.md)
- [SPARQL](SPARQL.md)
