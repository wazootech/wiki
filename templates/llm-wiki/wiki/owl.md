---
id: wiki:owl
type: TechArticle
name: OWL
description: Web Ontology Language for rich and complex knowledge about things.
---

# OWL

The **Web Ontology Language (OWL)** is a family of knowledge representation languages for authoring ontologies. Ontologies are a formal way to describe taxonomies and classification networks, essentially defining the structure of knowledge for various domains.

OWL adds more vocabulary for describing properties and classes than basic RDF schema, including relations between classes (e.g. disjointness), cardinality (e.g. "exactly one"), equality, richer typing of properties, characteristics of properties (e.g. symmetry), and enumerated classes.

In this vault, OWL is used by the reasoning engine in the [[wiki-cli]] to perform deductive expansion of your graph (e.g., using OWL-RL rules).

## Defining custom RDFS/OWL axioms (reasoning)

Custom reasoning rules and class hierarchies are stored in your configured `reasoning/` directory. They expand your graph through OWL-RL deductive reasoning.

For example, to define that `Project` is a sub-class of `schema:CreativeWork`, and that a custom relationship `wiki:lead` is a sub-property of `schema:contributor`:

1. Create a file named `reasoning/project-axioms.ttl`.
2. Add RDFS/OWL assertion triples:

```turtle
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix schema: <https://schema.org/> .
@prefix wiki: <https://book.etok.me/wiki/> .

schema:Project rdfs:subClassOf schema:CreativeWork .
wiki:lead rdfs:subPropertyOf schema:contributor .
```

### Deductive reasoning consequences

Under OWL-RL reasoning rules, when you have a page:
```yaml
type: Project
name: Semantic Brain
lead: wiki:gregory
```

The reasoning engine automatically infers and adds the following facts to your graph:
* The page is also a `schema:CreativeWork`.
* `wiki:gregory` is a `schema:contributor` to the project.
