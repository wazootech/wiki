/**
 * JSON Schema validation for wiki document frontmatter.
 *
 * Port of `src/wiki/frontmatter_schema.py`. Pages declare a schema two ways —
 * a *binding document* carries `sh:targetClass` plus `wazoo:jsonSchema` and
 * applies that schema to every page of the class, and a page may name extra
 * schemas for itself — and this module turns those declarations into the two
 * issue lists `wiki check` reports under `missing_schema_ref` and
 * `frontmatter_schema`.
 *
 * The validation language itself is {@link JsonSchemaValidator}, not this file;
 * what lives here is the lookup, the caching, the remote-fetch policy, and the
 * message shapes.
 *
 * Two deliberate differences from the Python module:
 *
 * - **The entry point is `async`.** Python resolves a remote schema with a
 *   blocking `urlopen`; the port uses `fetch`. The split between "reported
 *   issue" and "value" is unchanged, only the `await` is new, and every local
 *   path still performs no I/O beyond reading the schema file.
 * - **A malformed JSON schema file reports a JavaScript parse message.** Python
 *   renders `json.JSONDecodeError` (`Expecting value: line 1 column 1 (char 0)`);
 *   `JSON.parse` renders its own prose. The `could not be read as JSON (...)`
 *   frame, the issue's classification, and the exit code are identical, so this
 *   is spec-close by the ADR's rule rather than a bug to chase.
 *
 * Remote fetching is likewise environment-dependent by nature (DNS failures,
 * TLS errors) and is never byte-compared; the tests exercise it through an
 * injected fetch, the way the Python tests patch `urlopen`.
 */

import type { Config } from "./config.ts";
import { Path, ValueError } from "./fspath.ts";
import { effectiveTypes, resolveType } from "./graph.ts";
import { JsonSchemaValidator, sortByInstancePath } from "./json_schema.ts";
import {
  type DataRecord,
  documentDataFromPath,
  isRecord,
  pyStrip,
  readTextTolerant,
} from "./parser.ts";
import { iterDocumentFiles, routeForDocumentFile } from "./paths.ts";
import { pyStr } from "./pyrepr.ts";

/** The frontmatter key naming a JSON Schema document. */
export const JSON_SCHEMA_KEY = "wazoo:jsonSchema";

/** The SHACL key that turns a document into a type binding. */
export const TARGET_CLASS_KEY = "sh:targetClass";

/** Seconds before a remote schema fetch is abandoned. */
export const REMOTE_FETCH_TIMEOUT = 10;

/** Largest remote schema document the engine will read. */
export const MAX_SCHEMA_BYTES = 1_000_000;

/** The two issue lists `check_frontmatter_schema` returns. */
export type SchemaIssues = readonly [string[], string[]];

/**
 * Normalize `wazoo:jsonSchema` to a non-empty list of strings, or `null` when
 * absent.
 *
 * A scalar becomes a one-element list, whitespace-only entries are dropped, and
 * anything that is not a string raises the same `ValueError` the Python side
 * raises — the caller turns that into an `In <route>: ...` issue with the
 * exception's own text.
 */
export function coerceSchemaRefs(value: unknown): string[] | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    const text = pyStrip(value);
    return text === "" ? null : [text];
  }
  if (Array.isArray(value)) {
    const refs: string[] = [];
    for (const item of value) {
      if (typeof item !== "string") {
        throw new ValueError(
          "wazoo:jsonSchema list items must be strings",
        );
      }
      const text = pyStrip(item);
      if (text === "") {
        throw new ValueError(
          "wazoo:jsonSchema list items must be non-empty strings",
        );
      }
      refs.push(text);
    }
    return refs.length === 0 ? null : refs;
  }
  throw new ValueError("wazoo:jsonSchema must be a string or list of strings");
}

/** `true` for the two schemes the engine will fetch. */
export function isRemoteSchemaRef(ref: string): boolean {
  return ref.startsWith("http://") || ref.startsWith("https://");
}

