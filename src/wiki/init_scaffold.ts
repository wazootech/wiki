import { Path, ValueError } from "./fspath.ts";
import type { ScaffoldResult } from "./schemas/reports.ts";
import { DEFAULT_WIKI_BASE, normalizeBaseIri } from "./schemas/wiki_config.ts";

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
  readonly cwd: string | Path;
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

const DEFAULT_BASE_URL = "/wiki";
const DEFAULT_URL_STYLE = "dir";
const GITIGNORE_TEMPLATE =
  "# Source cache (fetched repos)\n.wiki/\n\n# Build output\n_site/\n";
const README_TEMPLATE = [
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
const CONFIG_FILENAMES = [
  "wiki.yml",
  "wiki.yaml",
  "wiki.json",
  "wiki.toml",
] as const;
const LEGACY_LINK_STYLE_MAP: Readonly<Record<string, string>> = {
  markdown: "standard",
  obsidian: "wikilink",
};
const LINK_STYLES = new Set(["standard", "wikilink"]);
const URL_STYLES = new Set(["dir", "file"]);
const IMPLICIT_TYPES_POLICIES = new Set(["fallback", "append"]);
const decoder = new TextDecoder();
const encoder = new TextEncoder();

export function normalizeBaseUrl(value: string): string {
  let text = String(value).trim();
  if (!text.startsWith("/")) text = `/${text}`;
  if (text !== "/" && text.endsWith("/")) text = text.replace(/\/+$/, "");
  return text;
}

export function parseGithubRepo(value: string): [string, string] {
  const text = value.trim();
  const patterns = [
    /^(?:https?:\/\/)?(?:www\.)?github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/i,
    /^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/i,
    /^([^/]+)\/([^/]+?)(?:\.git)?\/?$/,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match) return [match[1]!, match[2]!];
  }
  throw new ValueError(
    `Invalid GitHub repo: ${
      JSON.stringify(value)
    } (expected owner/repo, https://github.com/owner/repo, or git@github.com:owner/repo.git)`,
  );
}

export function inferGithubPagesUrls(
  owner: string,
  repo: string,
): [string, string] {
  return [
    normalizeBaseIri(`https://${owner}.github.io/${repo}`),
    normalizeBaseUrl(`/${repo}`),
  ];
}

function runGit(
  args: string[],
  cwd: string,
): { code: number; stdout: string; stderr: string } {
  const output = new Deno.Command("git", {
    args,
    cwd,
    stdout: "piped",
    stderr: "piped",
  }).outputSync();
  return {
    code: output.code,
    stdout: decoder.decode(output.stdout),
    stderr: decoder.decode(output.stderr),
  };
}

export function detectOriginRepo(cwd: string | Path): string | null {
  const root = Path.of(cwd);
  if (!root.joinpath(".git").exists()) return null;
  let output: ReturnType<typeof runGit>;
  try {
    output = runGit(["remote", "get-url", "origin"], root.toString());
  } catch {
    return null;
  }
  const remote = output.stdout.trim();
  if (output.code !== 0 || remote === "") return null;
  try {
    return parseGithubRepo(remote).join("/");
  } catch {
    return null;
  }
}

function normalizeInitOptionStyles(options: InitOptions): InitOptions {
  const siteUrlStyle = (options.site_url_style || DEFAULT_URL_STYLE).trim()
    .toLowerCase();
  if (!URL_STYLES.has(siteUrlStyle)) {
    throw new ValueError(
      `Invalid site_url_style: ${JSON.stringify(options.site_url_style)}`,
    );
  }

  let linkStyle = options.link_style ?? null;
  if (linkStyle !== null) {
    linkStyle = linkStyle.trim().toLowerCase();
    const legacy = LEGACY_LINK_STYLE_MAP[linkStyle];
    if (legacy !== undefined) {
      console.warn(
        `link_style: '${linkStyle}' is deprecated, use '${legacy}' instead (edit config file link.style and re-run)`,
      );
      linkStyle = legacy;
    }
    if (!LINK_STYLES.has(linkStyle)) {
      throw new ValueError(
        `expected standard or wikilink, got ${
          JSON.stringify(options.link_style)
        }`,
      );
    }
  }

  let implicitTypesPolicy = options.graph_implicit_types_policy ?? null;
  if (implicitTypesPolicy !== null) {
    implicitTypesPolicy = implicitTypesPolicy.trim().toLowerCase();
    if (!IMPLICIT_TYPES_POLICIES.has(implicitTypesPolicy)) {
      throw new ValueError(
        `expected fallback or append, got ${
          JSON.stringify(options.graph_implicit_types_policy)
        }`,
      );
    }
  }

  return {
    ...options,
    site_url_style: siteUrlStyle,
    ...(linkStyle !== null ? { link_style: linkStyle } : {}),
    ...(implicitTypesPolicy !== null
      ? { graph_implicit_types_policy: implicitTypesPolicy }
      : {}),
  };
}

