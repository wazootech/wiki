import { join } from "@std/path";
import { pathExists } from "../fspath.ts";
import { ValueError } from "../errors.ts";
import { DEFAULT_WIKI_BASE, normalizeBaseIri } from "../schemas/wiki_config.ts";
import {
  DEFAULT_BASE_URL,
  IMPLICIT_TYPES_POLICIES,
  INIT_OPTIONS_TO_CONFIG_PATH,
  type InitOptions,
  type ResolveInitOptions,
} from "./options.ts";
import {
  normalizeBaseUrl,
  normalizeInitLinkStyle,
  normalizeInitUrlStyle,
} from "./normalize.ts";
import {
  detectOriginRepo,
  inferGithubPagesUrls,
  parseGithubRepo,
} from "./github.ts";

export function resolveInitOptions(options: ResolveInitOptions): InitOptions {
  const cwd = options.cwd;
  let repo = options.repo ?? null;
  if (
    repo === null &&
    (options.init_git === true || pathExists(join(cwd, ".git")))
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
  const siteUrlStyle = normalizeInitUrlStyle(options.site_url_style);
  const linkStyle = normalizeInitLinkStyle(options.link_style);

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
