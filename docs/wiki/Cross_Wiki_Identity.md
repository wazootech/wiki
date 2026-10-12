---
type: TechArticle
description: How one real-world entity that appears in two composed wikis is, and is not, merged — same-basename collisions, owl:sameAs versus schema:sameAs, and the @id alternative.
---

# Cross-Wiki Identity

[Composing wikis](Recursive_Semantic_Datasets.md) answers "query everything together". This page answers the other half: when two wikis both describe the same person, how many nodes does the merged graph hold, and how do you make it one.

The rule that drives everything: **a page's RDF subject comes from the _root_ wiki's `graph.context.wiki`, not from the base of the repository the page came from.** An installed source's pages are subjects under the host wiki's base, with their triples kept in that source's [named graph](Recursive_Semantic_Datasets.md).

The walkthrough below was run end to end against two throwaway wikis. Query output is abbreviated: IRIs are shown as CURIEs and columns trimmed.

## Set up

A host wiki (`https://me.example/`) with a curated page, and a generated source wiki (`https://acm.example/`) with a page for the same person under a different filename.

```yaml
# host/wiki.yml
wiki:
  input: [wiki]
graph:
  context:
    wiki: https://me.example/
    schema: https://schema.org/
sources:
  - name: acm
    type: git
    url: file:///path/to/acm-memory # or a GitHub URL
    ref: main
    path: wiki
```

```yaml
# host/wiki/Ethan_Davidson.md
---
'@type': schema:Person
schema:name: Ethan Davidson
schema:birthDate: 1999-01-01
---
```

```yaml
# acm-memory/wiki/Ethan_T_Davidson.md
---
'@type': schema:Person
schema:name: Ethan Davidson
schema:jobTitle: Officer
---
```

```bash
wiki install
wiki graph list
```

```text
name  kind    uri                                   commit        required_by
root  root    https://me.example/graphs/root
acm   source  https://me.example/graphs/source/acm  a447973c60d1  root
```

## Same basename: one subject, and a failing check

If the source also calls its page `Ethan_Davidson.md`, both pages resolve to the **same** IRI, `https://me.example/Ethan_Davidson`. There are not two nodes to reconcile: one subject holds both pages' triples, each in its own named graph.

```bash
wiki query --no-inference 'SELECT ?g ?p ?o WHERE {
  GRAPH ?g { <https://me.example/Ethan_Davidson> ?p ?o } }'
```

```text
https://me.example/graphs/root        schema:name       Ethan Davidson
https://me.example/graphs/root        schema:birthDate  1999-01-01
https://me.example/graphs/source/acm  schema:name       Ethan Davidson
https://me.example/graphs/source/acm  schema:jobTitle   Officer
```

Source pages are built like root pages, so the same basename is also an output collision, and `wiki check` fails:

```text
Errors:
  - Output collision on output path '/wiki/Ethan_Davidson/': page …/wiki/Ethan_Davidson.md conflicts with page …/.wiki/sources/acm/repo/wiki/Ethan_Davidson.md.
  - Output collision on public URL '/wiki/Ethan_Davidson/': …
```

Resolve it one of two ways:

- **Rename the source page** upstream (see [contributing changes to a source](Wiki_Configuration.md#contributing-changes-to-a-source)), then reconcile with `owl:sameAs`, below.
- **Exclude it** in the host's config: `wiki.exclude: ['.wiki/sources/acm/repo/wiki/Ethan_Davidson.md']`. `wiki check --strict` then passes, and the source's page is dropped from the graph too, so its triples are gone.

## Different basenames: two subjects

With `Ethan_Davidson.md` in the host and `Ethan_T_Davidson.md` in the source there are two subjects, `https://me.example/Ethan_Davidson` and `https://me.example/Ethan_T_Davidson`, and `wiki check --strict` passes. Nothing links them yet; every query returns the person twice.

## Reconcile with `owl:sameAs`

Point the curated page at the generated one:

```yaml
# host/wiki/Ethan_Davidson.md
---
'@type': schema:Person
schema:name: Ethan Davidson
schema:birthDate: 1999-01-01
owl:sameAs: https://me.example/Ethan_T_Davidson
---
```

With inference on (the default), the bundled OWL 2 RL rules treat the two subjects as one: each now answers with the union of both pages' properties.

```bash
wiki query 'SELECT ?p ?o WHERE { <https://me.example/Ethan_Davidson> ?p ?o }'
```

```text
rdf:type          schema:Person
schema:name       Ethan Davidson
schema:birthDate  1999-01-01
owl:sameAs        https://me.example/Ethan_T_Davidson
schema:jobTitle   Officer
```

The reverse subject, `Ethan_T_Davidson`, answers with `birthDate` too.

### `schema:sameAs` is not enough

`schema:sameAs` is an ordinary property: it is recorded, and nothing merges. A query over a composed corpus still sees two nodes, and `wiki query` with `schema:sameAs` returns only the triples each page states itself.

If you must keep `schema:sameAs` (it is what search engines read), either write both, or consolidate in the query without relying on inference:

```bash
wiki query --no-inference 'PREFIX schema: <https://schema.org/>
SELECT ?p ?o WHERE {
  { <https://me.example/Ethan_Davidson> ?p ?o }
  UNION { <https://me.example/Ethan_Davidson> schema:sameAs ?other . ?other ?p ?o }
}'
```

## The `@id` alternative

A page can set its own subject with `@id` instead of taking one from its filename. Giving the generated page an external identifier and pointing `owl:sameAs` at it also merges:

```yaml
# acm-memory/wiki/Ethan_T_Davidson.md
---
'@id': https://acm.example/#Ethan_T_Davidson
'@type': schema:Person
schema:name: Ethan Davidson
schema:jobTitle: Officer
---
```

The tradeoff is rendering. `wiki query --format markdown` links only subjects under the wiki's base IRI to their page; a subject with an external `@id` prints as a bare IRI:

```text
| s                                       | o                                       |
| [Ethan_Davidson](Ethan_Davidson.md)     | https://acm.example/#Ethan_T_Davidson   |
| https://acm.example/#Ethan_T_Davidson   | [Ethan_Davidson](Ethan_Davidson.md)     |
```

Prefer filename-derived subjects plus `owl:sameAs` unless the identifier must be stable outside the wiki, such as a Wikidata entity.

## Recommendations

- Give the generated record its own filename (an identifier-keyed name works well) so it never collides with a curated page.
- Reconcile curated and generated records with `owl:sameAs` on the curated page.
- Leave `@id` overrides for identifiers that outlive the wiki.
- Run `wiki check --strict` after composing; a same-basename overlap is an error, not a silent merge.

## Related

- [Recursive Semantic Datasets](Recursive_Semantic_Datasets.md)
- [Wiki Configuration](Wiki_Configuration.md#external-data-sources-sources)
- [Memory Repo Best Practices](Memory_Repo_Best_Practices.md)
- [Style Guide](Style_Guide.md#frontmatter)
