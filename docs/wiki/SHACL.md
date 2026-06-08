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

## References

- [SHACL — Shapes Constraint Language](https://www.w3.org/TR/shacl/)
