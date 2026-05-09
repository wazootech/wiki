---
id: wiki:negotiation
type: TechArticle
name: Content negotiation
description: Managing resource representations through HTTP request headers.
---

# Content negotiation

**Content negotiation** is the mechanism defined in the HTTP specification that allows for the delivery of different versions of a resource at the same URI. This enables the same endpoint to deliver data as HTML to a browser, but as RDF or [[json]] to an API client.

## Request headers

Clients supply preferences via explicit HTTP headers, which the server audits to decide the best response format:

### `Accept`
Defines the media types that the client is willing to receive. 
* `Accept: text/html` (Requesting visual website)
* `Accept: application/ld+json` (Requesting machine-readable [[json-ld]])
* `Accept: text/turtle` (Requesting standard triples via [[turtle]])
* `Accept: text/n3` (Requesting verbose RDF via [[notation3]])
* `Accept: text/csv` (Requesting tabular data via [[csv]])

### `Accept-Language`
Informs the server about the client's language preferences (e.g., `en-US`, `fr`).

### `Accept-Encoding`
Identifies what compression algorithms (gzip, deflate, br) the client understands.

## Importance in the semantic web

In a [[semantic-web]] compliant system, URIs identifying real-world resources should behave intelligently. When a human navigates to the URI, the server employs content negotiation to render the [[html]] page. When a crawler or reasoning agent requests the exact same URI, the server can provide the structured machine graph.
