/**
 * The unified wiki config: nested blocks, path resolution, and error routing.
 *
 * Port of `src/wiki/schemas/wiki_config.py` plus the `Config` behaviours
 * `config.py` re-exports. This is the module that turns a `wiki.yml` on disk
 * into the resolved object every other module reads, so its two jobs are worth
 * keeping apart:
 *
 * - **Resolution.** Relative paths in the file become absolute against the
 *   config file's own directory, `assets` gains its implicit default when the
 *   directory exists, and `site.base_url` / `sparql_service.path` are
 *   normalised. Everything downstream assumes this already happened.
 * - **Diagnosis.** `formatConfigValidationError` rewrites a schema failure into
 *   the sentence a user sees. It routes on the *shape* of the validation error,
 *   so the port emits pydantic-shaped errors (see `validation.ts`) rather than
 *   hand-writing each sentence at the point of failure.
 *
 * Two fidelity notes:
 *
 * - **A YAML syntax error keeps its Python prefix but not its body.** The
 *   original wraps `yaml.YAMLError` into `Failed to load config file <name>:
 *   <error>`; the port does the same with `@std/yaml`'s message, which comes
 *   from a different parser. The prefix, which is what callers and users match
 *   on, is identical.
 * - **`sources` reports nested failures at their own location.** Python
 *   validates each source by constructing `SourceConfig(**item)` inside a field
 *   coercer, so pydantic wraps a structural failure there into one
 *   `value_error` whose message is the inner error's rendering. The port lets
 *   the nested issue surface at `sources.<i>.<field>` instead. Both reach the
 *   same fallback text; only the intermediate rendering differs.
 */

import { parse as parseToml } from "@std/toml";
import { parse as parseYaml } from "@std/yaml";
import { Context } from "../context.ts";
import { fnmatchCase } from "../fnmatch.ts";
import { Path, ValueError } from "../fspath.ts";
import {
  InvalidConfError,
  validateKeys,
  validateValues,
} from "../mdformat_conf.ts";
import { readTextTolerant } from "../parser.ts";
import { pyRepr, pyStr, pyTypeName } from "../pyrepr.ts";
import {
  type FieldSpec,
  isMapping,
  type ModelSpec,
  validateModel,
} from "./model.ts";
import {
  type CheckConfig,
  checkConfigSpec,
  type LintConfig,
  lintConfigSpec,
} from "./rules.ts";
import { type SourceConfig, sourceConfigSpec } from "./sources.ts";
import {
  SchemaValidationError,
  type ValidationIssue,
  valueError,
} from "./validation.ts";

const LINK_STYLES: ReadonlySet<string> = new Set(["standard", "wikilink"]);
const LEGACY_LINK_STYLE_MAP: Readonly<Record<string, string>> = {
  markdown: "standard",
  obsidian: "wikilink",
};

/** Default `link.style`. */
export const DEFAULT_LINK_STYLE = "standard";

/** Default `site.base_url`. */
export const DEFAULT_BASE_URL = "/wiki";

/** Default `site.url_style`. */
export const DEFAULT_URL_STYLE = "dir";

/** Base IRI used when neither `graph.base_iri` nor `graph.context.wiki` is set. */
export const DEFAULT_WIKI_BASE = "https://wiki.example.org/";

/** The URL styles a site can use. */
export const VALID_URL_STYLES: ReadonlySet<string> = new Set(["dir", "file"]);

const IMPLICIT_TYPES_POLICIES: ReadonlySet<string> = new Set([
  "fallback",
  "append",
]);

/** Default `graph.implicit_types_policy`. */
export const IMPLICIT_TYPES_POLICY = "fallback";

/** Config file names searched, in order, when a directory is given. */
export const CONFIG_FILENAMES: readonly string[] = [
  "wiki.yml",
  "wiki.yaml",
  "wiki.json",
  "wiki.toml",
];

