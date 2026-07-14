---
type: TechArticle
headline: OWL
description: Web Ontology Language for rich and complex knowledge about things.
---

# OWL

The **Web Ontology Language (OWL)** is a family of knowledge representation languages for authoring ontologies. Ontologies are a formal way to describe taxonomies and classification networks, essentially defining the structure of knowledge for various domains.

OWL adds more vocabulary for describing properties and classes than basic RDF schema, including relations between classes (e.g. disjointness), cardinality (e.g. "exactly one"), equality, richer typing of properties, characteristics of properties (e.g. symmetry), and enumerated classes.

In this wiki, OWL is used by the reasoning engine in the [wiki](wiki.md) to perform deductive expansion of your graph (e.g., using OWL-RL rules).

## Defining custom RDFS/OWL axioms

Custom reasoning rules and class hierarchies can be declared natively in file Frontmatter or standalone `.ttl` imports. The reasoning engine automatically scans the combined pool.

To define a hierarchy such that `TechArticle` is a specialized subset of `schema:CreativeWork`, you can declare it directly in the ontology:

```yaml
# wiki/tech-article.md
---
id: wiki:TechArticle
type: owl:Class
rdfs:subClassOf: schema:CreativeWork
---
```

### Deductive reasoning consequences

Under OWL-RL reasoning rules, when you have a page:

```yaml
type: TechArticle
name: Learning SPARQL
```

The reasoning engine automatically infers and adds the following facts to your graph:

- The page is also a `schema:CreativeWork`.

## Related

- [Graph Cache](Graph_Cache.md) — inference defaults and graph reuse
- [wiki query](wiki_query.md) — `--no-inference`
- [wiki serve](wiki_serve.md#sparql-endpoint) — `inference=` query parameter
- [RDF](RDF.md)

## References

- [OWL 2 Web Ontology Language — Document Overview](https://www.w3.org/TR/owl2-overview/)
