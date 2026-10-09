---
type: TechArticle
headline: SHACL
description: Shapes Constraint Language for validating RDF graphs.
---

# SHACL

The **Shapes Constraint Language (SHACL)** is a W3C recommendation for validating [RDF](RDF.md) graphs against a set of conditions. These conditions are provided as shapes and other constructs expressed in the form of an RDF graph itself.

In this wiki, SHACL is used to enforce structure via the [wiki](wiki.md) validation engine.

## Defining custom SHACL shapes (validation)

SHACL shapes load from the wiki graph. Add a dedicated `shapes/` tree to [Wiki Configuration](Wiki_Configuration.md) `wiki.input` so shape documents stay separate from prose pages:

```yaml
wiki:
  input:
    - wiki
    - shapes
```

Markdown and data files under `shapes/` compile into the same wiki graph as wiki articles; `wiki check` extracts `sh:NodeShape` triples and runs PySHACL against every document. This repository keeps shapes alongside articles under `wiki/` instead ([Software Application Shape](Software_Application_Shape.md)); both layouts work.

To constrain a class (for example `schema:Project`), create `shapes/Project_Shape.md` using a [Style Guide](Style_Guide.md) Wikipedia-style filename and frontmatter like [Software Application Shape](Software_Application_Shape.md):

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

### Lists and property paths

A YAML list in frontmatter usually means one triple per item. The SHACL parameters whose value the [SHACL](https://www.w3.org/TR/shacl/) specification defines as a list compile to an RDF list instead, at any depth: `sh:in`, `sh:languageIn`, `sh:ignoredProperties`, `sh:and`, `sh:or`, `sh:xone`, and `sh:alternativePath`. Under `sh:path` (and `sh:inversePath`, `sh:zeroOrMorePath`, `sh:oneOrMorePath`, `sh:zeroOrOnePath`), a list of two or more items is a sequence path, and a one-item list is the same as the bare item:

```yaml
---
type: sh:NodeShape
sh:targetClass: schema:Project
sh:property:
  - sh:path: schema:status
    sh:in:
      - schema:ActiveActionStatus
      - schema:CompletedActionStatus
  - sh:path: [schema:author, schema:name]
    sh:minCount: 1
  - sh:path:
      sh:alternativePath: [schema:alternateName, [schema:author, schema:name]]
    sh:minCount: 1
---
```

Here the second property checks the author's name (a sequence path), and the third accepts either an `alternateName` or an author's name.

### Shape page checks

`wiki check` lints every shape page before it validates anything with it (`check.shape_definition`, default `error`). It follows the [SHACL Core](https://www.w3.org/TR/shacl/) rules for well-formed shapes:

- **Vocabulary.** Every `sh:` key must be a property the [SHACL vocabulary](http://www.w3.org/ns/shacl.ttl) defines, and every `sh:` type or value must be one of its terms. `sh:patern` or `type: sh:NodeShap` fails instead of silently doing nothing.
- **Property shapes** need exactly one `sh:path` (SHACL §2.3), whether they are a page typed `sh:PropertyShape` or an item under `sh:property`.
- **Paths** must be well-formed (§2.3.1): an IRI, a list of paths (a sequence), or a mapping with exactly one of `sh:inversePath`, `sh:alternativePath`, `sh:zeroOrMorePath`, `sh:oneOrMorePath`, or `sh:zeroOrOnePath`. `sh:alternativePath` needs at least two paths. A CURIE whose prefix the wiki does not declare compiles to a plain string, not an IRI, so it is rejected.
- **IRI-valued parameters** (`sh:targetClass`, `sh:targetSubjectsOf`, `sh:targetObjectsOf`, `sh:class`, `sh:datatype`, `sh:equals`, `sh:disjoint`, `sh:lessThan`, `sh:lessThanOrEquals`, and each member of `sh:ignoredProperties`) must be IRIs, and `sh:nodeKind` must be one of its six kinds (§4.1.3).
- **Targets.** A node shape page with no target, that is not also a class and that no other shape reaches through `sh:node`, `sh:property`, `sh:qualifiedValueShape`, `sh:not`, `sh:and`, `sh:or`, or `sh:xone`, validates nothing and fails (§2.1).

Turtle shapes (`.ttl` files and fenced `turtle` blocks) are not linted, because they have no frontmatter key to point at.

### JSON Schema (optional)

On the same shape document, add `wazoo:jsonSchema` beside `sh:targetClass` to validate frontmatter with [JSON Schema](https://json-schema.org/) in parallel with SHACL:

```yaml
---
type: sh:NodeShape
sh:targetClass: schema:Project
wazoo:jsonSchema: schemas/project.json
sh:property:
  - sh:path: schema:name
    sh:minCount: 1
---
```

`wiki init` scaffolds an empty `wiki/` folder — add your own shape documents (e.g. a `sh:NodeShape` frontmatter page for your domain) when you need SHACL validation. Optionally bind JSON Schema on shape documents with `wazoo:jsonSchema` beside `sh:targetClass`, or append per-page schemas with their own `wazoo:jsonSchema` key (string or list). Shape binding documents are not validated as instances — only their schema refs are checked for loadability.

See [Tech Article Shape](Tech_Article_Shape.md) in this wiki for a dogfooded example.

Pure `.ttl` or `.trig` files in `shapes/` also load when that directory is listed in `wiki.input`; markdown frontmatter is the default authoring style in this wiki.

## Related

- [wiki check](wiki_check.md) — PySHACL and JSON Schema frontmatter validation
- [wiki lint](wiki_lint.md) — prose and link conventions (separate from shapes)
- [Style Guide](Style_Guide.md) — shape authoring and filenames
- [Software Application Shape](Software_Application_Shape.md) — example `sh:NodeShape`
- [Wiki Configuration](Wiki_Configuration.md) — `wiki.input` and shapes layout

## References

- [SHACL — Shapes Constraint Language](https://www.w3.org/TR/shacl/)
