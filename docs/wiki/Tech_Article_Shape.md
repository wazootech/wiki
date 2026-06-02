---
type: sh:NodeShape
name: TechArticle Shape
description: Basic validation rules for TechArticle documents.
sh:targetClass: schema:TechArticle
sh:property:
  - sh:path: schema:name
    sh:minCount: 1
    sh:maxCount: 1
    sh:datatype: xsd:string
    sh:message: "TechArticle must have exactly one name."
  - sh:path: schema:description
    sh:minCount: 1
    sh:datatype: xsd:string
    sh:message: "TechArticle must have a description summary."
---

# TechArticle validation shape

This document defines the basic **SHACL validation rules** enforced upon any `type: TechArticle` documents in this vault.

It ensures that all technical articles have at least a name and a description in their YAML frontmatter.
