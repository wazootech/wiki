---
type: sh:NodeShape
rdfs:label: TechArticle Shape
rdfs:comment: Basic validation rules for TechArticle documents.
sh:targetClass: schema:TechArticle
sh:property:
  - sh:path: schema:headline
    sh:minCount: 1
    sh:maxCount: 1
    sh:datatype: xsd:string
    sh:message: "TechArticle must have exactly one headline."
  - sh:path: schema:description
    sh:minCount: 1
    sh:datatype: xsd:string
    sh:message: "TechArticle must have a description summary."
---

# TechArticle validation shape

This document defines the basic **SHACL validation rules** enforced upon any `type: TechArticle` documents in this wiki.

It ensures that all technical articles have at least a `headline` and `description` in their YAML frontmatter.
