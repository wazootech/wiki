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
| https://book.etok.me/wiki/css | CSS |
| https://book.etok.me/wiki/csv | CSV |
| https://book.etok.me/wiki/negotiation | Content negotiation |
| https://book.etok.me/wiki/farzapedia | Farzapedia and personal AI wikis |
| https://book.etok.me/wiki/html | HTML |
| https://book.etok.me/wiki/json | JSON |
| https://book.etok.me/wiki/json-ld | JSON-LD |
| https://book.etok.me/wiki/javascript | JavaScript |
| https://book.etok.me/wiki/llm-wiki | LLM Wiki |
| https://book.etok.me/wiki/microdata | Microdata |
| https://book.etok.me/wiki/notation3 | Notation3 |
| https://book.etok.me/wiki/owl | OWL |
| https://schema.org/PersonShapeDefinition | Person Shape |
| https://book.etok.me/wiki/personal-knowledge | Personal Knowledge |
| https://book.etok.me/wiki/ontology | Project Ontology |
| https://book.etok.me/wiki/rdf | RDF |
| https://book.etok.me/wiki/shacl | SHACL |
| https://book.etok.me/wiki/sparql | SPARQL |
| https://book.etok.me/wiki/semantic-web | Semantic Web |
| https://book.etok.me/wiki/turtle | Turtle |
| https://book.etok.me/wiki/typescript | TypeScript |
<!-- sparql:end -->