/** How each `_BLOCK_LABELS` key is named in a user-facing message. */
const _BLOCK_LABELS: Readonly<Record<string, string>> = {
  wiki: "wiki",
  graph: "graph",
  site: "site",
  link: "link",
  check: "check",
  lint: "lint",
  sources: "sources",
  sparql_service: "sparql_service",
};

/** Ensure a document base IRI ends with a trailing slash. */
export function normalizeBaseIri(value: unknown): string {
  return `${String(value).replace(/\/+$/, "")}/`;
}

/** Coerce a string-or-list value, as `_coerce_str_or_list` does. */
function coerceStrOrList(value: unknown): string[] {
  if (value === null || value === undefined) return ["wiki"];
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.map((item) => String(item));
  throw new ValueError(
    `expected string or list of strings, got ${pyTypeName(value)}`,
  );
}

/** Coerce `graph.implicit_types`, where an absent value means no implicit types. */
function coerceImplicitTypes(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.map((item) => String(item));
  throw new ValueError(
    `expected string or list of strings, got ${pyTypeName(value)}`,
  );
}

/** Coerce a path-or-list value, as `_coerce_path_list` does. */
function coercePathList(value: unknown): Path[] {
  if (value === null || value === undefined) return [new Path("wiki")];
  if (typeof value === "string" || value instanceof Path) {
    return [Path.of(value)];
  }
  if (Array.isArray(value)) {
    return value.map((item) =>
      Path.of(item instanceof Path ? item : String(item))
    );
  }
  throw new ValueError(
    `expected string, path, or list, got ${pyTypeName(value)}`,
  );
}

/** `true` when a value looks like a regex rather than a severity. */
function looksLikeRegex(value: string): boolean {
  return [..."[]()\\"].some((char) => value.includes(char));
}

/** Build the error a bad severity slot produces, including the moved-key hint. */
function severityError(
  blockName: string,
  field: string,
  bad: unknown,
): ValueError {
  if (
    blockName === "check" && field === "filename_pattern" &&
    looksLikeRegex(pyStr(bad))
  ) {
    return new ValueError(
      "check.filename_pattern must be error, warning, or off; " +
        "put the regex in wiki.filename_pattern",
    );
  }
  return new ValueError(
    `Invalid ${blockName}.${field} severity: ${
      pyRepr(bad)
    } (expected error, warning, or off)`,
  );
}

/**
 * Rewrite a config schema failure into the message the user sees.
 *
 * The routing order is the original's, and it is load-bearing: unknown keys are
 * reported before anything else (a typo is a better explanation than a
 * downstream symptom), the first matching field error wins, and only a failure
 * that matches nothing falls through to the full pydantic rendering.
 */
