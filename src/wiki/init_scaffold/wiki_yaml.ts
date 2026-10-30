import {
  DEFAULT_BASE_URL,
  DEFAULT_URL_STYLE,
  type InitOptions,
} from "./options.ts";
import { normalizeInitOptionStyles } from "./normalize.ts";

function yamlString(value: string): string {
  return JSON.stringify(value);
}

export function renderWikiYaml(options: InitOptions): string {
  options = normalizeInitOptionStyles(options);
  const baseUrl = options.site_base_url ?? DEFAULT_BASE_URL;
  const urlStyle = options.site_url_style ?? DEFAULT_URL_STYLE;
  const lines = [
    "",
    "# Wiki paths, assets, and filename policy (wiki check / wiki lint).",
    "wiki:",
    "  # Markdown and data directories to index (relative to this file).",
    "  input:",
  ];
  const inputs = options.wiki_inputs?.length ? options.wiki_inputs : ["wiki"];
  for (const input of inputs) lines.push(`    - ${yamlString(input)}`);
  lines.push(
    "  # Static files for custom CSS, logos, favicons (copied on wiki build).",
    '  # Defaults to ["assets"] when that directory exists; uncomment to list more.',
    "  # assets:",
    "  #   - assets",
    "  # Full-filename regex for markdown files (lint.filename_pattern severity).",
    '  filename_pattern: "[A-Za-z0-9_()-]+\\\\.md"',
    "  # Glob patterns skipped when indexing (POSIX paths relative to config root).",
    "  # exclude:",
    "  #   - assets/private/**",
    "",
    "# RDF document URIs, prefixes, and graph build settings.",
    "graph:",
  );
  if (options.graph_content_predicate) {
    lines.push(
      "  # Predicate for full-text body literals in SPARQL (for example schema:articleBody).",
      `  content_predicate: ${yamlString(options.graph_content_predicate)}`,
    );
  } else lines.push("  # content_predicate: schema:articleBody");

  if (options.graph_include_file_extension != null) {
    lines.push(
      `  include_file_extension: ${
        options.graph_include_file_extension ? "true" : "false"
      }`,
    );
  } else lines.push("  # include_file_extension: false");

  if (options.graph_implicit_types?.length) {
    lines.push("  implicit_types:");
    for (const type of options.graph_implicit_types) {
      lines.push(`    - ${yamlString(type)}`);
    }
  } else lines.push("  # implicit_types: [schema:TechArticle]");

  if (options.graph_implicit_types_policy) {
    lines.push(
      `  implicit_types_policy: ${
        yamlString(options.graph_implicit_types_policy)
      }`,
    );
  } else lines.push("  # implicit_types_policy: fallback");

  if (options.graph_base_iri) {
    lines.push(`  base_iri: ${yamlString(options.graph_base_iri)}`);
  } else {lines.push(
      "  # base_iri: https://example.org/docs/  # optional override; defaults to context.wiki",
    );}

  lines.push(
    "  # CURIE prefix map for frontmatter.",
    "  context:",
    '    "@vocab": https://schema.org/',
    "    schema: https://schema.org/",
    `    wiki: ${yamlString(options.graph_context_wiki)}`,
    "    wazoo: https://schema.wazoo.dev/",
    "    foaf: http://xmlns.com/foaf/0.1/",
    "    dc: http://purl.org/dc/elements/1.1/",
    "    dcterms: http://purl.org/dc/terms/",
    "    sh: http://www.w3.org/ns/shacl#",
    "    xsd: http://www.w3.org/2001/XMLSchema#",
    "",
    "# Page layout and URL routing.",
    "site:",
  );
  if (options.site_layout) {
    lines.push(`  layout: ${yamlString(options.site_layout)}`);
  } else {lines.push(
      "  # layout: custom.html  # layout unset → packaged minimal index layout (see Wiki Configuration → Page layout).",
    );}
  lines.push(
    "  # URL prefix for built and served pages.",
    `  base_url: ${baseUrl === "" ? '""' : yamlString(baseUrl)}`,
    "  # dir → slug/index.html; file → slug.html",
    `  url_style: ${yamlString(urlStyle)}`,
    "",
    "# wiki link command output format and rename repair map.",
    "link:",
    "  # standard page links or wikilinks (wiki link --apply).",
    `  style: ${yamlString(options.link_style ?? "standard")}`,
    "  # renames:",
    "  #   Old_Page_Name: New_Page_Name",
    "",
    "# Integrity severities (wiki check): SHACL, JSON Schema, routes, layout files.",
    "check:",
    "  # Error when wazoo:layout points at a missing .html file.",
    "  missing_layout_file: error",
    "  # Error when frontmatter fails JSON Schema validation.",
    "  frontmatter_schema: error",
    "  # Error when wazoo:jsonSchema cannot be loaded (local or remote).",
    "  missing_schema_ref: error",
    "",
    "# Convention severities (wiki lint): links, filenames, headings.",
    "lint:",
    "  # Wikilinks, markdown links, fragments, assets, wiki: CURIEs.",
    "  broken_links: warning",
    "  # Wiki filename_pattern regex (see wiki.filename_pattern).",
    "  filename_pattern: warning",
    "  # Wikilinks in body when link.style is standard.",
    "  link_style: warning",
    "",
    "# External data sources (git repos with wiki pages / RDF data to merge).",
    "# Run 'wiki install' to fetch and lock declared sources.",
    "# sources:",
    "#   - name: shared-taxonomy",
    "#     type: git",
    "#     url: https://github.com/example/taxonomy.wiki.git",
    "#     ref: v1.2.0",
    "",
    "# Optional SPARQL HTTP endpoint on wiki serve (opt-in).",
    "# sparql_service:",
    "#   enabled: false",
    "#   path: /api/sparql",
    "",
    "# Markdown formatting options (wiki fmt) use dprint plugin settings.",
    "fmt:",
    "  textWrap: never",
    "  lineWidth: 80",
    "  newLineKind: lf",
  );
  return `${lines.join("\n")}\n`;
}
