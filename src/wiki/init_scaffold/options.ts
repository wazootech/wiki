export interface InitOptions {
  readonly graph_context_wiki: string;
  readonly site_base_url?: string | null;
  readonly site_url_style?: string | null;
  readonly site_layout?: string | null;
  readonly graph_content_predicate?: string | null;
  readonly link_style?: string | null;
  readonly wiki_inputs?: readonly string[] | null;
  readonly graph_base_iri?: string | null;
  readonly graph_implicit_types?: readonly string[] | null;
  readonly graph_implicit_types_policy?: string | null;
  readonly graph_include_file_extension?: boolean | null;
  readonly template?: string | null;
}

export interface ResolveInitOptions {
  readonly repo?: string | null;
  readonly graph_context_wiki?: string | null;
  readonly site_base_url?: string | null;
  readonly site_url_style?: string | null;
  readonly site_layout?: string | null;
  readonly graph_content_predicate?: string | null;
  readonly link_style?: string | null;
  readonly cwd: string;
  readonly init_git?: boolean;
  readonly prompt_context_wiki?: (defaultValue: string) => string;
  readonly wiki_inputs?: readonly string[] | null;
  readonly graph_base_iri?: string | null;
  readonly graph_implicit_types?: readonly string[] | null;
  readonly graph_implicit_types_policy?: string | null;
  readonly graph_include_file_extension?: boolean | null;
}

export const INIT_OPTIONS_TO_CONFIG_PATH = {
  graph_context_wiki: ["graph", "context", "wiki"],
  site_base_url: ["site", "base_url"],
  site_url_style: ["site", "url_style"],
  site_layout: ["site", "layout"],
  graph_content_predicate: ["graph", "content_predicate"],
  link_style: ["link", "style"],
  wiki_inputs: ["wiki", "input"],
  graph_base_iri: ["graph", "base_iri"],
  graph_implicit_types: ["graph", "implicit_types"],
  graph_implicit_types_policy: ["graph", "implicit_types_policy"],
  graph_include_file_extension: ["graph", "include_file_extension"],
} as const;

export interface ScaffoldSettings {
  readonly init_git?: boolean;
  readonly git_runner?: (cwd: string) => { code: number; stderr: string };
}

export const DEFAULT_BASE_URL = "/wiki";
export const DEFAULT_URL_STYLE = "dir";
export const GITIGNORE_TEMPLATE =
  "# Source cache (fetched repos)\n.wiki/\n\n# Build output\n_site/\n";
export const README_TEMPLATE = [
  "# My Wiki",
  "",
  "A semantic markdown knowledge base powered by the Wiki CLI.",
  "",
  "## Wiki layout",
  "",
  "- `wiki.yml` (or `wiki.toml`) — Wiki configuration, namespace prefixes, and `fmt` defaults.",
  "- `wiki/` — Empty directory for markdown pages with semantic frontmatter.",
  "",
  "## Commands",
  "",
  "- **Check** (integrity: SHACL, JSON Schema, route safety, layout frontmatter):",
  "  ```bash",
  "  wiki check",
  "  ```",
  "- **Lint** (conventions: broken links, filename pattern, heading style):",
  "  ```bash",
  "  wiki lint",
  "  ```",
  "- **Preview** (starts a local dev server with auto-reload):",
  "  ```bash",
  "  wiki serve --watch",
  "  ```",
  "- **Build** (compiles to static HTML site):",
  "  ```bash",
  "  wiki build",
  "  ```",
  "",
].join("\n");
export const CONFIG_FILENAMES = [
  "wiki.yml",
  "wiki.yaml",
  "wiki.json",
  "wiki.toml",
] as const;
export const URL_STYLES = new Set(["dir", "file"]);
export const IMPLICIT_TYPES_POLICIES = new Set(["fallback", "append"]);
export const decoder = new TextDecoder();
export const encoder = new TextEncoder();
