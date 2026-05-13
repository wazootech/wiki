---
id: wiki:microdata
type: TechArticle
name: Microdata
description: HTML5 specification for nesting semantics within content on web pages.
---

# Microdata

**Microdata** is an HTML specification used to nest metadata within existing content on web pages. Browsers, search engines, and web crawlers can extract this data to provide a richer browsing experience.

It provides a simpler approach to semantic tagging than RDFa, using standard [[html]] attributes like `itemscope`, `itemtype`, and `itemprop`.

## Examples

The Wiki CLI extracts this format directly from wiki documents into the unified RDF pool:

<div itemscope itemtype="https://schema.org/TechArticle" itemid="wiki:microdata-example">
  <span itemprop="name">Microdata in LLM Wiki</span>
  <meta itemprop="description" content="A practical introduction to structuring linked metadata directly in markup." />
  <div itemprop="about" itemscope itemtype="https://schema.org/SoftwareApplication">
    <span itemprop="name">Wiki CLI</span> 
    (<span itemprop="description">A semantic command-line companion for markdown vaults</span>)
    supports extraction via BeautifulSoup.
  </div>
</div>
