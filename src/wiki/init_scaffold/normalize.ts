import { ValueError } from "../errors.ts";
import { LEGACY_LINK_STYLE_MAP, LINK_STYLES } from "../schemas/wiki_config.ts";
import {
  DEFAULT_URL_STYLE,
  IMPLICIT_TYPES_POLICIES,
  type InitOptions,
  URL_STYLES,
} from "./options.ts";

/**
 * Normalize a `--link-style` override, translating the legacy spellings.
 *
 * Mirrors `coerceLinkStyle` in `schemas/wiki_config.ts`; both read the same
 * exported `LINK_STYLES` / `LEGACY_LINK_STYLE_MAP` so a new spelling or style
 * only has to be taught once. The warning is keyed on `link_style` here and
 * `link.style` in the schema, because the two report against different inputs.
 */
export function normalizeInitLinkStyle(
  value: string | null | undefined,
): string | null {
  if (value === null || value === undefined) return null;
  const normalized = value.trim().toLowerCase();
  const legacy = LEGACY_LINK_STYLE_MAP[normalized];
  if (legacy !== undefined) {
    console.warn(
      `link_style: '${normalized}' is deprecated, use '${legacy}' instead (edit config file link.style and re-run)`,
    );
    return legacy;
  }
  if (!LINK_STYLES.has(normalized)) {
    throw new ValueError(
      `expected standard or wikilink, got ${JSON.stringify(value)}`,
    );
  }
  return normalized;
}

/** Validate a `--site-url-style` override. */
export function normalizeInitUrlStyle(
  value: string | null | undefined,
): string {
  const normalized = (value || DEFAULT_URL_STYLE).trim().toLowerCase();
  if (!URL_STYLES.has(normalized)) {
    throw new ValueError(
      `Invalid site_url_style: ${JSON.stringify(value)}`,
    );
  }
  return normalized;
}

export function normalizeBaseUrl(value: string): string {
  let text = String(value).trim();
  if (!text.startsWith("/")) text = `/${text}`;
  if (text !== "/" && text.endsWith("/")) text = text.replace(/\/+$/, "");
  return text;
}

export function normalizeInitOptionStyles(options: InitOptions): InitOptions {
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
    ...options,
    site_url_style: siteUrlStyle,
    ...(linkStyle !== null ? { link_style: linkStyle } : {}),
    ...(implicitTypesPolicy !== null
      ? { graph_implicit_types_policy: implicitTypesPolicy }
      : {}),
  };
}
