---
type: TechArticle
name: Index
description: Entry point for the differential-harness micro corpus.
---

# Index

The micro corpus exercises the differential harness with content that is
deliberately wrong: a broken internal link, a wikilink where `link.style` is
`standard`, a stale inline SPARQL block, a document missing a shape-required
property, and a filename that violates `wiki.filename_pattern`.

- [Alice](Alice.md) — links to a page that exists.
- [Missing page](Missing_Page.md) — links to a page that does not.
- See also [[Bob]] for the wikilink convention violation.

<!-- sparql:start
```sparql
PREFIX schema: <https://schema.org/>

SELECT ?page ?name WHERE {
  ?page a schema:Person ;
        schema:name ?name .
}
ORDER BY ?name
```
<!-- sparql:end -->
