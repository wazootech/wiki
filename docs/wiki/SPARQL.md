---
type: TechArticle
headline: SPARQL
description: Standard query language and protocol for RDF.
---

# SPARQL

**SPARQL** (Recursive acronym for SPARQL Protocol and RDF Query Language) is an [RDF](RDF.md) query language—that is, a semantic query language for databases—able to retrieve and manipulate data stored in RDF format.

It is utilized within the [Wiki_CLI](Wiki_CLI.md) `render` pipeline to populate tables based on inline graph queries.

## Common prefixes

The [[Wiki_CLI|Wiki CLI]] automatically binds your namespace prefixes dynamically from the `wiki.yaml` file. The primary prefix mappings are:

- **`schema:`** `https://schema.org/` (Standard schema vocabulary)
- **`wiki:`** `https://wazootech.github.io/wiki/wiki/` (Your local vault namespace)
- **`rdf:`** `http://www.w3.org/1999/02/22-rdf-syntax-ns#` (Standard RDF attributes)

## Example query types

### Simple SELECT query

Extracts specific properties from your notes. For people, prefer `schema:givenName` and `schema:familyName` (see [Style_Guide](Style_Guide.md)):

```sparql
PREFIX schema: <https://schema.org/>
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>

SELECT ?person ?given ?family WHERE {
  ?person rdf:type schema:Person .
  ?person schema:givenName ?given .
  ?person schema:familyName ?family .
}
```

### Filtered query

Uses standard string or URI filters to constrain your results. For TechArticle pages, `schema:headline` and `schema:description` are the display fields:

```sparql
PREFIX schema: <https://schema.org/>

SELECT ?doc ?headline ?description WHERE {
  ?doc rdf:type schema:TechArticle .
  ?doc schema:headline ?headline .
  OPTIONAL { ?doc schema:description ?description . }
  FILTER(STRSTARTS(STR(?doc), "https://wazootech.github.io/wiki/wiki/"))
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

| Class                                  |
| -------------------------------------- |
| https://schema.org/SoftwareApplication |
| https://schema.org/TechArticle         |

<!-- sparql:end -->

## References

- [SPARQL 1.2 Query Language](https://www.w3.org/TR/sparql12-query/)
