import { join } from "@std/path";
import { METADATA_VIEWS, type MetadataView } from "../../schemas/metadata.ts";
import type { VirtualPage, WikiSite } from "../types.ts";

/** Appended to the built-in `%wiki.head%` title. */
export const DEFAULT_TITLE_SUFFIX = " - Wiki";
/** Layout file, relative to the theme directory. */
export const DEFAULT_LAYOUT = join("layouts", "wikipedia.html");
/** The metadata format shown before a reader picks another. */
export const DEFAULT_SELECTED_VIEW = "json-ld-compacted";
/** Identifiers the infobox omits because the layout already shows them. */
export const DEFAULT_HIDDEN_FIELDS: ReadonlySet<string> = new Set([
  "@context",
  "@id",
  "id",
  "@type",
  "type",
]);
/** Every view except `xml`, whose serialization is deferred (see module docs). */
export const DEFAULT_VIEWS: readonly MetadataView[] = METADATA_VIEWS.filter((
  view,
) => view.format !== "xml");
/** Page-menu item linking to the metadata tab, when a page has frontmatter. */
export const METADATA_TOOL_HTML =
  '<li><a href="#view-metadata-content" onclick="switchTab(\'metadata\'); return false;">View metadata</a></li>';
/** Metadata tab item, shown under the same condition as the tool link. */
export const METADATA_TAB_HTML =
  '<li id="ca-metadata"><a href="#view-metadata-content" onclick="switchTab(\'metadata\'); return false;">Metadata</a></li>';

/** Everything a theme's `tokens` callback sees for one page. */
export interface ThemePageContext {
  /** The page being rendered, or `null` for the site index. */
  readonly page: VirtualPage | null;
  readonly site: WikiSite;
  readonly baseUrl: string;
  readonly urlStyle: string;
  /** JSON array of `{slug, title}` for the layout's `%wiki.pages%` token. */
  readonly pagesJson: string;
}

/** Metadata-panel behaviour. */
export interface ThemeMetadataOptions {
  /** Panels to render, in tab order. Defaults to every view except `xml`. */
  readonly views?: readonly MetadataView[];
  /** View selected on load. Defaults to `json-ld-compacted`. */
  readonly selected_view?: string;
  /** Emit the "RDF/XML serialization is deferred." note. Defaults to `true`. */
  readonly note?: boolean;
  /**
   * Highlight one panel body. Return HTML: the result is inserted verbatim, so
   * escape the text first (`escapeHtml`) if the grammar highlights nothing. The
   * default escapes the whole body.
   */
  readonly highlight?: (text: string, view: MetadataView) => string;
}

/** What a theme supplies to `buildThemeSite`. */
export interface ThemeSiteOptions {
  /** Directory holding the theme's layouts and assets. */
  readonly dir: string;
  /** Layout file for ordinary pages. Defaults to `layouts/wikipedia.html`. */
  readonly layout?: string;
  /**
   * Layout file for pages whose frontmatter sets `redirect_to`. Omitted, such a
   * page renders with `layout`.
   */
  readonly redirect_layout?: string | null;
  /** Appended to the built-in `%wiki.head%` title. Defaults to ` - Wiki`. */
  readonly title_suffix?: string;
  /** Frontmatter keys omitted from the infobox. */
  readonly hidden_fields?: ReadonlySet<string>;
  readonly metadata?: ThemeMetadataOptions;
  /**
   * Extra `%wiki.*%` values merged over the shell tokens. Returning a shell key
   * overrides it (for example `%wiki.body%` for a custom index). An unfilled
   * token is left in the output verbatim, so the layout can be checked for
   * residue.
   */
  readonly tokens?: (context: ThemePageContext) => ReadonlyMap<string, string>;
}

export interface InfoboxRow {
  label: string;
  text: string;
  html: string;
}

/** Escape text for insertion into HTML markup. */
export function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll(
      "'",
      "&#x27;",
    );
}

/** Serialize a value for embedding inside a `<script>` element. */
export function safeJson(value: unknown): string {
  return (JSON.stringify(value) ?? "null").replace(
    /[<>&\u2028\u2029]/g,
    (character) => {
      switch (character) {
        case "<":
          return "\\u003c";
        case ">":
          return "\\u003e";
        case "&":
          return "\\u0026";
        case "\u2028":
          return "\\u2028";
        default:
          return "\\u2029";
      }
    },
  );
}

/**
 * Replace every `%wiki.*%` token in a layout.
 *
 * A token absent from `tokens` is left verbatim rather than emptied, so a typo
 * shows up in the output instead of silently vanishing. Values are inserted
 * as-is: escape untrusted text before putting it in the map.
 */
export function substitute(
  template: string,
  tokens: ReadonlyMap<string, string>,
): string {
  return template.replace(
    /%wiki\.[a-z0-9_.]+%/gi,
    (token) => tokens.get(token) ?? token,
  );
}
