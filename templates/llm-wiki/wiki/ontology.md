---
id: wiki:ontology
type: TechArticle
name: Project Ontology
description: Global OWL/RDFS axioms and class inheritance mappings.
---

# Global ontology mappings

This document hosts explicit RDFS and OWL semantic relations that drive automatic inference logic across the wiki graph.

```turtle
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix schema: <https://schema.org/> .
@prefix wiki: <https://book.etok.me/wiki/> .

# Classes
schema:Project rdfs:subClassOf schema:CreativeWork .

# Properties
wiki:lead rdfs:subPropertyOf schema:contributor .
```