export function resolveInitOptions(options: ResolveInitOptions): InitOptions {
  const cwd = Path.of(options.cwd);
  let repo = options.repo ?? null;
  if (
    repo === null &&
    (options.init_git === true || cwd.joinpath(".git").exists())
  ) {
    repo = detectOriginRepo(cwd);
  }

  let inferredContextWiki: string | null = null;
  let inferredBaseUrl: string | null = null;
  if ((options.graph_context_wiki ?? null) === null && repo !== null) {
    const [owner, repoName] = parseGithubRepo(repo);
    [inferredContextWiki, inferredBaseUrl] = inferGithubPagesUrls(
      owner,
      repoName,
    );
  }

  const contextWiki = options.graph_context_wiki || inferredContextWiki ||
    options.prompt_context_wiki?.(DEFAULT_WIKI_BASE) || DEFAULT_WIKI_BASE;
  const siteBaseUrl = options.site_base_url || inferredBaseUrl ||
    DEFAULT_BASE_URL;
  const siteUrlStyle = (options.site_url_style || DEFAULT_URL_STYLE).trim()
    .toLowerCase();
  if (!URL_STYLES.has(siteUrlStyle)) {
    throw new ValueError(
      `Invalid site_url_style: ${JSON.stringify(options.site_url_style)}`,
    );
  }

  let linkStyle = options.link_style ?? null;
  if (linkStyle !== null) {
    linkStyle = linkStyle.trim().toLowerCase();
    const legacy = LEGACY_LINK_STYLE_MAP[linkStyle];
    if (legacy !== undefined) {
      console.warn(
        `link_style: '${linkStyle}' is deprecated, use '${legacy}' instead (edit config file link.style and re-run)`,
      );
      linkStyle = legacy;
    }
    if (!LINK_STYLES.has(linkStyle)) {
      throw new ValueError(
        `expected standard or wikilink, got ${
          JSON.stringify(options.link_style)
        }`,
      );
    }
  }

  let implicitTypesPolicy = options.graph_implicit_types_policy ?? null;
  if (implicitTypesPolicy !== null) {
    implicitTypesPolicy = implicitTypesPolicy.trim().toLowerCase();
    if (!IMPLICIT_TYPES_POLICIES.has(implicitTypesPolicy)) {
      throw new ValueError(
        `expected fallback or append, got ${
          JSON.stringify(options.graph_implicit_types_policy)
        }`,
      );
    }
  }

  return {
    graph_context_wiki: normalizeBaseIri(contextWiki),
    site_base_url: normalizeBaseUrl(siteBaseUrl),
    site_url_style: siteUrlStyle,
    ...(options.site_layout != null
      ? { site_layout: options.site_layout }
      : {}),
    ...(options.graph_content_predicate != null
      ? { graph_content_predicate: options.graph_content_predicate }
      : {}),
    ...(linkStyle !== null ? { link_style: linkStyle } : {}),
    ...(options.wiki_inputs != null
      ? { wiki_inputs: [...options.wiki_inputs] }
      : {}),
    ...(options.graph_base_iri != null
      ? { graph_base_iri: options.graph_base_iri }
      : {}),
    ...(options.graph_implicit_types != null
      ? { graph_implicit_types: [...options.graph_implicit_types] }
      : {}),
    ...(implicitTypesPolicy !== null
      ? { graph_implicit_types_policy: implicitTypesPolicy }
      : {}),
    ...(options.graph_include_file_extension != null
      ? { graph_include_file_extension: options.graph_include_file_extension }
      : {}),
  };
}