export function formatConfigValidationError(
  configName: string,
  error: SchemaValidationError,
): ValueError {
  const issues = error.issues;
  const extras = new Map<string, string[]>();
  const topLevelExtras: string[] = [];

  for (const issue of issues) {
    if (issue.type !== "extra_forbidden") continue;
    const loc = issue.loc;
    if (loc.length === 1) {
      topLevelExtras.push(String(loc[0]));
    } else if (
      loc.length === 2 && Object.hasOwn(_BLOCK_LABELS, String(loc[0]))
    ) {
      const block = String(loc[0]);
      const keys = extras.get(block) ?? [];
      keys.push(String(loc[1]));
      extras.set(block, keys);
    }
  }

  if (topLevelExtras.length > 0) {
    const keys = [...topLevelExtras].sort().join(", ");
    return new ValueError(
      `Invalid config file ${configName}: unknown top-level keys: ${keys}`,
    );
  }

  // `sorted(extras.items())` and a `return` inside the loop: only the first
  // block, alphabetically, is ever reported.
  for (const block of [...extras.keys()].sort()) {
    const label = _BLOCK_LABELS[block]!;
    const keys = [...(extras.get(block) ?? [])].sort().join(", ");
    return new ValueError(
      `Invalid config file ${configName}: unknown ${label} keys: ${keys}`,
    );
  }

  for (const issue of issues) {
    const loc = issue.loc;
    const msg = issue.msg ?? "";
    if (issue.type === "extra_forbidden") continue;
    if (
      loc.length === 1 && loc[0] === "fmt" &&
      msg.includes("fmt must be a mapping or path string")
    ) {
      return new ValueError(
        `Invalid config file ${configName}: fmt must be a mapping or path string`,
      );
    }
    if (loc.length >= 2 && Object.hasOwn(_BLOCK_LABELS, String(loc[0]))) {
      const block = String(loc[0]);
      const field = String(loc[1]);
      if (msg.includes("expected error, warning, or off")) {
        return new ValueError(
          `Invalid config file ${configName}: ${
            severityError(block, field, issue.input).message
          }`,
        );
      }
      if (block === "link" && field === "style") {
        return new ValueError(
          `Invalid config file ${configName}: Invalid link_style: ${
            pyRepr(issue.input)
          } ` +
            `(expected standard or wikilink)`,
        );
      }
    }
    if (loc.length >= 2 && loc[0] === "lint") {
      const field = String(loc[1]);
      if (msg.includes("expected error, warning, or off")) {
        return new ValueError(
          `Invalid config file ${configName}: ${
            severityError("lint", field, issue.input).message
          }`,
        );
      }
    }
    if (loc.length >= 2 && loc[0] === "check") {
      const field = String(loc[1]);
      if (msg.includes("expected error, warning, or off")) {
        return new ValueError(
          `Invalid config file ${configName}: ${
            severityError("check", field, issue.input).message
          }`,
        );
      }
    }
  }

  if (issues.length === 1) {
    const issue = issues[0]!;
    const loc = issue.loc;
    if (loc.length === 1 && Object.hasOwn(_BLOCK_LABELS, String(loc[0]))) {
      const block = String(loc[0]);
      if (issue.type === "model_type") {
        return new ValueError(
          `Invalid config file ${configName}: ${block} must be a mapping`,
        );
      }
    }
  }

  return new ValueError(`Invalid config file ${configName}: ${error.message}`);
}

/** Resolved `fmt:` configuration: inline options, or a path to a TOML file. */
export interface FmtConfig {
  readonly options: Record<string, unknown> | null;
  readonly toml: Path | null;
}

/** `true` when the value is already a resolved {@link FmtConfig}. */
function isFmtConfig(value: unknown): value is FmtConfig {
  return isMapping(value) &&
    (Object.hasOwn(value, "options") || Object.hasOwn(value, "toml"));
}

/**
 * Validate and resolve a `fmt:` value.
 *
 * An inline mapping is checked against mdformat's option surface, because the
 * user is configuring *formatting behaviour* even though `deno fmt` performs
 * it; a string or path is treated as a pointer to a TOML file, and must be
 * relative to the config file so a cloned repo formats the same everywhere.
 */
export function parseFmtConfig(
  fmtData: unknown,
  configName: string,
  baseDir: Path,
): FmtConfig | null {
  if (fmtData === null || fmtData === undefined) return null;
  if (isFmtConfig(fmtData)) return fmtData;

  if (isMapping(fmtData)) {
    const options: Record<string, unknown> = { ...fmtData };
    // mdformat spells "never wrap" as `wrap = "no"`; `false` is the YAML way of
    // writing the same intent, so it is translated rather than rejected.
    if (options["wrap"] === false) options["wrap"] = "no";
    const confLabel = `${configName} fmt`;
    try {
      validateKeys(options, confLabel);
      validateValues(options, confLabel);
    } catch (error) {
      if (error instanceof InvalidConfError) {
        throw new ValueError(
          `Invalid config file ${configName}: ${error.message}`,
        );
      }
      throw error;
    }
    return { options, toml: null };
  }

  if (typeof fmtData === "string") {
    const text = fmtData.trim();
    if (text === "") {
      throw new ValueError(
        `Invalid config file ${configName}: fmt path must not be empty`,
      );
    }
    const pathObj = new Path(text);
    if (pathObj.isAbsolute()) {
      throw new ValueError(
        `Invalid config file ${configName}: fmt path must be relative to the config file`,
      );
    }
    return { options: null, toml: baseDir.joinpath(pathObj) };
  }

  if (fmtData instanceof Path) {
    if (fmtData.isAbsolute()) {
      try {
        fmtData.relativeTo(baseDir);
      } catch {
        throw new ValueError(
          `Invalid config file ${configName}: fmt path must be relative to the config file`,
        );
      }
      return { options: null, toml: fmtData };
    }
    return { options: null, toml: baseDir.joinpath(fmtData) };
  }

  throw new ValueError(
    `Invalid config file ${configName}: fmt must be a mapping or path string`,
  );
}

