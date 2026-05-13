# Userland printing

## Context

In a previous iteration of the `LLM Wiki CLI`, a custom `print` subcommand was introduced to list available printers and print single documents, all documents, or SPARQL query results to local or Wi-Fi printers.

However, implementing printing natively inside the CLI introduced several severe issues:
1. **Platform Lock-In**: The `print` command relied heavily on Windows-specific PowerShell APIs (`Win32_Printer`) and `.NET` assemblies (`System.Drawing.Printing.PrintDocument`). This broke compatibility for macOS and Linux users.
2. **Reinventing the Wheel**: Custom algorithms for font-measuring, margins, line wrapping, and multi-page pagination had to be written and maintained in Python/PowerShell templates.
3. **Core Domain Scope Creep**: As defined in [CONTEXT.md](../../CONTEXT.md), the core domain of `wiki` is semantic knowledge management (RDF graphs, SHACL validation, SPARQL reasoning/rendering, and JSON-LD conversion). Low-level hardware print layout management is an entirely orthogonal concern.

## Decision

We decided to **remove the `print` subcommand** from the core CLI and adopt a pure **Unix-style Pipes & Filters** architecture. 

By ensuring that `wiki` conforms strictly to standard output streams (`stdout`) and provides flexible formatting options (e.g., `markdown`, `json`, `csv`, `tsv`, `table`), we delegate formatting, pagination, and printer spooling to dedicated system utilities.

## Consequences

### Positive
* **Cross-Platform Purity**: The CLI remains written in pure, portable Python and runs seamlessly on Linux, macOS, and Windows.
* **Codebase Simplification**: Removing the Windows-specific printer code reduces [__main__.py](../../src/llm_wiki/__main__.py) by ~190 lines of highly brittle, difficult-to-test logic.
* **Philosophical Alignment**: Users gain the full power of dedicated typesetting and filtering programs (like `pr`, `lp`, `pandoc`, or PowerShell's native streams) instead of being locked into a rigid, custom-coded printing subset.

### Negative
* Users must execute piped shell chains rather than a single `wiki print` command. We mitigate this by providing extensive documentation and copy-pasteable snippets in the `README.md`.
