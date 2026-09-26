---
type: TechArticle
headline: Content Negotiation
description: Managing resource representations through HTTP request headers.
---

# Content Negotiation

**Content negotiation** is the mechanism defined in the HTTP specification that allows for the delivery of different versions of a resource at the same URI. This enables the same endpoint to deliver data as HTML to a browser, but as [RDF](RDF.md) or [JSON](JSON.md) to an API client.

## Request headers

Clients supply preferences via explicit HTTP headers, which the server audits to decide the best response format:

### `Accept`

Defines the media types that the client is willing to receive.

- `Accept: text/html` (Requesting visual website)
- `Accept: application/ld+json` (Requesting machine-readable [JSON LD](JSON_LD.md))
- `Accept: text/turtle` (Requesting standard triples via [Turtle](Turtle.md))
- `Accept: text/n3` (Requesting verbose RDF via [Notation3](Notation3.md))
- `Accept: application/n-triples` (Requesting line-oriented triples via [N Triples](N_Triples.md))
- `Accept: application/trig` (Requesting named-graph RDF via [TriG](TriG.md))
- `Accept: application/n-quads` (Requesting line-oriented quads via [N Quads](N_Quads.md))
- `Accept: text/csv` (Requesting tabular data via [CSV](CSV.md))

### `Accept-Language`

Informs the server about the client's language preferences (e.g., `en-US`, `fr`).

### `Accept-Encoding`

Identifies what compression algorithms (gzip, deflate, br) the client understands.

## Importance in the [semantic web](Semantic_Web.md)

In a [Semantic Web](Semantic_Web.md) compliant system, URIs identifying real-world resources should behave intelligently. When a human navigates to the URI, the server employs content negotiation to render the [HTML](HTML.md) page. When a crawler or reasoning agent requests the exact same URI, the server can provide the machine-readable, structured data, like [RDF](RDF.md) or [JSON](JSON_LD.md).

## In this wiki

The [wiki](wiki.md) applies content negotiation in two places:

- **SPARQL endpoint** on `wiki serve` when enabled — `Accept` selects SPARQL Results JSON, CSV, TSV, or a supported RDF graph serialization ([wiki serve](wiki_serve.md#sparql-endpoint)). RDF/XML output is not supported by the Deno/TypeScript engine; requesting `application/rdf+xml` returns `406 Not Acceptable`.
- **Static docs metadata panel** in this repository — compacted JSON-LD, Turtle, N3, N-Triples, TriG, and N-Quads. RDF/XML output is deferred and is not listed as a panel format.

## Related

- [wiki serve](wiki_serve.md)
- [wiki build](wiki_build.md)
- [RDF](RDF.md)
- [JSON LD](JSON_LD.md)
- [Turtle](Turtle.md)

## References

- [RFC 7231 — Content Negotiation](https://www.rfc-editor.org/rfc/rfc7231#section-5.3.2)
- [Content negotiation — MDN Web Docs](https://developer.mozilla.org/en-US/docs/Web/HTTP/Content_negotiation)
