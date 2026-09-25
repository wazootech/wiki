/**
 * `@wazoo/wiki` public API surface (JSR entrypoint).
 *
 * The Python engine remains the source of truth for every behaviour until the
 * parity gate passes, so this file only re-exports what has actually been
 * ported. Modules are ported one milestone at a time into this directory
 * alongside their Python counterparts (`audit.py` → `audit.ts`,
 * `graph_cache.py` → `graph_cache.ts`), and the published surface grows with
 * them rather than being scaffolded up front.
 *
 * See `docs/adr/0001-deno-rewrite.md` for the migration decision and the
 * ordering of the remaining work.
 */
export { VERSION } from "./version.ts";
export { BuildError, UpgradeError, WikiError } from "./errors.ts";
export {
  Context,
  DEFAULT_BASE_IRI,
  DEFAULT_NAMESPACES,
  DEFAULT_VOCAB,
  type NamespaceBinder,
} from "./context.ts";
export {
  bodyCodeSpans,
  type FrontmatterSplit,
  markdownBody,
  protectedInlineCodeSpans,
  spanOverlaps,
  splitFrontmatterText,
  splitMaxSplit,
  stripInlineCode,
} from "./document.ts";
export {
  BOM,
  DATA_DOCUMENT_EXTENSIONS,
  type DataRecord,
  DOCUMENT_EXTENSIONS,
  documentDataFromPath,
  ensureContext,
  frontmatterError,
  frontmatterFromPath,
  isRecord,
  linkedMarkdownMessage,
  parseFrontmatter,
  pyStrip,
  readTextTolerant,
  splitDocumentBody,
  splitFrontmatterBody,
  splitLines,
} from "./parser.ts";
export { pyRepr, pyReprString, pyStr, pyTypeName } from "./pyrepr.ts";
export {
  getLogger,
  type Logger,
  type LogLevel,
  type LogRecord,
  type LogSink,
  setLogSink,
} from "./logging.ts";
export {
  describeValidationError,
  extraForbidden,
  missing,
  modelType,
  SchemaValidationError,
  type ValidationIssue,
  valueError,
} from "./schemas/validation.ts";
export {
  Config,
  CONFIG_FILENAMES,
  DEFAULT_BASE_URL,
  DEFAULT_CHECK_CONFIG,
  DEFAULT_FILENAME_PATTERN,
  DEFAULT_LINK_STYLE,
  DEFAULT_LINT_CONFIG,
  DEFAULT_URL_STYLE,
  findConfigPath,
  formatConfigValidationError,
  normalizeApiPath,
  normalizeUrlStyle,
  VALID_URL_STYLES,
} from "./config.ts";
export type {
  ConfigInput,
  FmtConfig,
  GraphBlock,
  LinkBlock,
  SiteBlock,
  SparqlServiceBlock,
  WikiBlock,
} from "./schemas/wiki_config.ts";
export { coerceSeverity, type Severity } from "./schemas/rules.ts";
export type { CheckConfig, LintConfig } from "./schemas/rules.ts";
export {
  type GraphDescriptor,
  loadLockfile,
  type LockedSource,
  type Lockfile,
  LOCKFILE_FILENAME,
  LOCKFILE_VERSION,
  lockfileTimestamp,
  saveLockfile,
  type SourceConfig,
} from "./schemas/sources.ts";
export { METADATA_VIEWS, type MetadataView } from "./schemas/metadata.ts";
export type {
  BrokenLink,
  BrokenLinkFix,
  LinkOpportunity,
  OutputEntry,
  PageRoute,
} from "./schemas/domain.ts";
export {
  buildPageManifest,
  detectOutputCollisions,
  iterDocumentFiles,
  iterMarkdownFiles,
  pageOutputPath,
  pageRoutes,
  pageUrl,
  routeForDocumentFile,
  routesFromMarkdownFiles,
  selectDocumentPaths,
  selectMarkdownPaths,
  validateFilenamePattern,
  validateRouteSafety,
} from "./paths.ts";
export { quote as quoteUrl } from "./urlquote.ts";
export {
  blankNode,
  canParse,
  canSerialize,
  factory,
  literal,
  type LiteralOptions,
  mediaTypeFor,
  n3Term,
  namedNode,
  normalizeFormat,
  ntTerm,
  parseRdf,
  parseTurtle,
  type PrefixTable,
  type Quad,
  quad,
  RdfDataset,
  type RdfFormat,
  RdfGraph,
  serializeNquads,
  serializeNquadsDataset,
  serializeNt,
  serializeRdf,
  type Term,
  termKey,
  triple,
  UnsupportedFormatError,
} from "./rdf.ts";
export {
  effectiveTypes,
  type FrontmatterGraphOptions,
  frontmatterToGraph,
  graphDescriptors,
  graphStats,
  kebabCase,
  loadDataset,
  loadGraph,
  type LoadOptions,
  loadQueryGraph,
  type QueryGraphOptions,
  resolveObject,
  resolvePredicate,
  resolveType,
  rootGraphUri,
  sourceGraphUri,
  usesNamedGraphs,
} from "./graph.ts";
export { applyInference } from "./infer.ts";
export {
  buildTypeSchemaRegistry,
  checkFrontmatterSchema,
  coerceSchemaRefs,
  isRemoteSchemaRef,
  isSchemaBindingDocument,
  JSON_SCHEMA_KEY,
  localSchemaIsValid,
  MAX_SCHEMA_BYTES,
  normalizeTypeUri,
  REMOTE_FETCH_TIMEOUT,
  resolveLocalSchemaPath,
  type SchemaIssues,
  SchemaLoader,
  type SchemaLoaderOptions,
  schemaPathWithinRoot,
  TARGET_CLASS_KEY,
  validationPayload,
} from "./frontmatter_schema.ts";
export {
  JsonSchemaCompileError,
  type JsonSchemaError,
  JsonSchemaValidator,
  sortByInstancePath,
} from "./json_schema.ts";
export {
  cacheDir,
  canonicalJson,
  clearAllProcessGraphs,
  datasetCachePath,
  diskCachePath,
  iterWikiFiles,
  wikiFingerprint,
  type WikiManifest,
  wikiManifest,
  type WikiManifestEntry,
} from "./graph_cache.ts";
