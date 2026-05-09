---
id: schema:PersonShapeDefinition
type: TechArticle
name: Person Shape
description: SHACL constraint shape defining the mandatory fields for Person records.
---

# Person validation shape

This document defines the canonical shape for `schema:Person` nodes in this vault.

```turtle
@prefix sh: <http://www.w3.org/ns/shacl#> .
@prefix schema: <https://schema.org/> .
@prefix wiki: <https://book.etok.me/wiki/> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

schema:PersonShape a sh:NodeShape ;
  sh:targetClass schema:Person ;
  sh:property [
    sh:path schema:givenName ;
    sh:minCount 1 ;
    sh:datatype xsd:string ;
  ] ;
  sh:property [
    sh:path schema:familyName ;
    sh:minCount 1 ;
    sh:datatype xsd:string ;
  ] ;
  sh:property [
    sh:path wiki:context ;
    sh:minCount 1 ;
    sh:datatype xsd:string ;
  ] ;
  sh:property [
    sh:path wiki:status ;
    sh:minCount 1 ;
    sh:or (
      [ sh:hasValue "permanent" ]
      [ sh:hasValue "one-off" ]
    ) ;
  ] ;
  sh:property [
    sh:path schema:dateCreated ;
    sh:minCount 1 ;
    sh:datatype xsd:date ;
  ] .
```