/** Resolve a local `wazoo:jsonSchema` path relative to the wiki config root. */
export function resolveLocalSchemaPath(raw: string, configRoot: Path): Path {
  const text = pyStrip(raw).replaceAll("\\", "/");
  const path = Path.of(text);
  return (path.isAbsolute() ? path : configRoot.joinpath(path)).resolve();
}

/** `true` when `path` lives under `configRoot`. */
export function schemaPathWithinRoot(path: Path, configRoot: Path): boolean {
  try {
    path.resolve().relativeTo(configRoot.resolve());
  } catch (error) {
    if (error instanceof ValueError) return false;
    throw error;
  }
  return true;
}

/** `true` when `path` is a readable `.json` file under the config root. */
export function localSchemaIsValid(path: Path, configRoot: Path): boolean {
  if (!schemaPathWithinRoot(path, configRoot)) return false;
  return path.isFile() && path.name.toLowerCase().endsWith(".json");
}

/**
 * The type URI a `sh:targetClass` value names.
 *
 * `resolve_type` is a CURIE expander, not a string cast, so `schema:Person`
 * and the bare `Person` land on different URIs by design. The Python side
 * stringifies the result — `None` becomes the string `"None"` — and the
 * registry's keys depend on that, so the port keeps `String(None)`.
 */
export function normalizeTypeUri(typeToken: unknown, config: Config): string {
  const resolved = resolveType(typeToken, config.context);
  return resolved === null ? "None" : resolved.value;
}

/** `true` when a document binds a schema to a type class. */
export function isSchemaBindingDocument(fmData: DataRecord): boolean {
  if (!pyTruthy(fmData[TARGET_CLASS_KEY])) return false;
  try {
    return coerceSchemaRefs(fmData[JSON_SCHEMA_KEY]) !== null;
  } catch (error) {
    if (error instanceof ValueError) return false;
    throw error;
  }
}

/**
 * The frontmatter a JSON Schema validates.
 *
 * Schema pointers and SHACL keys are metadata about the binding, not content of
 * the page, so validating them against the page schema would report failures
 * the author cannot fix without deleting the binding.
 */
export function validationPayload(
  fmData: DataRecord,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fmData)) {
    if (key.startsWith("@")) continue;
    if (key === "id" || key === JSON_SCHEMA_KEY) continue;
    if (key.startsWith("sh:") || key === TARGET_CLASS_KEY) continue;
    payload[key] = value;
  }
  return payload;
}

/** Keep the first occurrence of each reference, in order. */
function dedupeRefs(refs: readonly string[]): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const ref of refs) {
    if (seen.has(ref)) continue;
    seen.add(ref);
    ordered.push(ref);
  }
  return ordered;
}

/**
 * Map a normalized target-class URI to the schema references binding it.
 *
 * Every document is read, not only the ones being checked: a page is validated
 * against a schema declared in *another* page, so `check --path` still needs
 * the whole registry.
 */
export function buildTypeSchemaRegistry(
  config: Config,
): Map<string, string[]> {
  const registry = new Map<string, string[]>();
  for (const filePath of iterDocumentFiles(config)) {
    const fmData = documentDataFromPath(
      filePath,
      config.graph.content_predicate ?? undefined,
    );
    if (fmData === null || !isSchemaBindingDocument(fmData)) continue;
    let refs: string[] | null;
    try {
      refs = coerceSchemaRefs(fmData[JSON_SCHEMA_KEY]);
    } catch (error) {
      if (error instanceof ValueError) continue;
      throw error;
    }
    if (refs === null || refs.length === 0) continue;
    const target = fmData[TARGET_CLASS_KEY];
    if (target === null || target === undefined) continue;
    const typeKey = normalizeTypeUri(target, config);
    const existing = registry.get(typeKey);
    if (existing === undefined) registry.set(typeKey, [...refs]);
    else existing.push(...refs);
  }
  for (const [key, refs] of registry) registry.set(key, dedupeRefs(refs));
  return registry;
}

/** How an unexpected property name reaches the `additionalProperties` message. */
type Fetch = typeof fetch;

export interface SchemaLoaderOptions {
  readonly remoteSchemaRefs?: "allow" | "deny" | "allowlist";
  readonly remoteSchemaHosts?: readonly string[];
  /** Injected for tests, the way the Python tests patch `urlopen`. */
  readonly fetch?: Fetch;
}