/** Resolve a possibly-relative path against the config file's directory. */
function resolvePath(value: string | Path, baseDir: Path): Path {
  const pathObj = Path.of(value);
  return pathObj.isAbsolute() ? pathObj : baseDir.joinpath(pathObj);
}

/** Resolve `site.layout`, returning an absolute path or `null`. */
function parsePageLayoutPath(
  layoutRaw: unknown,
  baseDir: Path,
): Path | null {
  if (layoutRaw === null || layoutRaw === undefined) return null;
  if (layoutRaw instanceof Path) {
    return layoutRaw.isAbsolute()
      ? layoutRaw.resolve()
      : baseDir.joinpath(layoutRaw).resolve();
  }
  if (pyStr(layoutRaw).trim() === "") return null;
  const pathObj = new Path(pyStr(layoutRaw).trim());
  return (pathObj.isAbsolute() ? pathObj : baseDir.joinpath(pathObj)).resolve();
}

/** Normalize `site.url_style`. */
export function normalizeUrlStyle(value: unknown): string {
  const normalized = value === null || value === undefined || value === ""
    ? DEFAULT_URL_STYLE
    : String(value).trim().toLowerCase();
  if (!VALID_URL_STYLES.has(normalized)) {
    throw new ValueError(`Invalid url_style: ${value}`);
  }
  return normalized;
}

/** Normalize `sparql_service.path`. */
export function normalizeApiPath(value: unknown): string {
  const raw =
    (value === null || value === undefined || value === ""
      ? "/api/sparql"
      : String(value))
      .trim();
  if (!raw.startsWith("/")) {
    throw new ValueError(`Invalid sparql_service.path: ${value}`);
  }
  const normalized = raw.replace(/\/+$/, "");
  return normalized === "" ? "/" : normalized;
}

/** Return a wiki config file path when `path` is a file or searchable directory. */
export function findConfigPath(path: Path): Path | null {
  if (path.isFile()) return path;
  for (const name of CONFIG_FILENAMES) {
    const candidate = path.joinpath(name);
    if (candidate.exists()) return candidate;
  }
  return null;
}

/** The `wiki:` block after resolution. */
export interface WikiBlock {
  readonly input: readonly Path[];
  readonly assets: readonly Path[];
  readonly exclude: readonly string[];
  readonly filename_pattern: string | null;
}

/** The `graph:` block after resolution. */
export interface GraphBlock {
  readonly base_iri: string | null;
  readonly content_predicate: string | null;
  readonly include_file_extension: boolean;
  readonly implicit_types: readonly string[];
  readonly implicit_types_policy: string;
  readonly context: Readonly<Record<string, string | null>> | null;
}

/** The `site:` block after resolution. */
export interface SiteBlock {
  readonly layout: Path | null;
  readonly base_url: string;
  readonly url_style: string;
}

/** The `link:` block after resolution. */
export interface LinkBlock {
  readonly style: string;
  readonly renames: Readonly<Record<string, string>> | null;
}

/** The `sparql_service:` block after resolution. */
export interface SparqlServiceBlock {
  readonly enabled: boolean;
  readonly path: string;
}

