---
id: wiki:sparql-guide
type: TechArticle
name: SPARQL query guide
about: wiki:wiki-cli
---

# SPARQL query guide

SPARQL is the standard query language used by the [[wiki-cli]] to inspect and extract information from your semantic knowledge graph. Because all page frontmatter is parsed into an RDF graph, you can run powerful graph queries over your notes.

## Common prefixes

The Wiki CLI automatically binds your namespace prefixes dynamically from the `wiki.yaml` file. The primary prefix mappings are:

* **`schema:`** `https://schema.org/` (Standard schema vocabulary)
* **`wiki:`** `https://book.etok.me/wiki/` (Your local vault namespace)
* **`rdf:`** `http://www.w3.org/1999/02/22-rdf-syntax-ns#` (Standard RDF attributes)

---

## Example query types

### 1. Simple SELECT query
Extracts specific properties from your notes. For example, to list the names of all people:
```sparql
PREFIX schema: <https://schema.org/>

SELECT ?person ?name WHERE {
  ?person rdf:type schema:Person .
  ?person schema:name ?name .
}
```

### 2. Filtered query
Uses standard string or URI filters to constrain your results. To list all articles in the `wiki:` namespace:
```sparql
PREFIX schema: <https://schema.org/>

SELECT ?doc ?name WHERE {
  ?doc rdf:type schema:TechArticle .
  ?doc schema:name ?name .
  FILTER(STRSTARTS(STR(?doc), "wiki:"))
}
```

---

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
| https://schema.org/SoftwareApplication |
| https://schema.org/TechArticle |
| https://schema.org/WebPage |
<!-- sparql:end -->
