# LLM Wiki Starter Template

This directory provides a ready-to-use foundation for building a private semantic knowledge base using the **Wiki CLI**. It scaffolds a fully functioning local vault environment powered by SHACL shapes and OWL-RL inference.

## Structure

* **`wiki.yaml`**: Active configuration defining the root of the vault ecosystem.
* **`wiki/`**: Primary repository hosting both your human-readable documentation and machine-readable semantic logic (embedded SHACL constraints and RDFS/OWL axioms).

## Getting started

### Initialize environment
Ensure the `wiki-cli` is available in your environment (from the repository root):
```bash
uv sync
```

### Verify health
From within this template directory, execute a unified environment check to confirm the base setup is structurally correct:
```bash
uv run wiki check -v
```

## Essential workflows

### Create a new article
To instantly generate a clean Markdown file pre-populated with a boilerplate ID and type:
```bash
uv run wiki create "My New Concept"
```

### Sync dynamic indexes
If your pages utilize embedded SPARQL comment blocks (`<!-- sparql:start -->`), maintain chronological accuracy and generate cross-referenced tables automatically:
```bash
uv run wiki render
```

### Query the graph
Execute ad-hoc semantic lookups directly on your corpus without loading custom UIs:
```bash
uv run wiki query "SELECT ?s WHERE { ?s schema:name ?name }"
```
