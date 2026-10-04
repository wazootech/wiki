/**
 * Link parsing and resolution.
 *
 * There is no `tests/test_links.py` to port: `links.py` is exercised through
 * `wiki_links` and the CLI in Python, and its own cases are the ones the link
 * audit's tests rely on. They are asserted directly here so a resolution bug
 * names the resolver rather than surfacing as a wrong broken-link message one
 * layer up.
 */

import { assert, assertEquals, assertThrows } from "@std/assert";
import {
  formatInternalLink,
  fragmentId,
  isExternalLink,
  markdownLinkIsPage,
  markdownLinkTarget,
  resolvePageHref,
  resolvePageRoute,
  splitTarget,
} from "../src/wiki/links.ts";

Deno.test("external schemes are recognised without a trailing slash", () => {
  for (
    const target of [
      "http://example.org",
      "https://example.org/a/b",
      "mailto:ada@example.org",
      "tel:+15551234",
      "HTTPS://EXAMPLE.ORG",
    ]
  ) {
    assert(isExternalLink(target), `${target} should be external`);
  }
  for (
    const target of [
      "Page.md",
      "#fragment",
      "docs/Page.md",
      "wiki:Alpha",
      "assets/logo.png",
      "",
    ]
  ) {
    assert(!isExternalLink(target), `${target} should not be external`);
  }
});

Deno.test("a target splits once, on the first hash", () => {
  assertEquals(splitTarget("Page#Section"), ["Page", "Section"]);
  assertEquals(splitTarget("Page"), ["Page", null]);
  assertEquals(splitTarget("#Section"), ["", "Section"]);
  assertEquals(splitTarget("Page#Section#More"), ["Page", "Section#More"]);
});

Deno.test("fragments are slugged the way headings are", () => {
  assertEquals(fragmentId("Section One"), "section-one");
  assertEquals(fragmentId("Early%20Life"), "early-life");
  assertEquals(fragmentId("  Early Life  "), "early-life");
  assertEquals(fragmentId(null), "");
  assertEquals(fragmentId(""), "");
});

Deno.test("a page route resolves against the linking page's directory", () => {
  assertEquals(resolvePageRoute("Beta", "Alpha"), "Alpha");
  assertEquals(resolvePageRoute("Beta", "Alpha.md"), "Alpha");
  assertEquals(resolvePageRoute("Beta", "Alpha#Section"), "Alpha");
  assertEquals(resolvePageRoute("docs/Beta", "Alpha"), "docs/Alpha");
  assertEquals(resolvePageRoute("docs/Beta", "../Alpha"), "Alpha");
  assertEquals(resolvePageRoute("docs/deep/Beta", "../../Alpha"), "Alpha");
  assertEquals(
    resolvePageRoute("docs/Beta", "sub/Alpha.yaml"),
    "docs/sub/Alpha",
  );
  assertEquals(resolvePageRoute("Beta", "docs\\Alpha.md"), "docs/Alpha");
  assertEquals(resolvePageRoute("Beta", "Alpha%20One.md"), "Alpha One");
});

Deno.test("index collapses and the current page resolves to itself", () => {
  assertEquals(resolvePageRoute("Beta", "docs/index.md"), "docs");
  assertEquals(resolvePageRoute("Beta", "index.md"), "");
  assertEquals(resolvePageRoute("Beta", ""), "Beta");
  assertEquals(resolvePageRoute("Beta", "#Section"), "Beta");
});

Deno.test("a link may not climb out of the wiki or use an absolute path", () => {
  assertEquals(resolvePageRoute("Beta", "../../Alpha"), null);
  assertEquals(resolvePageRoute("docs/Beta", "../../Alpha"), null);
  assertEquals(resolvePageRoute("Beta", "/docs/Alpha"), null);
});

Deno.test("a markdown link is a page link unless its extension says otherwise", () => {
  assert(markdownLinkIsPage("Page.md"));
  assert(markdownLinkIsPage("Page.yaml"));
  assert(markdownLinkIsPage("Page"));
  assert(markdownLinkIsPage("#fragment"));
  assert(!markdownLinkIsPage("assets/logo.png"));
  assert(!markdownLinkIsPage("notes.txt"));
  // A trailing dot is not an extension, on either side of the port.
  assert(markdownLinkIsPage("notes."));
});

Deno.test("an href is the page URL plus a slugged fragment", () => {
  assertEquals(
    resolvePageHref("Beta", "Alpha#Section One", "/wiki", "dir"),
    "/wiki/Alpha/#section-one",
  );
  assertEquals(
    resolvePageHref("Beta", "#Section One", "/wiki", "dir"),
    "#section-one",
  );
  assertEquals(resolvePageHref("Beta", "#", "/wiki", "dir"), "#");
  assertEquals(resolvePageHref("Beta", "../Alpha", "/wiki", "dir"), null);
});

Deno.test("link formatting has exactly two styles and refuses anything else", () => {
  assertEquals(formatInternalLink("Beta", "Beta page"), "[Beta page](Beta.md)");
  assertEquals(
    formatInternalLink("Beta", "Beta page", "wikilink"),
    "[[Beta|Beta page]]",
  );
  assertThrows(
    () => formatInternalLink("Beta", "Beta page", "obsidian"),
    Error,
    "expected standard or wikilink, got 'obsidian'",
  );
  assertEquals(markdownLinkTarget("docs/Alpha"), "docs/Alpha.md");
});
