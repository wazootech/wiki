---
type: sh:NodeShape
label: TechArticle Shape
comment: Basic validation rules for TechArticle documents.
sh:targetClass: schema:TechArticle
sh:property:
  - sh:path: rdfs:label
    sh:minCount: 1
    sh:maxCount: 1
    sh:datatype: xsd:string
    sh:message: "TechArticle must have exactly one label."
  - sh:path: rdfs:comment
    sh:minCount: 1
    sh:datatype: xsd:string
    sh:message: "TechArticle must have a comment summary."
---

# TechArticle validation shape

This document defines the basic **SHACL validation rules** enforced upon any `type: TechArticle` documents in this vault.

It ensures that all technical articles have at least a `label` and `comment` in their YAML frontmatter.