/** Coerce `graph.implicit_types_policy`. */
function coerceImplicitTypesPolicy(value: unknown): string {
  if (value === null || value === undefined) return IMPLICIT_TYPES_POLICY;
  const normalized = pyStr(value).trim().toLowerCase();
  if (!IMPLICIT_TYPES_POLICIES.has(normalized)) {
    throw new ValueError(`expected fallback or append, got ${pyRepr(value)}`);
  }
  return normalized;
}

/** Coerce `sparql_service.enabled`, accepting the string spellings YAML allows. */
function coerceEnabled(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isInteger(value)) {
    if (value === 0 || value === 1) return value === 1;
    throw new ValueError(
      `expected boolean enabled value, got ${pyRepr(value)}`,
    );
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["false", "0", "no", "off"].includes(normalized)) return false;
    if (["true", "1", "yes", "on"].includes(normalized)) return true;
    throw new ValueError(
      `expected boolean enabled value, got ${pyRepr(value)}`,
    );
  }
  throw new ValueError(`expected boolean enabled value, got ${pyRepr(value)}`);
}

/** Coerce `link.style`, translating the legacy spellings with a warning. */
function coerceLinkStyle(value: unknown): string {
  if (value === null || value === undefined) return DEFAULT_LINK_STYLE;
  if (typeof value !== "string") {
    throw new ValueError(`expected standard or wikilink, got ${pyRepr(value)}`);
  }
  const normalized = value.trim().toLowerCase();
  const legacy = LEGACY_LINK_STYLE_MAP[normalized];
  if (legacy !== undefined) {
    console.error(
      `link.style: '${normalized}' is deprecated, use '${legacy}' instead ` +
        `(edit config file link.style and re-run)`,
    );
    return legacy;
  }
  if (!LINK_STYLES.has(normalized)) {
    throw new ValueError(`expected standard or wikilink, got ${pyRepr(value)}`);
  }
  return normalized;
}

/** Coerce `graph.context`, rejecting non-string IRIs the way pydantic does. */
function coerceGraphContext(
  value: unknown,
): Record<string, string | null> | null {
  if (value === null || value === undefined) return null;
  if (!isMapping(value)) {
    throw new ValueError(
      `expected a mapping for the graph context, got ${pyTypeName(value)}`,
    );
  }
  const context: Record<string, string | null> = {};
  for (const [prefix, uri] of Object.entries(value)) {
    if (uri === null || uri === undefined) context[prefix] = null;
    else if (typeof uri === "string") context[prefix] = uri;
    else {
      throw new ValueError(
        `expected the graph context value for '${prefix}' to be a string, got ${
          pyTypeName(uri)
        }`,
      );
    }
  }
  return context;
}

const wikiBlockSpec: ModelSpec = {
  label: "WikiConfig",
  forbidExtra: true,
  fields: [
    ["input", { factory: () => [new Path("wiki")], before: coercePathList }],
    ["assets", {
      defaultValue: null,
      before: (value) =>
        value === null || value === undefined ? null : coercePathList(value),
    }],
    ["exclude", {
      factory: () => [],
      before: (value) =>
        value === null || value === undefined ? [] : coerceStrOrList(value),
    }],
    ["filename_pattern", { defaultValue: null }],
  ],
};

const graphBlockSpec: ModelSpec = {
  label: "GraphConfig",
  forbidExtra: true,
  fields: [
    ["base_iri", {
      defaultValue: null,
      before: (value) =>
        value === null || value === undefined ? null : normalizeBaseIri(value),
    }],
    ["content_predicate", { defaultValue: null }],
    ["include_file_extension", { defaultValue: false }],
    ["implicit_types", { factory: () => [], before: coerceImplicitTypes }],
    ["implicit_types_policy", {
      defaultValue: IMPLICIT_TYPES_POLICY,
      before: coerceImplicitTypesPolicy,
    }],
    ["context", {
      defaultValue: null,
      aliases: ["@context"],
      before: coerceGraphContext,
    }],
  ],
};

const siteBlockSpec: ModelSpec = {
  label: "SiteConfig",
  forbidExtra: true,
  fields: [
    ["layout", { defaultValue: null }],
    ["base_url", { defaultValue: null }],
    ["url_style", { defaultValue: null }],
  ],
};

