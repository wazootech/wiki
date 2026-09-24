# Tables and fences

A deliberately ragged table with no alignment row padding:

|  Key|Type |Default|
|-|-|-|
|input|list|null|
|longer_key_name|string|"a very long default value"|

A table whose cells carry wikilinks and tokens:

|  Page | Token |
| --- | --- |
|[[Alice]]|%wiki.base_url%/assets/logo.svg|
|[[Bob]]|%wiki.head%|

A nested fence: four backticks wrapping a triple fence, which is how the docs
wiki shows fenced YAML inside a document.

````markdown
```yaml
wiki:  # optional block
  input: [wiki]                    # default [wiki]
```
````

Now a SPARQL block wrapped in a four-backtick fence, with trailing whitespace
inside the query text.

````markdown
<!-- sparql:start
```sparql
SELECT ?s WHERE {   ?s ?p ?o   }
```
<!-- sparql:end -->
````

A list with a continuation line and a nested item:

-   first item
    continued on the next line
-   second item
    -   nested item

Reference-style links and bare autolinks:

See [the docs][docs] and <https://example.org/>.

[docs]: https://example.org/docs
