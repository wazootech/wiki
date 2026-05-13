---
id: schema:TechArticleShape
type: sh:NodeShape
name: TechArticle Shape
description: Validation rules for TechArticle documents.
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

This wiki document defines the **SHACL validation rules** enforced upon any `type: TechArticle` documents in the vault.

<!-- sparql:start -->
```sparql
PREFIX schema: <https://schema.org/>

SELECT ?document ?name WHERE {
  ?document a schema:TechArticle .
  ?document schema:name ?name .
}
ORDER BY ?name
```

| Document | Name |
| --- | --- |
| [[css]] | CSS |
| [[csv]] | CSV |
| [[negotiation]] | Content negotiation |
| [[farzapedia]] | Farzapedia and personal AI wikis |
| [[html]] | HTML |
| [[json]] | JSON |
| [[json-ld]] | JSON-LD |
| [[javascript]] | JavaScript |
| [[llm-wiki]] | LLM Wiki |
| [[microdata]] | Microdata |
| wiki:microdata-example | Microdata in LLM Wiki |
| [[notation3]] | Notation3 |
| [[owl]] | OWL |
| https://schema.org/PersonShapeDefinition | Person Shape |
| [[personal-knowledge]] | Personal Knowledge |
| [[ontology]] | Project Ontology |
| [[rdf]] | RDF |
| [[shacl]] | SHACL |
| [[sparql]] | SPARQL |
| [[semantic-web]] | Semantic Web |
| [[turtle]] | Turtle |
| [[typescript]] | TypeScript |
<!-- sparql:end -->