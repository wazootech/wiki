---
type: TechArticle
name: Microdata
description: HTML5 specification for nesting semantics within content on web pages.
---

# Microdata

**Microdata** is an HTML specification used to nest metadata within existing content on web pages. Browsers, search engines, and web crawlers can extract this data to provide a richer browsing experience.

It provides a simpler approach to semantic tagging than RDFa, using standard [HTML](HTML.md) attributes like `itemscope`, `itemtype`, and `itemprop`.

Prefixed CURIEs (`schema:Thing`, `wiki:Page_Name`) in `itemtype`, `itemid`, `itemprop`, `href`, and `src` expand through the same `context` bindings in `wiki.yaml` as frontmatter. Bare `itemprop` names without a colon default to the `schema:` vocabulary when that prefix is bound.

## Examples

The LLM Wiki CLI extracts this format directly from wiki documents into the unified RDF pool:

<div itemscope itemtype="schema:TechArticle" itemid="wiki:microdata-example">
  <span itemprop="schema:name">Microdata in LLM Wiki</span>
  <meta itemprop="schema:description" content="A practical introduction to structuring linked metadata directly in markup." />
  <div itemprop="schema:about" itemscope itemtype="schema:SoftwareApplication">
    <span itemprop="name">LLM Wiki CLI</span> 
    (<span itemprop="description">A semantic command-line companion for markdown vaults</span>)
    supports extraction via BeautifulSoup.
  </div>
</div>