const linkBlockSpec: ModelSpec = {
  label: "LinkConfig",
  forbidExtra: true,
  fields: [
    ["style", { defaultValue: DEFAULT_LINK_STYLE, before: coerceLinkStyle }],
    ["renames", { defaultValue: null }],
  ],
};

const sparqlServiceSpec: ModelSpec = {
  label: "SparqlServiceConfig",
  forbidExtra: true,
  fields: [
    ["enabled", { defaultValue: false, before: coerceEnabled }],
    ["path", { defaultValue: "/api/sparql" }],
  ],
};

const fmtField: FieldSpec = {
  defaultValue: null,
  before: (value) => {
    if (value === null || value === undefined) return null;
    if (
      isMapping(value) || typeof value === "string" || value instanceof Path
    ) return value;
    throw new ValueError("fmt must be a mapping or path string");
  },
};

const configSpec: ModelSpec = {
  label: "Config",
  forbidExtra: true,
  fields: [
    ["wiki", { model: () => wikiBlockSpec }],
    ["graph", { model: () => graphBlockSpec }],
    ["site", { model: () => siteBlockSpec }],
    ["link", { model: () => linkBlockSpec }],
    ["check", { model: () => checkConfigSpec }],
    ["lint", { model: () => lintConfigSpec }],
    ["sources", {
      factory: () => [],
      before: (value) => validateSources(value),
      models: () => sourceConfigSpec,
    }],
    ["fmt", fmtField],
    ["sparql_service", { model: () => sparqlServiceSpec }],
    ["config_root", {
      factory: () => new Path(Deno.cwd()),
      before: (value) => value instanceof Path ? value : new Path(pyStr(value)),
    }],
  ],
};

/**
 * The three checks `Config._validate_sources` runs before nesting.
 *
 * Structural failures inside a source are reported by the nested model; these
 * are the ones that must be caught on the list itself, including the duplicate
 * name check, which is the only reason `sources` cannot be coerced item-by-item.
 */
function validateSources(value: unknown): unknown {
  if (value === null || value === undefined) return [];
  if (!Array.isArray(value)) throw new ValueError("sources must be a list");
  const seen = new Set<string>();
  for (const item of value) {
    if (!isMapping(item)) throw new ValueError("each source must be a mapping");
    if (!Object.hasOwn(item, "name")) {
      throw new ValueError("each source must have a name");
    }
    const name = String(item["name"]);
    if (seen.has(name)) {
      throw new ValueError(`Duplicate source name: ${pyRepr(item["name"])}`);
    }
    seen.add(name);
  }
  return value;
}

/** Everything a `Config` can be constructed from. */
export interface ConfigInput {
  readonly wiki?: unknown;
  readonly graph?: unknown;
  readonly site?: unknown;
  readonly link?: unknown;
  readonly check?: unknown;
  readonly lint?: unknown;
  readonly sources?: unknown;
  readonly fmt?: unknown;
  readonly sparql_service?: unknown;
  readonly config_root?: string | Path;
}

/**
 * Wiki configuration: nested blocks, resolved against `configRoot`.
 *
 * The Python class is a pydantic model whose constructor takes keyword
 * arguments; the port takes one object, which is the same thing spelled the
 * TypeScript way.
 */
export class Config {
  readonly wiki: WikiBlock;
  readonly graph: GraphBlock;
  readonly site: SiteBlock;
  readonly link: LinkBlock;
  readonly check: CheckConfig;
  readonly lint: LintConfig;
  readonly sources: readonly SourceConfig[];
  readonly fmt: FmtConfig | null;
  readonly sparql_service: SparqlServiceBlock;
  readonly config_root: Path;

