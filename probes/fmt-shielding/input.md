---
type: schema:Person
name: Probe page
wazoo:layout: layouts/probe.html
aliases: [Probe, "Quoted Alias"]
%probe.frontmatter_token%: kept
---

# Probe page

Prose with *emphasis*, **strong**, and `code`, plus a deliberate hard break at
the end of this line.  
And a second sentence after it.

A [standard link](Other.md), a [[Wikilink]], and a %wiki.base_url% token.

| Column A     | Column B | Column C |
| ------------ | :------: | -------: |
| a            |    b     |        c |
| longer value |    x     |        y |

<!-- sparql:start
```sparql
PREFIX schema: <https://schema.org/>

SELECT ?name WHERE {
  ?p a schema:Person ;
     schema:name ?name .
} ORDER BY ?name
```
<!-- sparql:end -->

~~~turtle
@prefix ex: <https://example.org/> .
ex:a ex:b ex:c .
~~~

Terminal sentence.