function setPath(
  target: Record<string, unknown>,
  path: readonly string[],
  value: unknown,
): void {
  let current = target;
  for (const part of path.slice(0, -1)) {
    const child = current[part];
    if (
      child === undefined || child === null || Array.isArray(child) ||
      typeof child !== "object"
    ) {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }
  current[path[path.length - 1]!] = value;
}

export function mapInitOptionsToConfig(
  options: InitOptions,
): Record<string, unknown> {
  const config: Record<string, unknown> = {};
  for (const [field, path] of Object.entries(INIT_OPTIONS_TO_CONFIG_PATH)) {
    const value = options[field as keyof typeof INIT_OPTIONS_TO_CONFIG_PATH];
    if (value === undefined || value === null) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    setPath(config, path, Array.isArray(value) ? [...value] : value);
  }
  return config;
}

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
    "  assets:",
    "    - assets",
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
    "# Markdown formatting options (wiki fmt); inline mapping or TOML path.",
    "fmt:",
    "  # Line wrap width (no disables wrapping).",
    '  wrap: "no"',
    "  # Line ending style (lf or crlf).",
    "  end_of_line: lf",
    "  # mdformat extensions enabled for wiki markdown.",
    "  extensions: [gfm, front_matters, wikilink, toc, footnote]",
    "",
    "# Pointer mode (optional TOML file relative to this file):",
    "# fmt: .mdformat.toml",
  );
  return `${lines.join("\n")}\n`;
}

function conflict(root: Path): string | null {
  if (CONFIG_FILENAMES.some((name) => root.joinpath(name).exists())) {
    return "wiki.yml/wiki.yaml/wiki.json/wiki.toml already exists. Use a new directory or remove the config file.";
  }
  if (root.joinpath("README.md").exists()) {
    return "README.md already exists. Use a new directory or remove README.md.";
  }
  const wikiDir = root.joinpath("wiki");
  if (!wikiDir.exists()) return null;
  if (!wikiDir.isDir()) {
    return "wiki/ exists and is not a directory. Use a new directory or remove wiki/.";
  }
  if (Deno.readDirSync(wikiDir.toString()).next().done === false) {
    return "wiki/ is not empty. Use a new directory or clear wiki/ before init.";
  }
  return null;
}

function ensureDirectory(path: Path, created: Path[]): void {
  const missing: Path[] = [];
  let current = path;
  while (!current.exists()) {
    missing.push(current);
    const parent = current.parent;
    if (parent.toString() === current.toString()) {
      throw new Error(`Cannot find an existing parent for ${path}`);
    }
    current = parent;
  }
  if (!current.isDir()) {
    throw new Error(`${current} exists and is not a directory`);
  }
  for (const directory of missing.reverse()) {
    try {
      Deno.mkdirSync(directory.toString());
      created.push(directory);
    } catch (error) {
      if (!directory.isDir()) throw error;
    }
  }
}

function writeNewFile(path: Path, text: string, created: Path[]): void {
  const file = Deno.openSync(path.toString(), { write: true, createNew: true });
  created.push(path);
  try {
    const bytes = encoder.encode(text);
    let offset = 0;
    while (offset < bytes.length) {
      const written = file.writeSync(bytes.subarray(offset));
      if (written === 0) throw new Error(`Could not finish writing ${path}`);
      offset += written;
    }
  } finally {
    file.close();
  }
}

function removeIfPresent(path: Path, recursive = false): string | null {
  try {
    Deno.removeSync(path.toString(), { recursive });
    return null;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return null;
    return `${path}: ${error instanceof Error ? error.message : String(error)}`;
  }
}

function rollback(paths: readonly Path[]): string[] {
  const errors: string[] = [];
  for (const path of [...paths].reverse()) {
    const error = removeIfPresent(path);
    if (error !== null) errors.push(error);
  }
  return errors;
}

function defaultGitRunner(cwd: string): { code: number; stderr: string } {
  const result = runGit(["init"], cwd);
  return { code: result.code, stderr: result.stderr };
}

