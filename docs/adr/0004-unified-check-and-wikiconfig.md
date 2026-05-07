# Unified check command and WikiConfig

We decided to introduce a unified `check` subcommand to perform both strict SHACL validation and soft stylistic/hygiene audits, managed under a new `wiki.yaml`, `wiki.yml`, or `wiki.json` configuration file (`WikiConfig`) which contains the namespace prefix mapping (`Context`).

## Context

The `wiki validate` command was strictly focused on semantic/SHACL schema conformance of frontmatter blocks. However, authors also need to verify stylistic guidelines (like lowercase kebab-case filenames, broken internal wikilinks, and sentence-case headings). 

Rather than overloading `validate` or creating multiple disjoint lint commands, we wanted a single unified subcommand `check` that executes both strict semantic validations and softer stylistic checks under one entry point, with warnings silenced by default under the "silence is golden" philosophy unless requested.

## Decision

1. **`check` Subcommand:** Introduce a unified `wiki check` subcommand.
2. **`WikiConfig` and `Context` separation:** The workspace is configured via a `wiki.yaml`, `wiki.yml`, or `wiki.json` file representing the `WikiConfig`. It holds paths and check-rule configurations. Inside it, a `context` or `@context` block defines the RDF namespace prefix mappings (`Context`).
3. **Warnings and "Silence is Golden":** Stylistic warnings exit with `0` and are silenced by default, showing only under `-v`/`--verbose` or `--warnings`, or elevated to errors via `--strict`.

## Consequences

* **Unified UX:** Users and CI/CD can run a single `wiki check` command to verify entire vault health.
* **Separation of Concerns:** SHACL validations remain mathematically strict, while stylistic rules remain customizable warnings.
* **JSON-LD Compatibility:** Supporting both `"context"` and `"@context"` allows `wiki.json` to remain compatible with standard JSON-LD parsing.
