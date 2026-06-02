---
id: wiki:DesignPhilosophies
type: TechArticle
name: Design philosophies
description: Unix-style CLI design for the LLM Wiki tool.
---

# Design philosophies

## Silence is golden

[[CLI_check]], [[CLI_render]], and similar commands exit **0 with no output** on success. Use `-v` / `--verbose` when you want summaries. In CI, combine `check --strict -v` so warnings fail loudly.

## Pipes and filters

The CLI does not print to paper or own format-specific drivers. It writes **table**, **json**, **csv**, **turtle**, and other formats to stdout so you can compose Unix tools:

```bash
wiki query "SELECT ?name WHERE { ?s schema:name ?name }" | pr -h "Names" | lp
```

## Flat command surface

Subcommands are top-level (`wiki check`, not `wiki vault check`). Global options [[Global_Options]] apply everywhere.

## Userland over platform lock-in

Printing, PDF, and heavy formatting stay in your shell (`pr`, `lp`, Pandoc, etc.). The wiki tool focuses on graph construction, validation, and site generation.

## Related ADRs

Repository architecture notes live in `docs/adr/` (context-centric config, unified check, silence is golden, streamlined CLI).