export function scaffoldWiki(
  targetDirectory: string | Path,
  initOptions: InitOptions,
  settings: ScaffoldSettings = {},
): ScaffoldResult {
  const root = Path.of(targetDirectory).resolve();
  const created: Path[] = [];
  let gitDirectory: Path | null = null;
  let gitExisted = false;
  const failure = (errorMessage: string): ScaffoldResult => {
    const rollbackErrors: string[] = [];
    if (gitDirectory !== null && !gitExisted && gitDirectory.exists()) {
      const gitRollbackError = removeIfPresent(gitDirectory, true);
      if (gitRollbackError !== null) rollbackErrors.push(gitRollbackError);
    }
    rollbackErrors.push(...rollback(created));
    if (rollbackErrors.length > 0) {
      errorMessage += `; rollback incomplete: ${rollbackErrors.join("; ")}`;
    }
    return {
      ok: false,
      written_paths: [],
      message: "",
      error_message: errorMessage,
    };
  };

  try {
    if (root.exists() && !root.isDir()) {
      return {
        ok: false,
        written_paths: [],
        message: "",
        error_message: `${root} exists and is not a directory.`,
      };
    }
    const initialConflict = root.exists() ? conflict(root) : null;
    if (initialConflict !== null) {
      return {
        ok: false,
        written_paths: [],
        message: "",
        error_message: initialConflict,
      };
    }

    ensureDirectory(root, created);
    const afterCreateConflict = conflict(root);
    if (afterCreateConflict !== null) return failure(afterCreateConflict);

    const writtenPaths: Path[] = [];
    const gitignorePath = root.joinpath(".gitignore");
    if (!gitignorePath.exists()) {
      writeNewFile(gitignorePath, GITIGNORE_TEMPLATE, created);
      writtenPaths.push(gitignorePath);
    }

    const readmePath = root.joinpath("README.md");
    writeNewFile(readmePath, README_TEMPLATE, created);
    writtenPaths.push(readmePath);

    const wikiDirectory = root.joinpath("wiki");
    if (!wikiDirectory.exists()) {
      Deno.mkdirSync(wikiDirectory.toString());
      created.push(wikiDirectory);
    }
    writtenPaths.push(wikiDirectory);

    const configPath = root.joinpath("wiki.yml");
    writeNewFile(configPath, renderWikiYaml(initOptions), created);
    writtenPaths.push(configPath);

    if (settings.init_git === true) {
      gitDirectory = root.joinpath(".git");
      gitExisted = gitDirectory.exists();
      let result: { code: number; stderr: string };
      try {
        result = (settings.git_runner ?? defaultGitRunner)(root.toString());
      } catch (error) {
        if (error instanceof Deno.errors.NotFound) {
          return failure(
            "git was requested with --git, but no git executable was found on PATH.",
          );
        }
        return failure(
          `git init failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
      if (result.code !== 0) {
        const stderr = result.stderr.trim() || "unknown git init error";
        return failure(`git init failed: ${stderr}`);
      }
    }

    let message =
      "Initialized wiki config, README.md, and an empty wiki/ directory.";
    if (settings.init_git === true) message += " Ran git init.";
    return {
      ok: true,
      config_path: configPath,
      written_paths: writtenPaths,
      message,
    };
  } catch (error) {
    return failure(
      `Failed to scaffold wiki: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

export interface TemplateCloneResult {
  readonly code: number;
  readonly stderr: string;
}

export interface TemplateDependencies {
  readonly cloneRepository?: (destination: Path) => TemplateCloneResult;
}

interface TemplateEntry {
  readonly source: Path;
  readonly path: readonly string[];
  readonly directory: boolean;
}

const WIKI_TEMPLATES_REPO = "https://github.com/wazootech/wiki-templates.git";
const TEMPLATE_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function cloneTemplateRepository(destination: Path): TemplateCloneResult {
  try {
    const result = new Deno.Command("git", {
      args: [
        "clone",
        "--depth",
        "1",
        "--branch",
        "main",
        WIKI_TEMPLATES_REPO,
        destination.toString(),
      ],
      stdout: "null",
      stderr: "piped",
    }).outputSync();
    return { code: result.code, stderr: decoder.decode(result.stderr) };
  } catch (error) {
    return {
      code: 1,
      stderr: error instanceof Error ? error.message : String(error),
    };
  }
}

function templateEntries(
  directory: Path,
  parent: readonly string[] = [],
  topLevel = true,
  result: TemplateEntry[] = [],
): TemplateEntry[] {
  for (const entry of Deno.readDirSync(directory.toString())) {
    if (topLevel && entry.name.startsWith(".") && entry.name !== ".gitignore") {
      continue;
    }
    const source = directory.joinpath(entry.name);
    if (entry.isSymlink) {
      throw new Error(
        `Template entry '${
          [...parent, entry.name].join("/")
        }' is a symlink and cannot be copied safely.`,
      );
    }
    const path = [...parent, entry.name];
    if (entry.isDirectory) {
      result.push({ source, path, directory: true });
      templateEntries(source, path, false, result);
    } else if (entry.isFile) {
      result.push({ source, path, directory: false });
    }
  }
  return result;
}

function copyTemplateFile(
  source: Path,
  destination: Path,
  created: Path[],
): void {
  const bytes = Deno.readFileSync(source.toString());
  const file = Deno.openSync(destination.toString(), {
    write: true,
    createNew: true,
  });
  created.push(destination);
  try {
    let offset = 0;
    while (offset < bytes.length) {
      const written = file.writeSync(bytes.subarray(offset));
      if (written === 0) {
        throw new Error(`Could not finish writing ${destination}`);
      }
      offset += written;
    }
  } finally {
    file.close();
  }
  const mode = Deno.statSync(source.toString()).mode;
  if (mode !== null) Deno.chmodSync(destination.toString(), mode & 0o777);
}

function removeTemplateDirectory(path: Path): void {
  try {
    Deno.removeSync(path.toString(), { recursive: true });
  } catch (firstError) {
    const makeWritable = (entry: Path): void => {
      if (entry.isSymlink()) return;
      if (entry.isDir()) {
        for (const child of Deno.readDirSync(entry.toString())) {
          makeWritable(entry.joinpath(child.name));
        }
      }
      const mode = Deno.statSync(entry.toString()).mode;
      if (mode !== null) Deno.chmodSync(entry.toString(), mode | 0o200);
    };
    try {
      makeWritable(path);
      Deno.removeSync(path.toString(), { recursive: true });
    } catch {
      throw firstError;
    }
  }
}

function templateFailure(
  errorMessage: string,
  created: readonly Path[] = [],
): ScaffoldResult {
  const rollbackErrors = rollback(created);
  if (rollbackErrors.length > 0) {
    errorMessage += `; rollback incomplete: ${rollbackErrors.join("; ")}`;
  }
  return {
    ok: false,
    written_paths: [],
    message: "",
    error_message: errorMessage,
  };
}

export function fetchTemplate(
  targetDirectory: string | Path,
  templateName: string,
  dependencies: TemplateDependencies = {},
): ScaffoldResult {
  if (!TEMPLATE_NAME_PATTERN.test(templateName)) {
    return templateFailure(`Invalid template name '${templateName}'.`);
  }

  const root = Path.of(targetDirectory).resolve();
  if (root.exists() && !root.isDir()) {
    return templateFailure(`${root} exists and is not a directory.`);
  }
  const existingConflict = conflict(root);
  if (existingConflict !== null) return templateFailure(existingConflict);

  const tempRoot = Path.of(Deno.makeTempDirSync({ prefix: "wiki-template-" }));
  const cloneDir = tempRoot.joinpath("wiki-templates");
  const created: Path[] = [];
  try {
    const clone = (dependencies.cloneRepository ?? cloneTemplateRepository)(
      cloneDir,
    );
    if (clone.code !== 0) {
      const details = clone.stderr.trim();
      return templateFailure(
        details
          ? `Failed to clone ${WIKI_TEMPLATES_REPO}: ${details}`
          : `Failed to clone ${WIKI_TEMPLATES_REPO}.`,
      );
    }
    const templateDir = cloneDir.joinpath(templateName);
    if (!templateDir.isDir() || templateDir.isSymlink()) {
      const available = [...Deno.readDirSync(cloneDir.toString())]
        .filter((entry) => entry.isDirectory && !entry.name.startsWith("."))
        .map((entry) => entry.name)
        .sort();
      return templateFailure(
        `Template '${templateName}' not found in wiki-templates. Available: ${
          available.join(", ")
        }`,
      );
    }

    const entries = templateEntries(templateDir);
    if (entries.length === 0) {
      return templateFailure(`Template '${templateName}' is empty.`);
    }
    for (const entry of entries) {
      const destination = root.joinpath(...entry.path);
      if (destination.exists()) {
        return templateFailure(
          `Template path '${destination}' already exists. Use a new directory or remove the conflicting path.`,
        );
      }
    }

    ensureDirectory(root, created);
    const written: Path[] = [];
    for (const entry of entries) {
      const destination = root.joinpath(...entry.path);
      if (entry.directory) {
        Deno.mkdirSync(destination.toString());
        created.push(destination);
      } else {
        copyTemplateFile(entry.source, destination, created);
        written.push(destination);
      }
    }
    return {
      ok: true,
      written_paths: written,
      message:
        `Initialized wiki from template '${templateName}' (wazootech/wiki-templates).`,
    };
  } catch (error) {
    return templateFailure(
      `Failed to initialize from template '${templateName}': ${
        error instanceof Error ? error.message : String(error)
      }`,
      created,
    );
  } finally {
    try {
      removeTemplateDirectory(tempRoot);
    } catch (error) {
      console.error(
        `Warning: could not remove template checkout ${tempRoot}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
