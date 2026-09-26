/**
 * `@wazoo/wiki` public API surface (JSR entrypoint).
 *
 * The Python engine remains the comparison oracle for supported behavior until
 * the migration gate passes. Deliberately deferred capabilities are documented
 * in the ADR; this file only re-exports what has actually been ported. Modules are ported one milestone at a time into this directory
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
  pathWithinRoot,
  resolveConfigRelativePath,
  routeForDocumentFile,
  routesFromMarkdownFiles,
  selectDocumentPaths,
  selectMarkdownPaths,
  validateFilenamePattern,
  validateRouteSafety,
} from "./paths.ts";
export { quote as quoteUrl } from "./urlquote.ts";
export {
  GitHubHeadingSlugger,
  type Heading,
  headingIds,
  headingSlug,
  parseHeadings,
} from "./headings.ts";
export {
  EXTERNAL_SCHEMES,
  formatInternalLink,
  fragmentId,
  isExternalLink,
  markdownLinkIsPage,
  markdownLinkTarget,
  PAGE_LINK_EXTENSIONS,
  resolvePageHref,
  resolvePageRoute,
  splitTarget,
} from "./links.ts";
export {
  LAYOUT_FRONTMATTER_KEY,
  LAYOUT_SUFFIX,
  layoutFileIsValid,
  layoutStem,
  parseLayoutFromFrontmatter,
  resolveLayoutPath,
} from "./layout.ts";
export {
  AuditReport,
  type BuildOptions,
  type BuildResult,
  type ExportResult,
  type FmtReport,
  type Issue,
  type IssueSeverity,
  type LinkReport,
  type Manifest,
  type RenderReport,
  type ScaffoldResult,
  severityIssues,
} from "./schemas/reports.ts";
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
  checkShaclAll,
  checkShaclFile,
  formatReport,
  loadShapes,
  type ShaclOutcome,
  validateShacl,
} from "./shacl.ts";
export {
  applyIssues,
  checkLayoutFrontmatter,
  collectBrokenLinks,
  formatBrokenLink,
  headingPlainText,
  lintBrokenLinks,
  lintDuplicateHeadings,
  lintFilenames,
  lintHeadingLevels,
  lintHeadings,
  lintLinkStyle,
  lintThematicBreaks,
  mergeResults,
  runCheck,
  type RunCheckOptions,
  runLint,
  titleCaseWordsAfterFirst,
} from "./audit.ts";
export {
  pyCasefold,
  pyIsDigit,
  pyIsLower,
  pyIsUpper,
  pySplitWhitespace,
  pyStripChars,
} from "./pystr.ts";
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
export { DocumentBatch } from "./batch.ts";
export {
  DEFAULT_FMT_EXTENSIONS,
  DEFAULT_FMT_OPTS,
  describeFmtSource,
  formatMarkdown,
  loadTomlOpts,
  mdformatOptions,
  readTomlOpts,
  REGISTERED_FMT_EXTENSIONS,
  renderDefaultMdformatToml,
  resolveFmtTomlOpts,
} from "./fmt_util.ts";
export {
  DEFAULT_LINE_WIDTH,
  formatMarkdownText,
  FORMATTER_PLUGIN_VERSIONS,
} from "./formatter.ts";
export { resolve as resolveSources } from "./sources.ts";
export {
  exitAuditReport,
  exitCheckResults,
  printCheckMessages,
} from "./cli_output.ts";
export {
  normalizeQueryFormat,
  QUERY_FORMATS,
  type QueryFormat,
} from "./format.ts";
export {
  EXPORT_FORMATS,
  type ExportFormat,
  type ExportMode,
  type ExportOptions,
  normalizeExportFormat,
  normalizeExportMode,
} from "./export.ts";
export {
  type GraphOptions,
  type QueryOptions,
  type RenderOptions,
  resolveRuntimeConfig,
  type RuntimeOverrides,
  Wiki,
} from "./wiki.ts";
