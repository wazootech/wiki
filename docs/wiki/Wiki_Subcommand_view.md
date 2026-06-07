---
type: TechArticle
name: wiki view
description: Terminal infobox view for a single wiki document.
---

# `wiki view`

Render one document as a terminal-friendly **infobox** plus markdown body (same typing rules as HTML build).

## Usage

```bash
wiki view wiki/Gregory_Davidson.md
wiki view wiki/record.yaml
```

## Arguments

| Argument | Description                                               |
| -------- | --------------------------------------------------------- |
| `FILE`   | Required `.md`, `.yaml`, `.yml`, or `.json` wiki document |

## Behavior

- Resolves `wiki:template` / `template` / `type` for layout
- Links internal `wiki:` IDs to page titles when targets exist
- Data-only files show infobox without a body section

## Related

- [Wiki_Subcommand_build](Wiki_Subcommand_build.md)
- [Style_Guide](Style_Guide.md)
