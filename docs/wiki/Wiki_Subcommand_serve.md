---
type: TechArticle
headline: wiki serve
description: Local HTTP server for live HTML preview.
---

# `wiki serve`

Start a development server that renders vault pages on demand.

## Usage

```bash
wiki serve
wiki serve --host 0.0.0.0 --port 3000
wiki serve --watch
wiki serve --base-url /my-wiki --style dir
python -m wiki serve --watch
```

## Options

| Flag         | Default          | Description                                                 |
| ------------ | ---------------- | ----------------------------------------------------------- |
| `--host`     | `127.0.0.1`      | Bind address                                                |
| `--port`     | `8080`           | Port                                                        |
| `--base-url` | from config      | Page URL prefix                                             |
| `--style`    | from `site.url_style` | `dir` or `file`                                        |
| `--watch`    | off              | Rebuild graph, SPARQL blocks, and reload browser on changes |

Default URL with config `site.base_url: /wiki`: `http://127.0.0.1:8080/wiki/`.

## SPARQL endpoint

When `sparql_service.enabled` is on, `wiki serve` also exposes a read-only SPARQL endpoint at `sparql_service.path` (default `/api/sparql`).

A bare `GET` on that path (no query string) returns a [SPARQL 1.1 Service Description](https://www.w3.org/TR/sparql11-service-description/) document describing supported languages, result formats, and the default dataset. Content negotiation applies (`text/turtle`, `application/rdf+xml`, or `application/n-triples`).

Example config:

```yaml
sparql_service:
  enabled: true
  path: /api/sparql
```

Supported request forms:

```bash
# Service description (SPARQL 1.1 Service Description)
curl "http://127.0.0.1:8080/api/sparql" -H "Accept: text/turtle"

# GET with query string
curl "http://127.0.0.1:8080/api/sparql?query=SELECT%20*%20WHERE%20%7B%20?s%20?p%20?o%20%7D" \
  -H "Accept: application/sparql-results+json"

# POST raw SPARQL query
curl "http://127.0.0.1:8080/api/sparql" \
  -H "Content-Type: application/sparql-query" \
  -H "Accept: text/turtle" \
  --data "CONSTRUCT { ?s ?p ?o } WHERE { ?s ?p ?o }"
```

Wiki-specific extensions:

- `inference=true|false`
- `reload=true|false`

The endpoint reuses the same query engine as [Wiki_Subcommand_query](Wiki_Subcommand_query.md). SPARQL Update operations are rejected.

For safety, the endpoint is **disabled by default**. Its path is also validated at startup and rejected if it would shadow page routes or the `__watch` endpoint.

## Wiki page layout

The same `site.layout` from [Wiki_Configuration](Wiki_Configuration.md#page-layout) applies to the dev server.

## Metadata view

The live page metadata panel supports RDF formats without JavaScript: compacted JSON-LD, Turtle, N3, RDF/XML, N-Triples, TriG, and N-Quads. A compact **Format** chip row selects the view. Set the initial chip with `?metadata_format=FORMAT` (for example `turtle` or `json-ld`).

## Related

- [Wiki_Subcommand_build](Wiki_Subcommand_build.md)
- [Graph_Cache](Graph_Cache.md)
- [Wiki_Configuration](Wiki_Configuration.md#page-layout)
