---
type: TechArticle
headline: Microdata
description: HTML5 specification for nesting semantics within content on web pages.
---

# Microdata

**Microdata** is an HTML specification used to nest metadata within existing content on web pages. Browsers, search engines, and web crawlers can extract this data to provide a richer browsing experience.

It provides a simpler approach to semantic tagging than RDFa, using standard [HTML](HTML.md) attributes like `itemscope`, `itemtype`, and `itemprop`.

Prefixed CURIEs (`schema:Thing`, `wiki:Page_Name`) in `itemtype`, `itemid`, `itemprop`, `href`, and `src` expand through the same `context` bindings in `wiki.yaml` as frontmatter. Bare `itemprop` names without a colon default to the `schema:` vocabulary when that prefix is bound.

## Examples

The [Wiki CLI](Wiki_CLI.md) extracts this format directly from wiki documents into the unified RDF pool:

<div itemscope itemtype="schema:TechArticle" itemid="wiki:Microdata#example">
  <span itemprop="schema:headline">Microdata in LLM Wiki</span>
  <meta itemprop="schema:description" content="A practical introduction to structuring linked metadata directly in markup." />
  <div itemprop="schema:about" itemscope itemtype="schema:SoftwareApplication">
    <span itemprop="schema:name">Wiki CLI</span>
    (<span itemprop="schema:description">A semantic command-line companion for markdown vaults</span>)
    supports extraction via BeautifulSoup.
  </div>
</div>

## References

- [Microdata — HTML Living Standard](https://html.spec.whatwg.org/multipage/microdata.html)
- [Microdata — MDN Web Docs](https://developer.mozilla.org/en-US/docs/Web/HTML/Microdata)
