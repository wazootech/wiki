import MarkdownIt from "markdown-it";
import type { Token } from "markdown-it/index.js";
import { GitHubHeadingSlugger, parseHeadings } from "../headings.ts";
import {
  isExternalLink,
  markdownLinkIsPage,
  resolvePageHref,
} from "../links.ts";
import { stripSparqlWrappersForHtml } from "../render.ts";
import { installWikiLinkRule } from "./markdown/wiki_link_rule.ts";

export {
  outlineForMarkdown,
  stripLeadingTitle,
  titleFromMarkdown,
} from "./markdown/title.ts";
export { renderOutlineTitle } from "./markdown/wiki_link_rule.ts";

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