/** A loaded schema, or the reason it could not be loaded. */
interface LoadedSchema {
  readonly schema: Record<string, unknown> | null;
  readonly error: string | null;
}

/** A compiled validator, or the reason there is none. */
interface LoadedValidator {
  readonly validator: JsonSchemaValidator | null;
  readonly error: string | null;
}

/** Load and cache JSON Schema documents from local paths or remote URLs. */
export class SchemaLoader {
  readonly configRoot: Path;
  readonly remoteSchemaRefs: "allow" | "deny" | "allowlist";
  readonly remoteSchemaHosts: ReadonlySet<string>;
  readonly #fetch: Fetch;
  readonly #schemaCache = new Map<string, LoadedSchema>();
  readonly #validatorCache = new Map<string, LoadedValidator>();

  constructor(configRoot: Path, options: SchemaLoaderOptions = {}) {
    this.configRoot = configRoot.resolve();
    this.remoteSchemaRefs = options.remoteSchemaRefs ?? "allow";
    this.remoteSchemaHosts = new Set(options.remoteSchemaHosts ?? []);
    this.#fetch = options.fetch ?? fetch;
  }

  /**
   * The configured policy's objection to a remote reference, if any.
   *
   * Checked *before* any network call, so `deny` and an unmatched `allowlist`
   * host produce an issue without a request — which is the whole point of the
   * setting.
   */
  #remotePolicyError(ref: string): string | null {
    if (this.remoteSchemaRefs === "allow") return null;
    if (this.remoteSchemaRefs === "deny") {
      return "remote schema refs are disabled by check.remote_schema_refs";
    }
    const host = urlHostname(ref);
    if (host === null || !this.remoteSchemaHosts.has(host)) {
      return `remote schema host ${
        pyReprStr(host ?? ref)
      } is not allowed by check.remote_schema_hosts`;
    }
    return null;
  }

  /** Load a schema document, or report why it could not be loaded. */
  async loadSchema(ref: string): Promise<LoadedSchema> {
    const cached = this.#schemaCache.get(ref);
    if (cached !== undefined) return cached;

    let result: LoadedSchema;
    if (isRemoteSchemaRef(ref)) {
      const policyError = this.#remotePolicyError(ref);
      result = policyError !== null
        ? { schema: null, error: policyError }
        : await this.#fetchRemote(ref);
    } else {
      result = this.#loadLocal(ref);
    }

    this.#schemaCache.set(ref, result);
    return result;
  }

  /** Compile a schema document once, caching both outcomes. */
  async getValidator(ref: string): Promise<LoadedValidator> {
    const cached = this.#validatorCache.get(ref);
    if (cached !== undefined) return cached;

    const { schema, error } = await this.loadSchema(ref);
    if (error !== null || schema === null) {
      const result = { validator: null, error };
      this.#validatorCache.set(ref, result);
      return result;
    }

    let result: LoadedValidator;
    try {
      result = { validator: new JsonSchemaValidator(schema), error: null };
    } catch (compileError) {
      // Both construction failures and mid-validation schema errors reach
      // here: the port compiles where jsonschema validated lazily, which turns
      // a traceback into a reported issue (see json_schema.ts).
      result = {
        validator: null,
        error: `invalid JSON Schema document (${
          compileError instanceof Error
            ? compileError.message
            : String(compileError)
        })`,
      };
    }
    this.#validatorCache.set(ref, result);
    return result;
  }

  #loadLocal(ref: string): LoadedSchema {
    const path = resolveLocalSchemaPath(ref, this.configRoot);
    if (!localSchemaIsValid(path, this.configRoot)) {
      return {
        schema: null,
        error:
          "must resolve to a readable .json file under the wiki config root",
      };
    }
    let data: unknown;
    try {
      data = JSON.parse(readTextTolerant(path)) as unknown;
    } catch (error) {
      return { schema: null, error: `could not be read as JSON (${error})` };
    }
    if (!isRecord(data)) {
      return { schema: null, error: "must contain a JSON object" };
    }
    return { schema: data, error: null };
  }

  async #fetchRemote(ref: string): Promise<LoadedSchema> {
    let response: Response;
    try {
      response = await this.#fetch(ref, {
        headers: { "User-Agent": "Wiki-CLI/jsonschema" },
        signal: AbortSignal.timeout(REMOTE_FETCH_TIMEOUT * 1000),
      });
    } catch (error) {
      return { schema: null, error: fetchFailureMessage(error) };
    }

    if (!response.ok) {
      // `urlopen` raises on a non-2xx status; `fetch` resolves, so the
      // equivalent verdict is spelled out here.
      await response.body?.cancel().catch(() => {});
      return { schema: null, error: `HTTP ${response.status}` };
    }

    let raw: Uint8Array;
    try {
      raw = new Uint8Array(await response.arrayBuffer());
    } catch (error) {
      return { schema: null, error: fetchFailureMessage(error) };
    }
    if (raw.byteLength > MAX_SCHEMA_BYTES) {
      return {
        schema: null,
        error: `response exceeds ${MAX_SCHEMA_BYTES} bytes`,
      };
    }

    let data: unknown;
    try {
      data = JSON.parse(new TextDecoder().decode(raw)) as unknown;
    } catch (error) {
      return { schema: null, error: `response is not valid JSON (${error})` };
    }
    if (!isRecord(data)) {
      return { schema: null, error: "response must be a JSON object" };
    }
    return { schema: data, error: null };
  }
}

