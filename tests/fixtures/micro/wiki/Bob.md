---
type: Person
givenName: Bob
---

# Bob

Bob is a `schema:Person` with no `schema:name`, which the micro shape in
`ontology.ttl` requires. `wiki check --strict` must report it and exit non-zero.
