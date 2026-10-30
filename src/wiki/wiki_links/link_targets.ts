import {
  fragmentId,
  isExternalLink,
  resolvePageRoute,
  splitTarget,
} from "../links.ts";
import type { DataRecord } from "../parser.ts";
import type { BrokenLink } from "../schemas/domain.ts";

/** A `wiki:` CURIE as it appears in metadata. */
const WIKI_CURIE_RE = /^wiki:[^\s]+$/;

/** Metadata keys whose values are identifiers or vocabulary, not wiki links. */
const METADATA_SKIP_KEYS: ReadonlySet<string> = new Set([
  "@context",
  "@id",
  "id",
  "@type",
  "type",
]);

/** A `BrokenLink` with the match-span fields left unset. */
export function linkIssue(
  fields:
    & Omit<
      BrokenLink,
      "match_start" | "match_end" | "full_match"
    >
    & Partial<Pick<BrokenLink, "match_start" | "match_end" | "full_match">>,
): BrokenLink {
  return {
    match_start: null,
    match_end: null,
    full_match: null,
    ...fields,
  };
}

/**
 * Why a page link does not resolve, or `null` when it does.
 *
 * A fragment-only target (`#Section`) resolves against the *current* route,
 * which is why `page_part === ""` is special-cased rather than passed to
 * `resolve_page_route`.
 */
export function pageTargetIssue(
  existingFiles: ReadonlySet<string>,
  headingIdsByRoute: ReadonlyMap<string, ReadonlySet<string>>,
  currentRoute: string,
  target: string,
  siteRoute: string | null = null,
): string | null {
  const [pagePart, fragment] = splitTarget(target);
  const route = siteRoute !== null
    ? siteRoute
    : pagePart === ""
    ? currentRoute
    : resolvePageRoute(currentRoute, target);
  if (route === null || !existingFiles.has(route)) return "missing_document";
  if (fragment) {
    const targetFragment = fragmentId(fragment);
    const ids = headingIdsByRoute.get(route) ?? new Set<string>();
    // `#top` is the HTML spec's own "scroll to the top of the document", so it
    // needs no heading to land on.
    if (!ids.has(targetFragment) && fragment.toLowerCase() !== "top") {
      return "missing_heading";
    }
  }
  return null;
}

/** The user-facing message for a page-target failure. */
export function pageTargetMessage(
  currentRoute: string,
  target: string,
  label: string,
  issueKind: string,
): string {
  if (issueKind === "missing_document") {
    return `In ${currentRoute}: Broken ${label} [${target}] points to non-existent document.`;
  }
  const [, fragment] = splitTarget(target);
  const targetFragment = fragmentId(fragment);
  return `In ${currentRoute}: Broken ${label} [${target}] points to missing heading '#${targetFragment}'.`;
}

/** The route a `wiki:` CURIE names, or `null` when it is not one. */
export function wikiRouteFromCurie(curie: string): string | null {
  if (!WIKI_CURIE_RE.test(curie)) return null;
  // `split(":", 1)[1]`, not `split(":")[1]`: everything after the *first*
  // colon is the local name, so a CURIE with a second colon keeps it.
  let local = curie.slice(curie.indexOf(":") + 1);
  local = local.split("#", 1)[0] as string;
  if (local.endsWith(".md")) local = local.slice(0, -3);
  return local;
}

/** Every `wiki:` CURIE in a document's metadata, excluding identifier keys. */
export function wikiCuriesInMetadata(data: DataRecord): string[] {
  const curies: string[] = [];

  const walk = (value: unknown): void => {
    if (typeof value === "string") {
      if (WIKI_CURIE_RE.test(value)) curies.push(value);
    } else if (Array.isArray(value)) {
      for (const item of value) walk(item);
    } else if (typeof value === "object" && value !== null) {
      for (const [key, item] of Object.entries(value)) {
        if (METADATA_SKIP_KEYS.has(key)) continue;
        walk(item);
      }
    }
  };

  for (const [key, value] of Object.entries(data)) {
    if (METADATA_SKIP_KEYS.has(key)) continue;
    walk(value);
  }
  return curies;
}

/**
 * Frontmatter values that name an image asset.
 *
 * The key rule is deliberately loose — `image`, `thumbnail`, `logo`, or any key
 * ending in `image` — because frontmatter vocabularies differ, and a schema
 * tells the author which one they are using, not this function.
 */
export function frontmatterAssetTargets(data: DataRecord): string[] {
  const targets: string[] = [];
  for (const [key, value] of Object.entries(data)) {
    const normalized = String(key).toLowerCase();
    if (
      normalized !== "image" && normalized !== "thumbnail" &&
      normalized !== "logo" && !normalized.endsWith("image")
    ) {
      continue;
    }
    if (typeof value === "string" && !isExternalLink(value)) {
      targets.push(value);
    } else if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === "string" && !isExternalLink(item)) {
          targets.push(item);
        }
      }
    }
  }
  return targets;
}
