---
type: TechArticle
headline: SHACL
description: Shapes Constraint Language for validating RDF graphs.
---

# SHACL

The **Shapes Constraint Language (SHACL)** is a W3C recommendation for validating [RDF](RDF.md) graphs against a set of conditions. These conditions are provided as shapes and other constructs expressed in the form of an RDF graph itself.

In this vault, SHACL is used to enforce structure via the [Wiki_CLI](Wiki_CLI.md) validation engine.

## Defining custom SHACL shapes (validation)

SHACL shapes load from the vault graph. Add a dedicated `shapes/` tree to [Wiki_Configuration](Wiki_Configuration.md) `input_dirs` so shape documents stay separate from prose pages:

```yaml
input_dirs:
  - wiki
  - shapes
```

Markdown and RDF files under `shapes/` compile into the same vault graph as wiki articles; `wiki check` extracts `sh:NodeShape` triples and runs PySHACL against every document. This repository keeps shapes alongside articles under `wiki/` instead ([Software_Shape](Software_Shape.md)); both layouts work.

To constrain a class (for example `schema:Project`), create `shapes/Project_Shape.md` using a [Style_Guide](Style_Guide.md) Wikipedia-style filename and frontmatter like [Software_Shape](Software_Shape.md):

```yaml
---
type: sh:NodeShape
rdfs:label: Project Shape
sh:targetClass: schema:Project
sh:property:
  - sh:path: schema:name
    sh:minCount: 1
    sh:maxCount: 1
    sh:datatype: xsd:string
    sh:message: Project must have exactly one name string.
  - sh:path: schema:startDate
    sh:minCount: 1
    sh:maxCount: 1
    sh:datatype: xsd:date
    sh:message: Project must have a startDate in YYYY-MM-DD format.
---
```

When you run `wiki check`, any page with `type: Project` is automatically validated against these constraints.

Pure `.ttl` or `.trig` files in `shapes/` also load when that directory is listed in `input_dirs`; markdown frontmatter is the default authoring style in this vault.

## Future work: ShEx

[ShEx](https://shexspec.github.io/shex/) (Shape Expressions) is an alternative schema language for validating RDF graphs. wiki-cli **does not** support ShEx today; validation is SHACL-only via `type: sh:NodeShape` shape pages and `wiki check`.

Tracked in [wazootech/wiki#49](https://github.com/wazootech/wiki/issues/49).

### Reasons to add it later

- Some authors prefer **ShExC text** in markdown over nested YAML that compiles to SHACL triples.
- **Same data graph** — ShEx validators (e.g. PyShEx) can run on the rdflib graphs `load_graph()` already builds; full-vault and per-file checks are feasible.
- **Interop** with tooling that publishes or consumes ShEx without a SHACL conversion step.

### Reasons we are deferring

- **RDF-first fit**: SHACL shapes are triples in the vault graph; ShEx schemas are usually separate text (ShExC), not the same authoring model as frontmatter → RDF.
- **Dual-engine cost**: Two validators, a shape registry, conflict rules, CLI output, tests, and docs — significant surface area for optional author choice.
- **Targeting**: SHACL uses `sh:targetClass` in the shapes graph; ShEx needs shape maps or conventions (e.g. shape name = class IRI) that authors must learn separately.
- **No concrete requirement yet**: Until a vault or integration needs ShEx, SHACL covers validation.

If implemented, the likely shape is **one engine per class** (never SHACL and ShEx on the same `targetClass`), with a wiki shape-page convention such as `type: wiki:ShExShape`, `targetClass`, and a fenced ````  ```shex ```` block.

## References

- [SHACL — Shapes Constraint Language](https://www.w3.org/TR/shacl/)
