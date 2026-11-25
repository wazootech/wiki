import MarkdownIt from "markdown-it";
import { resolvePageHref } from "../../links.ts";

export function installWikiLinkRule(
  md: MarkdownIt,
  baseUrl: string,
  urlStyle: string,
  currentRoute: string,
): void {
  md.inline.ruler.before(
    "link",
    "wikilink",
    (state: MarkdownIt.StateInline, silent: boolean) => {
      const start = state.pos;
      if (state.src.slice(start, start + 2) !== "[[") return false;
      const close = state.src.indexOf("]]", start + 2);
      if (close < 0) return false;
      const raw = state.src.slice(start + 2, close);
      const separator = raw.indexOf("|");
      const target = (separator < 0 ? raw : raw.slice(0, separator)).trim();
      const label = (separator < 0 ? raw : raw.slice(separator + 1)).trim() ||
        target;
      if (target === "") return false;
      if (silent) {
        state.pos = close + 2;
        return true;
      }
      const href = resolvePageHref(currentRoute, target, baseUrl, urlStyle);
      if (href === null) {
        const token = state.push("text", "", 0);
        token.content = `[[${raw}]]`;
      } else {
        const open = state.push("link_open", "a", 1);
        open.attrSet("class", "wikilink");
        open.attrSet("href", href);
        const text = state.push("text", "", 0);
        text.content = label;
        state.push("link_close", "a", -1);
      }
      state.pos = close + 2;
      return true;
    },
  );
}

export function renderOutlineTitle(
  title: string,
  baseUrl = "/wiki",
  urlStyle = "dir",
  currentRoute = "",
): string {
  const md = new MarkdownIt({ html: false, linkify: false });
  installWikiLinkRule(md, baseUrl, urlStyle, currentRoute);
  return md.renderInline(title).trim();
}
