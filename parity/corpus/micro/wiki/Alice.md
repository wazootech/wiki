---
type: Person
name: Alice
givenName: Alice
---

# Alice

Alice is a shape-valid `schema:Person`: she carries the `schema:name` the
micro shape requires, so SHACL has nothing to say about this page.

<!-- sparql:start
```sparql
PREFIX schema: <https://schema.org/>

SELECT ?name WHERE {
  ?person a schema:Person ;
          schema:name ?name .
}
ORDER BY ?name
```
<!-- sparql:end -->
