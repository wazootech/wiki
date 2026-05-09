---
id: wiki:wiki-schema
type: TechArticle
name: Wiki schema and active types
about: wiki:wiki-cli
---

# Wiki schema and active types

This page outlines the ontologies and shapes used to organize the semantic vault.

## Current pages in the vault by type

The table below is rendered dynamically by the Wiki CLI using inline SPARQL:

<!-- sparql:start -->
```sparql
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX schema: <https://schema.org/>

SELECT ?document ?type WHERE {
  ?document rdf:type ?type .
  FILTER(STRSTARTS(STR(?document), "wiki:"))
  FILTER(?type != schema:WebPage)
}
ORDER BY ?type
```

| Document | Type |
| --- | --- |
| wiki:wiki-cli | https://schema.org/SoftwareApplication |
| wiki:custom-schemas-and-shapes | https://schema.org/TechArticle |
| wiki:farzapedia | https://schema.org/TechArticle |
| wiki:karpathy-llm-wiki | https://schema.org/TechArticle |
| wiki:personal-knowledge-management | https://schema.org/TechArticle |
| wiki:sparql-guide | https://schema.org/TechArticle |
| wiki:wiki-schema | https://schema.org/TechArticle |
| wiki:wiki-workflows | https://schema.org/TechArticle |
<!-- sparql:end -->

## Shape constraints

Active shapes are loaded from the configured `shapes/` directory and executed against all matching pages during `wiki check`.

### 1. `Person` shape
* **givenName**: Required string (exactly 1)
* **familyName**: Required string (exactly 1)
* **context**: Required string (one-liner describing relationship)
* **status**: Required choice of either `permanent` or `one-off`
* **dateCreated**: Required date in YYYY-MM-DD format
