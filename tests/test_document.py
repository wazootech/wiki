import unittest

from wiki.document import (
    WIKILINK_FULL_REGEX,
    markdown_body,
    protected_inline_code_spans,
    span_overlaps,
    split_frontmatter_text,
)


class TestDocument(unittest.TestCase):
    def test_split_frontmatter_text_prefix_length(self) -> None:
        content = """---
id: wiki:test
label: Test
---
Body text here"""
        split = split_frontmatter_text(content)
        self.assertTrue(split.prefix.startswith("---"))
        self.assertTrue(split.prefix.endswith("---"))
        self.assertEqual(len(split.prefix) + len(split.body), len(content))
        self.assertEqual(split.data["label"], "Test")
        self.assertEqual(split.body, "\nBody text here")

    def test_split_frontmatter_text_json(self) -> None:
        content = """---
{"id": "wiki:test", "type": "Person"}
---
Hello"""
        split = split_frontmatter_text(content)
        self.assertIsNotNone(split.data)
        self.assertEqual(split.data["type"], "Person")
        self.assertEqual(split.body, "\nHello")

    def test_split_frontmatter_text_no_frontmatter(self) -> None:
        content = "Just body\n\nNo frontmatter."
        split = split_frontmatter_text(content)
        self.assertEqual(split.prefix, "")
        self.assertEqual(split.body, content)
        self.assertIsNone(split.data)

    def test_split_frontmatter_text_dashes_in_body(self) -> None:
        content = """---
id: wiki:test
---
Body with --- dashes --- in text"""
        split = split_frontmatter_text(content)
        self.assertEqual(split.body, "\nBody with --- dashes --- in text")

    def test_markdown_body(self) -> None:
        content = "---\ntitle: T\n---\n\n# Hello"
        self.assertEqual(markdown_body(content), "\n\n# Hello")

    def test_wikilink_inside_inline_code_ignored_by_span_check(self) -> None:
        body = "See `[[not a link]]` for details."
        match = next(WIKILINK_FULL_REGEX.finditer(body))
        protected = protected_inline_code_spans(body)
        self.assertTrue(span_overlaps(match.start(), match.end(), protected))


if __name__ == "__main__":
    unittest.main()