  constructor(data: ConfigInput = {}, options: { configName?: string } = {}) {
    const resolved = resolveConfig(data, options.configName ?? "");
    this.config_root = resolved.config_root;
    this.wiki = resolved.wiki;
    this.graph = resolved.graph;
    this.site = resolved.site;
    this.link = resolved.link;
    this.check = resolved.check;
    this.lint = resolved.lint;
    this.sources = resolved.sources;
    this.fmt = resolved.fmt;
    this.sparql_service = resolved.sparql_service;
  }

  /** Build a resolved config for a root directory, as `Config.for_root` does. */
  static forRoot(root: string | Path, overrides: ConfigInput = {}): Config {
    return new Config({ ...overrides, config_root: Path.of(root) });
  }

  /**
   * Load a config from an explicit file, or search the standard names in a
   * directory, falling back to defaults when no file exists.
   */
  static load(
    path: Path = new Path("."),
    options: { configName?: string } = {},
  ): Config {
    const potentialPaths = path.isFile()
      ? [path]
      : CONFIG_FILENAMES.map((name) => path.joinpath(name));

    for (const configPath of potentialPaths) {
      if (!configPath.exists()) continue;
      try {
        const content = readTextTolerant(configPath);
        let data: unknown;
        if (configPath.suffix === ".json") data = JSON.parse(content);
        else if (configPath.suffix === ".toml") data = parseToml(content);
        else data = parseYaml(content);

        if (!isMapping(data)) {
          throw new ValueError(
            `Invalid config file ${configPath.name}: top-level content must be a mapping`,
          );
        }

        const name = options.configName || configPath.name;
        const baseDir = configPath.parent.absolute();
        try {
          // The name is carried into resolution, not just into the routing:
          // the Python model receives it as pydantic validation context, and a
          // resolver failure such as `fmt path must be relative` embeds it.
          return new Config({ ...data, config_root: baseDir }, {
            configName: name,
          });
        } catch (error) {
          if (error instanceof SchemaValidationError) {
            throw formatConfigValidationError(name, error);
          }
          throw error;
        }
      } catch (error) {
        // A `ValueError` — including the formatted schema failures above — is
        // already a user-facing message. Anything else (a YAML/JSON/TOML syntax
        // failure) is wrapped with the file it came from.
        if (error instanceof ValueError) throw error;
        throw new ValueError(
          `Failed to load config file ${configPath.name}: ${String(error)}`,
        );
      }
    }

    return new Config();
  }

  /** The base IRI documents are loaded against. */
  get base_iri(): string {
    if (this.graph.base_iri) return this.graph.base_iri;
    if (this.graph.context && "wiki" in this.graph.context) {
      return normalizeBaseIri(String(this.graph.context["wiki"]));
    }
    return DEFAULT_WIKI_BASE;
  }

  /** The resolved custom page layout, or `null` when the built-in one is used. */
  get page_layout(): Path | null {
    const layout = this.site.layout;
    if (layout === null) return null;
    return parsePageLayoutPath(layout, this.config_root.absolute());
  }

  /** The JSON-LD context derived from `graph.context` and the base IRI. */
  get context(): Context {
    let prefixes: Record<string, string | null> | undefined;
    const graphContext = this.graph.context;
    if (graphContext) {
      prefixes = {};
      for (const [prefix, uri] of Object.entries(graphContext)) {
        if (
          (!prefix.startsWith("@") || prefix === "@vocab") &&
          (uri === null || typeof uri === "string")
        ) {
          prefixes[prefix] = uri;
        }
      }
    }
    return new Context({ namespaces: prefixes, baseIri: this.base_iri });
  }

  /** The prefix table for this wiki. */
  get namespaces(): ReadonlyMap<string, string> {
    return this.context.namespaces;
  }

  /** Bind this wiki's prefixes into a serializer. */
  bindNamespaces(target: { set(prefix: string, iri: string): void }): void {
    this.context.bindNamespaces(target);
  }

  /** A path as a config-root-relative POSIX string, for `exclude` matching. */
  relativeToRoot(path: Path): string {
    let rel: Path;
    try {
      rel = path.resolve().relativeTo(this.config_root.resolve());
    } catch {
      rel = path;
    }
    return rel.asPosix().replace(/^\/+/, "").replace(/\/+$/, "");
  }

