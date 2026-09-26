import MarkdownIt from "markdown-it";
import type { Token } from "markdown-it/index.js";
import { GitHubHeadingSlugger, parseHeadings } from "../headings.ts";
import {
  isExternalLink,
  markdownLinkIsPage,
  resolvePageHref,
} from "../links.ts";
import { stripSparqlWrappersForHtml } from "../render.ts";
import type { TocItem } from "./types.ts";

export function titleFromMarkdown(markdown: string, fallback: string): string {
  const heading = parseHeadings(markdown).find((item) => item.level === 1);
  if (heading !== undefined) return heading.text.trim();
  const stem = fallback ? fallback.split("/").at(-1) ?? "Index" : "Index";
  return stem.replaceAll("_", " ").replaceAll("-", " ").trim() || "Index";
}

function normalizeTitle(text: string): string {
  return text.trim().normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, " ");
}

function headingTextForTitle(text: string): string {
  return normalizeTitle(text.replace(/`([^`\n]+)`/g, "$1"));
}

function stripLeadingTitleHeading(markdown: string, title: string): string {
  if (normalizeTitle(title) === "") return markdown;
  const lines = markdown.split("\n");
  let index = 0;
  while (index < lines.length && lines[index]!.trim() === "") index += 1;
  const line = lines[index];
  const match = line === undefined ? null : /^(#{1,6})\s+(.+)$/.exec(line);
  if (match === null || match[1]!.length !== 1) return markdown;
  if (headingTextForTitle(match[2]!) !== normalizeTitle(title)) return markdown;
  index += 1;
  while (index < lines.length && lines[index]!.trim() === "") index += 1;
  return lines.slice(index).join("\n");
}

function installWikiLinkRule(
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

export function renderWikiMarkdown(
  markdown: string,
  baseUrl = "/wiki",
  urlStyle = "dir",
  currentRoute = "",
): string {
  const md = new MarkdownIt({ html: false, linkify: false, breaks: false });
  installWikiLinkRule(md, baseUrl, urlStyle, currentRoute);
  const headings = parseHeadings(markdown);
  const slugger = new GitHubHeadingSlugger();
  let headingIndex = 0;
  const headingRule: MarkdownIt.Renderer.RenderRule = (
    tokens: Token[],
    index: number,
    options: MarkdownIt.Options,
    _environment: unknown,
    renderer: MarkdownIt.Renderer,
  ) => {
    const token = tokens[index]!;
    const heading = headings[headingIndex++];
    const title = heading?.text ?? "";
    token.attrSet("id", heading?.slug ?? slugger.slug(title));
    return renderer.renderToken(tokens, index, options);
  };
  md.renderer.rules.heading_open = headingRule;
  const linkRule: MarkdownIt.Renderer.RenderRule = (
    tokens: Token[],
    index: number,
    options: MarkdownIt.Options,
    _environment: unknown,
    renderer: MarkdownIt.Renderer,
  ) => {
    const token = tokens[index]!;
    const href = token.attrGet("href") ?? "";
    if (href !== "" && !isExternalLink(href) && markdownLinkIsPage(href)) {
      const resolved = resolvePageHref(currentRoute, href, baseUrl, urlStyle);
      if (resolved !== null) token.attrSet("href", resolved);
    }
    return renderer.renderToken(tokens, index, options);
  };
  md.renderer.rules.link_open = linkRule;
  const fenceRule: MarkdownIt.Renderer.RenderRule = (
    tokens: Token[],
    index: number,
  ) => {
    const token = tokens[index]!;
    const language = token.info.trim().split(/\s+/, 1)[0] ?? "";
    const escapedLanguage = md.utils.escapeHtml(language).replaceAll(
      '"',
      "&quot;",
    );
    const classAttribute = language === ""
      ? ""
      : ` class="language-${escapedLanguage}"`;
    const raw = md.utils.escapeHtml(token.content).replaceAll('"', "&quot;");
    const code = `<pre data-copy="${raw}"><code${classAttribute}>${
      md.utils.escapeHtml(token.content)
    }</code></pre>\n`;
    return code;
  };
  md.renderer.rules.fence = fenceRule;
  return md.render(stripSparqlWrappersForHtml(markdown));
}

export function outlineForMarkdown(markdown: string): TocItem[] {
  return parseHeadings(markdown)
    .filter((heading) => heading.level >= 2 && heading.level <= 6)
    .map((heading) => ({
      title: heading.text.trim(),
      slug: heading.slug,
      level: heading.level,
    }));
}

export function stripLeadingTitle(markdown: string, title: string): string {
  return stripLeadingTitleHeading(markdown, title);
}
