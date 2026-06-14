# Style spot-check

Use when `lint.*` rules are `off` but conventions still matter. Canonical detail: wiki [Style Guide](https://github.com/wazootech/wiki/blob/main/docs/wiki/Style_Guide.md).

| Area | Convention |
| ---- | ---------- |
| Filenames | Wikipedia-style (`Page_Name.md`); `index.md` only for folder routes |
| Headings | Title-case H1; sentence-case H2+; no numbered headings; ATX `#` only |
| Links | Markdown `[text](Page.md)` when `link.style: markdown`; Obsidian `[[Page]]` when `obsidian` |
| Frontmatter | `type` / shapes aligned; CURIEs use `graph.context` |
| SPARQL | People → `givenName`/`familyName`; TechArticle → `headline`/`description` |
| Prose | No `---` thematic breaks in body; `## References` on standard pages |
