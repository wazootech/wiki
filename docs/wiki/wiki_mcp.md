---
type: TechArticle
headline: wiki mcp
description: Run an MCP server for querying the wiki graph, with opt-in page-edit tools.
---

# `wiki mcp`

Start a local [Model Context Protocol](https://modelcontextprotocol.io/) server for the configured Wiki graph. The server is read-only and query-first by default: it exposes SPARQL execution, graph context, and page inspection for agents. Started with `--allow-write`, it also lists [page-edit tools](#page-edit-tools-allow-write) that wrap `wiki edit`; it never offers formatting, link repair, build, or generic filesystem tools.

## Usage

```bash
wiki mcp
wiki -c docs/wiki.yml mcp
wiki --input docs/wiki mcp
wiki mcp --mode stdio
wiki mcp --cache
wiki mcp --allow-write
```

`stdio` is the default and only transport in the first version.

## Claude Code setup

Register the local server with Claude Code:

```bash
claude mcp add wiki -- wiki -c docs/wiki.yml mcp
```

Generic stdio MCP clients should run the same command shape:

```bash
wiki -c docs/wiki.yml mcp
```

## Options

| Flag            | Default | Description                                                                              |
| --------------- | ------- | ---------------------------------------------------------------------------------------- |
| `--mode`        | `stdio` | MCP transport mode.                                                                      |
| `--cache`       | off     | Persist graph artifacts under `.wiki/cache` across launches.                             |
| `--allow-write` | off     | List and serve the [page-edit tools](#page-edit-tools-allow-write). Off means read-only. |

## Tools

### `query_sparql`

Execute SPARQL against the compiled wiki graph.

Parameters:

```json
{
  "query": "SELECT ?s ?p ?o WHERE { ?s ?p ?o } LIMIT 10",
  "format": "json",
  "inference": true,
  "reload": false
}
```

Allowed query forms: `SELECT`, `ASK`, `CONSTRUCT`, and `DESCRIBE`. SPARQL Update and unsupported query forms are rejected before execution.

`format` reuses [wiki query](wiki_query.md) names and aliases: `table`, `json`, `csv`, `tsv`, `turtle`, `n3`, and `markdown`. The MCP default is `json`.

The tool returns a structured object:

```json
{
  "format": "json",
  "query_form": "SELECT",
  "result": "..."
}
```

### `describe_wiki`

Return factual context for writing grounded SPARQL:

- Wiki CLI version
- Config path and inputs
- Namespace bindings from the built graph
- Graph stats for the default inferred graph
- Observed vocabulary from the graph

The vocabulary summary is intentionally load-bearing for agent use. It lists real classes and predicates so agents can avoid inventing predicates, getting empty results, and treating a bad query as missing data.

Example shape:

```json
{
  "version": "0.4.1",
  "config": "docs/wiki.yml",
  "inputs": ["docs/wiki"],
  "namespaces": {
    "schema": "https://schema.org/",
    "wiki": "https://wiki.example.org/"
  },
  "graph": {
    "triples": 1234,
    "subjects": 120,
    "predicates": 45,
    "objects": 900,
    "inference": true
  },
  "vocabulary": {
    "classes": [
      {
        "iri": "https://schema.org/Person",
        "curie": "schema:Person",
        "count": 12
      }
    ],
    "predicates": [
      { "iri": "https://schema.org/name", "curie": "schema:name", "count": 42 }
    ]
  }
}
```

Vocabulary limits are intentionally compact: top 25 classes by `rdf:type` usage and top 50 predicates by triple count.

## Page tools

Always available, read-only. Paths are relative to the config root, as in `wiki edit`.

| Tool             | Wraps       | Returns                                                                               |
| ---------------- | ----------- | ------------------------------------------------------------------------------------- |
| `wiki_page_show` | `wiki show` | Frontmatter, headings, outbound links, and the `hash` to pass as `expect` in an edit. |
| `wiki_page_refs` | `wiki refs` | The pages that link to, and are linked from, the page.                                |

## Page-edit tools (`--allow-write`)

Listed only when the server starts with `wiki mcp --allow-write`. Every tool is a thin wrapper that builds a `WikiEdit` and calls `Wiki.edit()`, so validation, `expect` preconditions, and all-or-nothing writes are the same as `wiki edit`.

| Tool                  | Single operation                                                                     |
| --------------------- | ------------------------------------------------------------------------------------ |
| `wiki_edit_apply`     | A batch of ops (`create`, `replace`, `set`, `patch`, `move`, `delete`). Prefer this. |
| `wiki_page_create`    | `create`, from `content` or a typed scaffold (`type`, `frontmatter`, `body`).        |
| `wiki_page_set_field` | `set` one frontmatter field (`value`, or `yaml` to keep its spelling).               |
| `wiki_page_patch`     | `patch` the body, a heading's section, or the frontmatter.                           |
| `wiki_page_move`      | `move` a page and repoint its links.                                                 |
| `wiki_page_delete`    | `delete` a page; `prune_links` turns inbound links into plain text.                  |

Safety:

- **Dry run by default.** Each tool takes `dry_run` (default `true`). The report is the one `wiki edit --json` returns; nothing is written until `dry_run: false`.
- **Failures are results, not errors.** A rejection (`status: "rejected"`) or a stale `expect` (`status: "conflict"`) comes back with `isError: true` and the full report in `structuredContent`, so the agent can repair and retry. A malformed edit is also an `isError` result. Nothing is thrown as a JSON-RPC error.
- **Scoped paths.** Edits are confined to the wiki's documents; `.wiki/` (installed sources and the cache) stays read-only.
- **No force.** The MCP tools do not expose `wiki edit --force`.
- **Graph stays current.** After an applied edit, the next query or resource read rebuilds the in-memory graph.

Loop: `wiki_page_show` for the `hash`, then a dry run with `expect`, then the same call with `dry_run: false`.

## Resources

| Resource            | MIME type          | Purpose                                                        |
| ------------------- | ------------------ | -------------------------------------------------------------- |
| `wiki://info`       | `application/json` | Version, config, inputs, graph settings, stats, and vocabulary |
| `wiki://namespaces` | `application/json` | Prefix map for SPARQL authoring                                |
| `wiki://graph.ttl`  | `text/turtle`      | Current inferred graph serialized as Turtle                    |

## Safety model

`wiki mcp` is read-only by default, and `--allow-write` is the only way to change that:

- No wiki source mutation (without `--allow-write`; see [Page-edit tools](#page-edit-tools-allow-write) for what it adds)
- No build output writes
- No formatting changes
- No link repair
- No generic file read/write tools
- No Obsidian automation
- No SPARQL Update

The command reuses the same graph cache behavior as other Wiki CLI operations: in-process caching is always used within one running MCP server, and `--cache` enables filesystem persistence under `.wiki/cache` for faster reuse across MCP launches. `reload=true` on `query_sparql` rebuilds the in-memory graph before executing the query; with `--cache`, the rebuilt graph is also written back to the filesystem cache.

## Related

- [wiki query](wiki_query.md)
- [wiki serve](wiki_serve.md#sparql-endpoint)
- [Graph Cache](Graph_Cache.md)
- [SPARQL](SPARQL.md)
