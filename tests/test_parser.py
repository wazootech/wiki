import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from wiki.parser import (
    document_data_from_path,
    ensure_context,
    parse_frontmatter,
    split_document_body,
    split_frontmatter_body,
)


class TestFrontmatter(unittest.TestCase):
    def test_parse_frontmatter_valid(self) -> None:
        """Test parsing valid YAML frontmatter."""
        content = """---
id: wiki:gregory
givenName: Gregory
type: Person
---
Hello World
"""
        data = parse_frontmatter(content)
        self.assertIsNotNone(data)
        self.assertEqual(data.get("id"), "wiki:gregory")
        self.assertEqual(data.get("type"), "Person")
        self.assertEqual(data.get("givenName"), "Gregory")

    def test_parse_frontmatter_json(self) -> None:
        """Test parsing valid JSON frontmatter."""
        content = """---
{
  "id": "wiki:gregory",
  "givenName": "Gregory",
  "type": "Person"
}
---
Hello World
"""
        data = parse_frontmatter(content)
        self.assertIsNotNone(data)
        self.assertEqual(data.get("id"), "wiki:gregory")
        self.assertEqual(data.get("type"), "Person")

    def test_parse_frontmatter_invalid(self) -> None:
        """Test parsing invalid/broken frontmatters."""
        # No frontmatter delimiter
        self.assertIsNone(parse_frontmatter("Hello World"))
        
        # Single delimiter without any body or ending
        self.assertIsNone(parse_frontmatter("---"))
        
        # Invalid YAML syntax
        self.assertIsNone(parse_frontmatter("---\n[invalid_yaml\n---"))
        
        # Invalid JSON syntax
        self.assertIsNone(parse_frontmatter("---\n{\n---"))
        
        # Non-dictionary parsed yaml
        self.assertIsNone(parse_frontmatter("---\n- item1\n- item2\n---"))

    def test_ensure_context(self) -> None:
        """Test ensure_context injects defaults."""
        # Missing context entirely
        data = {"givenName": "Gregory"}
        updated = ensure_context(data)
        self.assertIn("@context", updated)
        self.assertEqual(updated["@context"]["@vocab"], "https://schema.org/")
        
        # Partial existing context dict
        data_partial = {"@context": {"custom": "http://custom.org/"}}
        updated_partial = ensure_context(data_partial)
        self.assertEqual(updated_partial["@context"]["custom"], "http://custom.org/")
        self.assertEqual(updated_partial["@context"]["@vocab"], "https://schema.org/")
        
        # Scalar non-dict @context remains untouched
        data_scalar = {"@context": "schema.org"}
        updated_scalar = ensure_context(data_scalar)
        self.assertEqual(updated_scalar["@context"], "schema.org")


    def test_split_frontmatter_body(self) -> None:
        """Test split_frontmatter_body returns (frontmatter, body) correctly."""
        # Valid frontmatter
        content = """---
id: wiki:test
label: Test
---
Body text here"""
        data, body = split_frontmatter_body(content)
        self.assertIsNotNone(data)
        self.assertEqual(data["label"], "Test")
        self.assertEqual(body, "Body text here")

        # No frontmatter
        no_fm = "Just body text\nwith multiple lines"
        data, body = split_frontmatter_body(no_fm)
        self.assertIsNone(data)
        self.assertEqual(body, no_fm)

    def test_split_frontmatter_body_with_dashes_in_body(self) -> None:
        """Test split_frontmatter_body handles --- in body text."""
        content = """---
id: wiki:test
label: Test
---
Body with --- dashes --- in text"""
        data, body = split_frontmatter_body(content)
        self.assertIsNotNone(data)
        self.assertEqual(body, "Body with --- dashes --- in text")

    def test_document_data_from_yaml_and_json_files(self) -> None:
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            yml_file = root / "person.yml"
            yaml_file = root / "person.yaml"
            json_file = root / "person.json"
            yml_file.write_text('type: Person\ngivenName: Gregory\n', encoding="utf-8")
            yaml_file.write_text('type: Person\ngivenName: Gregory\n', encoding="utf-8")
            json_file.write_text('{"type": "Person", "givenName": "Alice"}', encoding="utf-8")

            yml_data = document_data_from_path(yml_file)
            yaml_data = document_data_from_path(yaml_file)
            json_data = document_data_from_path(json_file)

            self.assertEqual(yml_data["givenName"], "Gregory")
            self.assertEqual(yaml_data["givenName"], "Gregory")
            self.assertEqual(json_data["givenName"], "Alice")
            self.assertIn("@context", yml_data)
            self.assertIn("@context", yaml_data)
            self.assertIn("@context", json_data)

    def test_document_data_rejects_non_mapping_data_files(self) -> None:
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            yml_file = root / "items.yml"
            yaml_file = root / "items.yaml"
            json_file = root / "items.json"
            yml_file.write_text('- one\n- two\n', encoding="utf-8")
            yaml_file.write_text('- one\n- two\n', encoding="utf-8")
            json_file.write_text('[1, 2, 3]', encoding="utf-8")

            self.assertIsNone(document_data_from_path(yml_file))
            self.assertIsNone(document_data_from_path(yaml_file))
            self.assertIsNone(document_data_from_path(json_file))

    def test_split_document_body_returns_empty_body_for_data_files(self) -> None:
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            yml_file = root / "person.yml"
            yaml_file = root / "person.yaml"
            yml_file.write_text('type: Person\ngivenName: Gregory\n', encoding="utf-8")
            yaml_file.write_text('type: Person\ngivenName: Gregory\n', encoding="utf-8")

            yml_data, yml_body = split_document_body(yml_file)
            yaml_data, yaml_body = split_document_body(yaml_file)

            self.assertIsNotNone(yml_data)
            self.assertEqual(yml_data["givenName"], "Gregory")
            self.assertEqual(yml_body, "")
            self.assertIsNotNone(yaml_data)
            self.assertEqual(yaml_data["givenName"], "Gregory")
            self.assertEqual(yaml_body, "")


if __name__ == "__main__":
    unittest.main()
