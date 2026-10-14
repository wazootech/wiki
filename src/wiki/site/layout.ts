import { isFile } from "../fspath.ts";
import { readTextTolerant } from "../parser.ts";
import type { VirtualPage } from "./types.ts";
// Embedded at compile time: `deno compile` does not bundle the
// `readTextFileSync(new URL(...))` below, which broke `wiki build` in every
// standalone release asset.
import fallbackLayoutHtml from "../index.html" with { type: "text" };

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll(
      "'",
      "&#x27;",
    );
}

function templateText(path: string | null): string {
  if (path !== null && isFile(path)) return readTextTolerant(path);
  return fallbackLayoutHtml;
}

/**
 * Render a layout template.
 *
 * `renderLayout` always fills the three built-in `%wiki.*%` slots (`base_url`,
 * `body`, `head`). A theme can add its own slots through `extraTokens`, an
 * exact-name to replacement-text map. A key that collides with a built-in slot
 * overrides it. Values are inserted verbatim, so a theme must HTML-escape any
 * untrusted text before putting it in the map. A `%wiki.*%` spelling absent
 * from both maps is left in the output unchanged, as `wiki build` has always
 * done.
 *
 * @param title Page title, used for the built-in `%wiki.head%` slot.
 * @param baseUrl Site base URL, used for the built-in `%wiki.base_url%` slot.
 * @param content Pre-built page HTML, used for `%wiki.body%` (not escaped).
 * @param templatePath Layout file to read; the built-in fallback when absent.
 * @param extraTokens Additional `%wiki.*%` slots; `extraTokens` wins on a
 * collision with a built-in slot key.
 */
export function renderLayout(
  title: string,
  baseUrl: string,
  content: string,
  templatePath: string | null,
  extraTokens?: ReadonlyMap<string, string>,
): string {
  const tokens = new Map([
    ["%wiki.base_url%", escapeHtml(baseUrl)],
    ["%wiki.body%", content],
    ["%wiki.head%", `<title>${escapeHtml(title)} - Wiki CLI</title>`],
  ]);
  if (extraTokens !== undefined) {
    for (const [token, value] of extraTokens) tokens.set(token, value);
  }
  let result = templateText(templatePath);
  for (
    const [token, value] of [...tokens].sort((left, right) =>
      right[0].length - left[0].length
    )
  ) {
    result = result.replaceAll(token, value);
  }
  return result;
}

/**
 * Render one page through its layout.
 *
 * Picks the page's `wazoo:layout` override when it has one, otherwise
 * `defaultLayout`. `extraTokens` is forwarded to {@link renderLayout}, so a
 * theme supplies its own slots to every page in one place.
 */
export function renderPageLayout(
  page: VirtualPage,
  baseUrl: string,
  defaultLayout: string | null,
  extraTokens?: ReadonlyMap<string, string>,
): string {
  return renderLayout(
    page.title,
    baseUrl,
    page.html,
    page.layout_path ?? defaultLayout,
    extraTokens,
  );
}
