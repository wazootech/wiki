---
id: wiki:sparql
type: TechArticle
name: SPARQL
description: Standard query language and protocol for RDF.
---

# SPARQL

**SPARQL** (Recursive acronym for SPARQL Protocol and RDF Query Language) is an [[RDF]] query language—that is, a semantic query language for databases—able to retrieve and manipulate data stored in RDF format.

It is utilized within the [[LLM_Wiki_CLI]] `render` pipeline to populate tables based on inline graph queries.

## Common prefixes

The LLM Wiki CLI automatically binds your namespace prefixes dynamically from the `wiki.yaml` file. The primary prefix mappings are:

* **`schema:`** `https://schema.org/` (Standard schema vocabulary)
* **`wiki:`** `https://wazootech.github.io/wiki/wiki/` (Your local vault namespace)
* **`rdf:`** `http://www.w3.org/1999/02/22-rdf-syntax-ns#` (Standard RDF attributes)


## Example query types

### Simple SELECT query
Extracts specific properties from your notes. For example, to list the names of all people:
```sparql
PREFIX schema: <https://schema.org/>

SELECT ?person ?name WHERE {
  ?person rdf:type schema:Person .
  ?person schema:name ?name .
}
```

### Filtered query
Uses standard string or URI filters to constrain your results. To list all articles in the `wiki:` namespace:
```sparql
PREFIX schema: <https://schema.org/>

SELECT ?doc ?name WHERE {
  ?doc rdf:type schema:TechArticle .
  ?doc schema:name ?name .
  FILTER(STRSTARTS(STR(?doc), "wiki:"))
}
```


## Active database summary

The table below queries the active graph to list all distinct classes currently instantiated in your vault:

<!-- sparql:start -->
```sparql
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>

SELECT DISTINCT ?class WHERE {
  ?s rdf:type ?class .
  FILTER(STRSTARTS(STR(?class), "https://schema.org/"))
}
ORDER BY ?class
```

| Class |
| --- |
| https://schema.org/CreativeWork |
| https://schema.org/Person |
| https://schema.org/SoftwareApplication |
| https://schema.org/TechArticle |
<!-- sparql:end -->

