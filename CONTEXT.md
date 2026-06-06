# LLM Wiki (`wazootech-wiki`)

A clean, pure, idiomatic Python CLI for managing a semantic knowledge base of markdown documents with SHACL validation and SPARQL reasoning.

## Language

**Wiki**: An LLM-managed knowledge base of markdown files containing structured frontmatter. _Avoid_: Book, repository, database.

**Vault**: The markdown corpus the CLI loads from `input_dirs` (paths relative to the config file, usually beside `wiki.yaml`). A vault is the on-disk home of **Documents**, shapes, and embedded SPARQL; the CLI compiles it into the RDF graph. In this repository, `docs/wiki/`. _Avoid_: Workspace, content root, repo.

**Document**: An individual Markdown page in the vault containing a metadata block. _Avoid_: Page, post, wiki page.

**Frontmatter**: A YAML or JSON metadata block at the top of a Document, mapping to a JSON-LD compliant representation. _Avoid_: Metadata, header.

**Context**: The namespace mapping and prefix bindings (similar to JSON-LD `@context`) embedded inside a WikiConfig. _Avoid_: Namespace list.

**WikiConfig**: The central configuration managing CLI settings, directories, check rules, and the Context. _Avoid_: Config, parameters, settings.

**Namespaces**: The mapping of prefix keys to URI values used for RDF conversion and SPARQL queries. _Avoid_: Prefixes, prefixes list.

**Inference**: The process of applying OWL-RL deductive reasoning to expand the RDF graph. _Avoid_: Reasoning, calculation.

**Axiom**: Ontological rules and schema definitions loaded from Turtle files to guide the inference process. _Avoid_: Rule, schema rule.

**Validation**: The process of checking the frontmatter of Documents against SHACL Shapes to ensure structure and value compliance. _Avoid_: Formatting check, manual review.

**Shape**: A SHACL constraint definition loaded from Turtle files to validate the structure of Documents. _Avoid_: Rule, template.

**Query**: A SPARQL query executed against the semantic RDF graph of the Wiki. _Avoid_: Search, database lookup.

**Rendering**: The process of executing embedded SPARQL Queries within Documents and injecting the formatted results back into the files. _Avoid_: Exporting, updating.

**Graph cache**: The in-process RDF graph held for the lifetime of a CLI run so multiple SPARQL queries and renders share one **Vault** build. _Avoid_: Disk cache, pickle store.

**Checking**: The process of running unified validations on the **Vault**, combining strict SHACL validation and configurable hygiene audits (`filename_pattern`, `broken_links`, optional `headings`). _Avoid_: Linting, testing.

**Exporting**: The process of compiling and exporting the Frontmatter of all Documents into a single canonical JSON-LD representation. _Avoid_: Saving, dumping.

**CLI**: The command-line interface built with Click for managing the wiki.

## Relationships

- A **Vault** is the filesystem corpus of **Documents** (and related assets) listed by `input_dirs`
- A **Wiki** is composed of the **Documents** in a **Vault**, compiled semantically at runtime
- A **Document** contains exactly one **Frontmatter** block
- The **CLI** manages, validates, and queries the **Wiki** using the **WikiConfig** which contains the **Context** and **Namespaces**
- **Inference** uses custom **Axioms** to expand the semantic RDF graph of the **Wiki**
- **Validation** checks **Documents** against custom **Shapes** to ensure data integrity
- **Checking** runs unified health checks (including **Validation**) on the **Vault** via `wiki check`; stale SPARQL blocks use `wiki render --check`
- **Query** executes custom SPARQL queries against the expanded RDF graph of the **Wiki**
- **Rendering** runs embedded **Queries** inside **Documents** and updates their dynamic sections inline
- **Graph cache** lets multiple **Queries** and **Rendering** steps in one CLI run reuse a single loaded RDF graph
- **Exporting** packages the **Frontmatter** of the **Wiki** into a unified JSON-LD graph






## Example dialogue

> **Dev:** "Does a **Document** always have to contain a **Frontmatter** block?"
> **Domain expert:** "Yes, a **Document** without **Frontmatter** is ignored by the **CLI** because it cannot be loaded into the RDF graph."
