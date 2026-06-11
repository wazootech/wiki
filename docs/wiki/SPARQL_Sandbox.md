---
type: TechArticle
headline: SPARQL sandbox
description: External GitHub template for exploring vault RDF with YASGUI.
---

# SPARQL sandbox

The **[wiki-sparql-sandbox](https://github.com/wazootech/wiki-sparql-sandbox)** template is a standalone repository (not part of the CLI package) for exploring vault RDF in [YASGUI](https://yasgui.org/). **Live demo:** [wazootech.github.io/wiki-sparql-sandbox/](https://wazootech.github.io/wiki-sparql-sandbox/) uses the pre-exported `data/vault.ttl` on GitHub Pages for a zero-server demo, or point YASGUI at the read-only endpoint from `wiki serve` when `sparql_service.enabled` is true ([Wiki Subcommand serve](Wiki_Subcommand_serve.md#sparql-endpoint)). Regenerate Turtle with `wiki export -f turtle -o data/vault.ttl` in that template's sample vault.

## Related

- [SPARQL](SPARQL.md)
- [Wiki CLI](Wiki_CLI.md)
- [Wiki Subcommand export](Wiki_Subcommand_export.md)