/**
 * A one-line reason for a failed fetch.
 *
 * Python renders `URLError.reason` (`[Errno 11001] getaddrinfo failed`);
 * `fetch` rejects with a `TypeError` whose `cause` carries the platform error.
 * The cause is the closest available text and, unlike the Python spelling, it
 * is not stable across runtimes — which is why the parity harness never
 * compares a live network failure.
 */
function fetchFailureMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === "TimeoutError") {
    return "request timed out";
  }
  const cause = (error as { cause?: unknown }).cause;
  const source = cause ?? error;
  return source instanceof Error ? source.message : String(source);
}

/** `urllib.parse.urlsplit(ref).hostname`, which is lower-cased and port-free. */
function urlHostname(ref: string): string | null {
  try {
    const url = new URL(ref);
    return url.hostname === "" ? null : url.hostname;
  } catch {
    return null;
  }
}

/** `!value`, in Python's sense, for the falsy checks this module inherits. */
function pyTruthy(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") return value !== "";
  if (Array.isArray(value)) return value.length > 0;
  if (isRecord(value)) return Object.keys(value).length > 0;
  return true;
}

/** Python's `repr` for a string, used by the host-policy message. */
function pyReprStr(text: string): string {
  return text.includes("'") && !text.includes('"') ? `"${text}"` : `'${text}'`;
}

/**
 * The schema references that apply to one document.
 *
 * Type bindings come first, then the page's own `wazoo:jsonSchema`, each
 * deduped across both sources. A page that *is* a binding document contributes
 * no page-level refs of its own: its `wazoo:jsonSchema` describes the class, so
 * validating the binding page against it would fail on the binding's own keys.
 */
function effectiveSchemaRefs(
  fmData: DataRecord,
  registry: ReadonlyMap<string, string[]>,
  config: Config,
): [string, string | null][] {
  const refs: [string, string | null][] = [];
  const seen = new Set<string>();

  for (const typeToken of effectiveTypes(fmData, config)) {
    const typeUri = normalizeTypeUri(typeToken, config);
    for (const ref of registry.get(typeUri) ?? []) {
      if (seen.has(ref)) continue;
      seen.add(ref);
      refs.push([ref, `via type ${pyStr(typeToken)}`]);
    }
  }

  if (!isSchemaBindingDocument(fmData)) {
    let pageRefs: string[] | null = null;
    try {
      pageRefs = coerceSchemaRefs(fmData[JSON_SCHEMA_KEY]);
    } catch (error) {
      if (!(error instanceof ValueError)) throw error;
    }
    for (const ref of pageRefs ?? []) {
      if (seen.has(ref)) continue;
      seen.add(ref);
      refs.push([ref, null]);
    }
  }

  return refs;
}

