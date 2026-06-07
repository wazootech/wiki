---
type: TechArticle
label: SHACL
comment: Shapes Constraint Language for validating RDF graphs.
---

# SHACL

The **Shapes Constraint Language (SHACL)** is a W3C recommendation for validating [RDF](RDF.md) graphs against a set of conditions. These conditions are provided as shapes and other constructs expressed in the form of an RDF graph itself.

In this vault, SHACL is used to enforce structure via the [Wiki_CLI](Wiki_CLI.md) validation engine.

## Defining custom SHACL shapes (validation)

SHACL (Shapes Constraint Language) files are stored in your configured `shapes/` directory. They validate that your page frontmatter is structurally correct.

To create a custom constraint for a class (e.g., a `Project` class):

1. Create a file named `shapes/project-shape.ttl`.
1. Define a `sh:NodeShape` that targets your class and specifies property constraints:

```turtle
@prefix sh: <http://www.w3.org/ns/shacl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix schema: <https://schema.org/> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
@prefix wiki: <https://wazootech.github.io/wiki/wiki/> .

schema:ProjectShape a sh:NodeShape ;
  sh:targetClass schema:Project ;
  
  # Required properties
  sh:property [
    sh:path rdfs:label ;
    sh:minCount 1 ;
    sh:maxCount 1 ;
    sh:datatype xsd:string ;
    sh:message "Project must have exactly one label string." ;
  ] ;
  
  sh:property [
    sh:path schema:startDate ;
    sh:minCount 1 ;
    sh:maxCount 1 ;
    sh:datatype xsd:date ;
    sh:message "Project must have a startDate in YYYY-MM-DD format." ;
  ] .
```

When you run `wiki check`, any page with `type: Project` is automatically validated against these constraints!

## Page layouts vs SHACL

Per-page HTML layouts use `wazoo:layout` with a file path. That key is presentation metadata for the builder and is not exported into the RDF graph, so SHACL cannot constrain it. Use `wiki check` to validate layout file paths and reject legacy `template` / `wiki:template` keys. See [Wiki_Page_Layouts](Wiki_Page_Layouts.md).
