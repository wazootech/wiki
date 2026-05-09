---
id: wiki:custom-schemas-and-shapes
type: TechArticle
name: Defining custom schemas, shapes, and axioms
about: wiki:wiki-cli
---

# Defining custom schemas, shapes, and axioms

This guide explains how to extend your semantic vault by defining **custom classes, properties, shapes, and axioms**. By doing so, you feed directly into the [[wiki-cli]]'s validation engine (`wiki check`) and reasoning engine (`wiki render`).

Refer to [[wiki-schema]] to see active vault types, and [[sparql-guide]] to learn how to query them.

---

## 1. Defining custom SHACL shapes (Validation)

SHACL (Shapes Constraint Language) files are stored in your configured `shapes/` directory (e.g., `prior-art/shapes/`). They validate that your page frontmatter is structurally correct.

To create a custom constraint for a class (e.g., a `Project` class):

1. Create a file named `shapes/project-shape.ttl`.
2. Define a `sh:NodeShape` that targets your class and specifies property constraints:

```turtle
@prefix sh: <http://www.w3.org/ns/shacl#> .
@prefix schema: <https://schema.org/> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
@prefix wiki: <https://book.etok.me/wiki/> .

schema:ProjectShape a sh:NodeShape ;
  sh:targetClass schema:Project ;
  
  # Required properties
  sh:property [
    sh:path schema:name ;
    sh:minCount 1 ;
    sh:maxCount 1 ;
    sh:datatype xsd:string ;
    sh:message "Project must have exactly one name string." ;
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

---

## 2. Defining custom RDFS/OWL axioms (Reasoning)

Custom reasoning rules and class hierarchies are stored in your configured `reasoning/` directory (e.g., `prior-art/reasoning/`). They expand your graph through OWL-RL deductive reasoning.

For example, to define that `Project` is a sub-class of `schema:CreativeWork`, and that a custom relationship `wiki:lead` is a sub-property of `schema:contributor`:

1. Create a file named `reasoning/project-axioms.ttl`.
2. Add RDFS/OWL assertion triples:

```turtle
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix schema: <https://schema.org/> .
@prefix wiki: <https://book.etok.me/wiki/> .

schema:Project rdfs:subClassOf schema:CreativeWork .
wiki:lead rdfs:subPropertyOf schema:contributor .
```

### 🔮 Deductive Reasoning Consequences
Under OWL-RL reasoning rules, when you have a page:
```yaml
type: Project
name: Semantic Brain
lead: wiki:gregory
```

The reasoning engine automatically infers and adds the following facts to your graph:
* The page is also a `schema:CreativeWork`.
* `wiki:gregory` is a `schema:contributor` to the project.

---

## Active shapes and axioms in this vault

The table below queries the active graph to list all loaded schema-related documents in the vault:

<!-- sparql:start -->
```sparql
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX schema: <https://schema.org/>

SELECT ?doc ?name WHERE {
  ?doc rdf:type schema:TechArticle .
  ?doc schema:name ?name .
}
ORDER BY ?name
```

| Doc | Name |
| --- | --- |
| wiki:karpathy-llm-wiki | Andrej Karpathy's LLM Wiki and Farzapedia |
| wiki:custom-schemas-and-shapes | Defining custom schemas, shapes, and axioms |
| wiki:farzapedia | Farzapedia and personal AI wikis |
| wiki:personal-knowledge-management | Personal knowledge management and semantic 2nd brains |
| wiki:sparql-guide | SPARQL query guide |
| wiki:wiki-schema | Wiki schema and active types |
| wiki:wiki-workflows | Wiki workflows and authoring guide |
<!-- sparql:end -->