/** The issue for a `wazoo:jsonSchema` that could not be loaded at all. */
function formatMissingRef(
  route: string,
  ref: string,
  detail: string,
  options: { readonly binding: boolean },
): string {
  if (isRemoteSchemaRef(ref)) {
    return `In ${route}: wazoo:jsonSchema ${
      pyReprStr(ref)
    } could not be fetched (${detail}).`;
  }
  if (options.binding) {
    return `In ${route}: wazoo:jsonSchema on type binding ${
      pyReprStr(ref)
    } ${detail}.`;
  }
  return `In ${route}: wazoo:jsonSchema ${pyReprStr(ref)} ${detail}.`;
}

/** The issue for one schema validation failure. */
function formatValidationError(
  route: string,
  ref: string,
  error: { readonly message: string },
  via: string | null,
): string {
  const viaPart = via ? `, ${via}` : "";
  return `In ${route}: ${error.message} (schema: ${ref}${viaPart})`;
}

/**
 * Check every document's frontmatter against the schemas that bind it.
 *
 * Returns `[missing_schema_ref issues, frontmatter_schema issues]`: failures to
 * *find* a schema and failures to *satisfy* one are different rules with
 * different severities, so the caller routes them separately. Both rules must be
 * off before the whole pass — registry build included — is skipped.
 */
export async function checkFrontmatterSchema(
  config: Config,
  fileFilter: ReadonlySet<string> | null = null,
  options: { readonly filePaths?: readonly Path[] | null } = {},
): Promise<SchemaIssues> {
  if (
    config.check.frontmatter_schema === "off" &&
    config.check.missing_schema_ref === "off"
  ) {
    return [[], []];
  }

  const registry = buildTypeSchemaRegistry(config);
  const loader = new SchemaLoader(config.config_root, {
    remoteSchemaRefs: config.check.remote_schema_refs,
    remoteSchemaHosts: config.check.remote_schema_hosts,
  });
  const missingIssues: string[] = [];
  const validationIssues: string[] = [];

  const candidates = options.filePaths ?? iterDocumentFiles(config);

  for (const filePath of candidates) {
    let route: string;
    try {
      route = routeForDocumentFile(config, filePath);
    } catch (error) {
      if (error instanceof ValueError) continue;
      throw error;
    }
    if (fileFilter !== null && !fileFilter.has(route)) continue;

    const fmData = documentDataFromPath(
      filePath,
      config.graph.content_predicate ?? undefined,
    );
    if (fmData === null || !pyTruthy(fmData)) continue;

    try {
      coerceSchemaRefs(fmData[JSON_SCHEMA_KEY]);
    } catch (error) {
      if (!(error instanceof ValueError)) throw error;
      validationIssues.push(`In ${route}: ${error.message}.`);
      continue;
    }

    if (isSchemaBindingDocument(fmData)) {
      let bindingRefs: string[] | null = null;
      try {
        bindingRefs = coerceSchemaRefs(fmData[JSON_SCHEMA_KEY]);
      } catch {
        bindingRefs = null;
      }
      for (const ref of bindingRefs ?? []) {
        const { error } = await loader.loadSchema(ref);
        if (error !== null && config.check.missing_schema_ref !== "off") {
          missingIssues.push(
            formatMissingRef(route, ref, error, { binding: true }),
          );
        }
      }
      continue;
    }

    const schemaRefs = effectiveSchemaRefs(fmData, registry, config);
    if (schemaRefs.length === 0) continue;

    const instance = validationPayload(fmData);
    for (const [ref, via] of schemaRefs) {
      const { validator, error } = await loader.getValidator(ref);
      if (error !== null) {
        if (config.check.missing_schema_ref !== "off") {
          missingIssues.push(
            formatMissingRef(route, ref, error, { binding: false }),
          );
        }
        continue;
      }
      if (validator === null) continue;
      for (const failure of sortByInstancePath(validator.errors(instance))) {
        if (config.check.frontmatter_schema === "off") continue;
        validationIssues.push(
          formatValidationError(route, ref, failure, via),
        );
      }
    }
  }

  return [missingIssues, validationIssues];
}
