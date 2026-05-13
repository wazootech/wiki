# Streamlined CLI architecture

## Status

Proposed / Approved

## Context

As the `LLM Wiki CLI` project evolved, multiple overlapping and nested subcommands were introduced:
1. `wiki validate` focused solely on SHACL validation, while `wiki check` ran both SHACL validation and style audits, creating a confusing division of checking capabilities.
2. Frontmatter formatting/normalization was isolated under `wiki frontmatter normalize`, which introduced unnecessary nesting and added command-line surface area.
3. Exporting frontmatter to JSON-LD was nested under `wiki frontmatter jsonld`, making the `frontmatter` group redundant once normalization was merged.

To align with the goal of keeping the CLI "sweet and simple" with a highly controlled scope, we wanted to flatten the command-line interface, remove redundant subcommands.

## Decision

We decided to streamline the CLI commands into four flat, intuitive top-level subcommands:

1. **`wiki check`**: Unifies all vault health inspections (SHACL validation + style/hygiene audits).
   * Supports a `--fix` option which automatically normalizes and standardizes **Frontmatter** casing and formatting inline, eliminating the separate `frontmatter normalize` command.
2. **`wiki export`**: Flattens and replaces `wiki frontmatter jsonld` as a top-level command to compile and export the **Frontmatter** of all **Documents** as canonical JSON-LD.
3. **`wiki query`**: Retains its role to execute raw SPARQL queries against the expanded RDF graph.
4. **`wiki render`**: Retains its role to inline-update embedded SPARQL blocks in markdown files.

The separate `validate` command and the `frontmatter` command group are entirely removed.

## Consequences

### Positive
* **Minimal Command Surface**: The CLI is flat, extremely easy to learn, and has zero nested command groups.
* **Unified Checking UX**: All validation, style auditing, and auto-fixing are unified under `check` and `check --fix`.
* **Extensible Exporting**: Moving JSON-LD to `wiki export` provides a clean, top-level extension point for exporting other formats (e.g., Turtle, HTML) in the future.

### Negative
* Breaking changes for users accustomed to `wiki validate` or `wiki frontmatter normalize`. We mitigate this by clearly updating documentation and the `README.md`.
