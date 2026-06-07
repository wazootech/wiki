"""Tests for RDF serialization and metadata view helpers."""

from __future__ import annotations

import unittest

from wiki.format import (
    METADATA_VIEWS,
    normalize_metadata_format,
    normalize_metadata_mode,
    resolve_metadata_view,
)


class MetadataViewHelpersTest(unittest.TestCase):
    def test_normalize_metadata_mode(self) -> None:
        self.assertEqual(normalize_metadata_mode("compacted"), "compacted")
        self.assertEqual(normalize_metadata_mode("COMPACTED"), "compacted")
        self.assertEqual(normalize_metadata_mode("expanded"), "expanded")
        self.assertEqual(normalize_metadata_mode(None), "expanded")

    def test_normalize_metadata_format_aliases(self) -> None:
        self.assertEqual(normalize_metadata_format("json-ld"), "json-ld")
        self.assertEqual(normalize_metadata_format("jsonld"), "json-ld")
        self.assertEqual(normalize_metadata_format("ttl"), "turtle")
        self.assertEqual(normalize_metadata_format("rdf"), "xml")
        self.assertEqual(normalize_metadata_format("application/rdf+xml"), "xml")
        self.assertEqual(normalize_metadata_format("unknown"), "json-ld")

    def test_resolve_metadata_view_json_ld_is_always_compacted(self) -> None:
        self.assertEqual(resolve_metadata_view("json-ld", "expanded"), "json-ld-compacted")
        self.assertEqual(resolve_metadata_view("json-ld", "compacted"), "json-ld-compacted")
        self.assertEqual(resolve_metadata_view("jsonld", "compacted"), "json-ld-compacted")

    def test_resolve_metadata_view_non_json_ld_ignores_mode(self) -> None:
        self.assertEqual(resolve_metadata_view("turtle", "compacted"), "turtle")
        self.assertEqual(resolve_metadata_view("ttl", "expanded"), "turtle")

    def test_metadata_views_cover_export_formats(self) -> None:
        formats = {view["format"] for view in METADATA_VIEWS}
        self.assertIn("json-ld", formats)
        self.assertIn("turtle", formats)
        self.assertIn("xml", formats)
        self.assertIn("nquads", formats)


if __name__ == "__main__":
    unittest.main()