  /** `true` when `path` matches any `wiki.exclude` pattern. */
  isExcluded(path: Path): boolean {
    const rel = this.relativeToRoot(path);
    return this.wiki.exclude.some((pattern) => fnmatchCase(rel, pattern));
  }
}

/** The fully resolved values behind a {@link Config}. */
interface ResolvedConfig {
  readonly wiki: WikiBlock;
  readonly graph: GraphBlock;
  readonly site: SiteBlock;
  readonly link: LinkBlock;
  readonly check: CheckConfig;
  readonly lint: LintConfig;
  readonly sources: readonly SourceConfig[];
  readonly fmt: FmtConfig | null;
  readonly sparql_service: SparqlServiceBlock;
  readonly config_root: Path;
}

/**
 * Validate and resolve raw config input.
 *
 * Mirrors pydantic's two phases: field validation first (which is where the
 * routing in {@link formatConfigValidationError} gets its material), then the
 * `mode="after"` resolver — which pydantic only runs when field validation
 * succeeded, so a resolver failure is always reported alone.
 */
function resolveConfig(data: ConfigInput, configName = ""): ResolvedConfig {
  const issues: ValidationIssue[] = [];
  const values = validateModel(configSpec, data, [], issues);
  if (issues.length > 0) throw new SchemaValidationError("Config", issues);

  try {
    return resolveRuntime(values, configName);
  } catch (error) {
    if (error instanceof ValueError) {
      // A model-level failure has an empty location and carries the whole
      // input as its value — that is how pydantic reports an exception raised
      // inside a model validator, and it is what the `fmt path must be
      // relative` message looks like in the oracle's output.
      throw new SchemaValidationError("Config", [
        valueError([], error.message, data),
      ]);
    }
    throw error;
  }
}

/** Absolute-path and normalisation pass, as `Config._resolve_runtime` does. */
function resolveRuntime(
  values: Record<string, unknown>,
  configName: string,
): ResolvedConfig {
  const configRoot = values["config_root"] as Path;
  const baseDir = configRoot.absolute();

  const wiki = values["wiki"] as unknown as WikiBlock;
  const inputs = wiki.input.map((path) => resolvePath(path, baseDir));
  const assetsRaw = wiki.assets === null || wiki.assets === undefined
    ? (baseDir.joinpath("assets").isDir() ? [new Path("assets")] : [])
    : [...wiki.assets];
  const assets = assetsRaw.map((path) => resolvePath(path, baseDir));
  const exclude = wiki.exclude.map((pattern) =>
    String(pattern).replaceAll("\\", "/")
  );

  const site = values["site"] as unknown as {
    layout: unknown;
    base_url: unknown;
    url_style: unknown;
  };
  const baseUrl = String(
    site.base_url === null || site.base_url === undefined
      ? DEFAULT_BASE_URL
      : site.base_url,
  ).replace(/\/+$/, "");
  const urlStyle = normalizeUrlStyle(site.url_style);
  const layout = parsePageLayoutPath(site.layout, baseDir);

  const sparql = values["sparql_service"] as unknown as SparqlServiceBlock;
  const sparqlPath = normalizeApiPath(sparql.path);

  const fmt = parseFmtConfig(values["fmt"], configName, baseDir);

  return {
    wiki: {
      input: inputs,
      assets,
      exclude,
      filename_pattern: (wiki.filename_pattern ?? null) as string | null,
    },
    graph: values["graph"] as unknown as GraphBlock,
    site: { layout, base_url: baseUrl, url_style: urlStyle },
    link: values["link"] as unknown as LinkBlock,
    check: values["check"] as unknown as CheckConfig,
    lint: values["lint"] as unknown as LintConfig,
    sources: values["sources"] as unknown as SourceConfig[],
    fmt,
    sparql_service: { enabled: sparql.enabled, path: sparqlPath },
    config_root: configRoot,
  };
}
