---
type: TechArticle
headline: wiki serve
description: Local HTTP server for live HTML preview and optional read-only SPARQL endpoint.
---

# `wiki serve`

Start a development server that renders wiki pages on demand.

## Usage

```bash
wiki serve
wiki serve --host 0.0.0.0 --port 3000
wiki serve --watch
wiki serve --site-base-url /my-wiki --site-url-style dir
python -m wiki serve --watch
```

## Options

| Flag               | Default     | Description                                                 |
| ------------------ | ----------- | ----------------------------------------------------------- |
| `--host`           | `127.0.0.1` | Bind address                                                |
| `--port`           | `8080`      | Port                                                        |
| `--site-base-url`  | from config | Override `site.base_url` page URL prefix                    |
| `--site-url-style` | from config | Override `site.url_style`: `dir` or `file`                  |
| `--watch`          | off         | Rebuild graph, SPARQL blocks, and reload browser on changes |

Default URL with config `site.base_url: /wiki`: `http://127.0.0.1:8080/wiki/`.

## SPARQL endpoint

When `sparql_service.enabled` is on, `wiki serve` also exposes a read-only SPARQL endpoint at `sparql_service.path` (default `/api/sparql`). See [Wiki Configuration](Wiki_Configuration.md#serve-api) for config keys, opt-in defaults, and path collision rules.

A bare `GET` on that path (no query string) returns a [SPARQL 1.1 Service Description](https://www.w3.org/TR/sparql11-service-description/) document (OWL-RL as the default entailment profile, supported result formats, default dataset triple count when available). Content negotiation applies: `text/turtle`, `application/rdf+xml`, or `application/n-triples`.

Example config:

```yaml
sparql_service:
  enabled: true
  path: /api/sparql
```

### Supported query forms

`SELECT`, `ASK`, `CONSTRUCT`, and `DESCRIBE` are accepted. SPARQL Update is rejected with `405`.

### Request forms

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

# POST application/x-www-form-urlencoded (query= plus optional inference/reload)
curl "http://127.0.0.1:8080/api/sparql" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -H "Accept: application/sparql-results+json" \
  --data "query=ASK%20%7B%20%3Fs%20%3Fp%20%3Fo%20%7D"
```

Use the `Accept` header to choose the response serialization. Unsupported values return `406`.

| Query form              | Accepted `Accept` values                                                             |
| ----------------------- | ------------------------------------------------------------------------------------ |
| `SELECT`, `ASK`         | `application/sparql-results+json` (default), `text/csv`, `text/tab-separated-values` |
| `CONSTRUCT`, `DESCRIBE` | `text/turtle` (default), `application/n-triples`, `text/n3`                          |

Wiki-specific query parameters (GET query string, or form body on `application/x-www-form-urlencoded` POST):

- `inference=true|false` — OWL-RL inference (default `true`; mirrors `wiki query` unless `--no-inference`)
- `reload=true|false` — rebuild the in-memory graph before executing (default `false`)

The endpoint reuses the same query engine as [Wiki Subcommand query](Wiki_Subcommand_query.md).

For safety, the endpoint is **disabled by default**. Its path is validated at startup and rejected if it would shadow page routes or the `__watch` endpoint.

## Wiki page layout

The same `site.layout` from [Wiki Configuration](Wiki_Configuration.md#page-layout) applies to the dev server — a page layout (`.html`; packaged `index.html` when unset). Per-page overrides use `wazoo:layout` in frontmatter; see [Wiki Page Layouts](Wiki_Page_Layouts.md). Page bodies use the same markdown renderer as `wiki build`; raw HTML in markdown is not emitted as live markup.

## Metadata view

The live page metadata panel supports RDF formats without JavaScript: compacted JSON-LD, Turtle, N3, RDF/XML, N-Triples, TriG, and N-Quads. A compact **Format** chip row selects the view. Set the initial chip with `?metadata_format=FORMAT` (for example `turtle` or `json-ld`). See [Content Negotiation](Content_Negotiation.md) for the HTTP `Accept` model.

## Related

- [Wiki Subcommand build](Wiki_Subcommand_build.md)
- [Wiki Subcommand query](Wiki_Subcommand_query.md)
- [SPARQL](SPARQL.md)
- [Graph Cache](Graph_Cache.md)
- [Wiki Configuration](Wiki_Configuration.md#serve-api)
- [Content Negotiation](Content_Negotiation.md)
