import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from wiki_cli.parser import (
    normalize_frontmatter_str,
    parse_frontmatter,
    split_frontmatter_body,
    to_camel_case,
    normalize_keys,
    ensure_context,
    normalize_all,
)


class TestFrontmatter(unittest.TestCase):
    def test_to_camel_case(self) -> None:
        """Test to_camel_case converts keys correctly."""
        self.assertEqual(to_camel_case("given_name"), "givenName")
        self.assertEqual(to_camel_case("given-name"), "givenName")
        self.assertEqual(to_camel_case("some-snake_case-mix"), "someSnakeCaseMix")
        self.assertEqual(to_camel_case("@type"), "@type")
        self.assertEqual(to_camel_case(""), "")

    def test_normalize_keys_recursive(self) -> None:
        """Test normalize_keys recursively normalizes keys."""
        data = {
            "given_name": "Gregory",
            "address": {
                "street-name": "Main St",
                "zip_code": 12345
            },
            "friends": [
                {"friend_name": "Alice"}
            ]
        }
        normalized = normalize_keys(data)
        self.assertEqual(normalized["givenName"], "Gregory")
        self.assertEqual(normalized["address"]["streetName"], "Main St")
        self.assertEqual(normalized["address"]["zipCode"], 12345)
        self.assertEqual(normalized["friends"][0]["friendName"], "Alice")
        
        # Test scalar non-dict / list
        self.assertEqual(normalize_keys("scalar"), "scalar")

    def test_parse_frontmatter_valid(self) -> None:
        """Test parsing valid YAML frontmatter."""
        content = """---
id: wiki:gregory
name: Gregory
type: Person
---
Hello World
"""
        data = parse_frontmatter(content)
        self.assertIsNotNone(data)
        self.assertEqual(data.get("id"), "wiki:gregory")
        self.assertEqual(data.get("type"), "Person")
        self.assertEqual(data.get("name"), "Gregory")

    def test_parse_frontmatter_json(self) -> None:
        """Test parsing valid JSON frontmatter."""
        content = """---
{
  "id": "wiki:gregory",
  "name": "Gregory",
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
        data = {"name": "Gregory"}
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

    def test_normalize_frontmatter_standardizes_keys(self) -> None:
        """Test that frontmatter normalization standardizes property keys to camelCase."""
        content = """---
given_name: Gregory
family_name: Smith
type: Person
id: wiki:gregory
---
Body content here
"""
        normalized = normalize_frontmatter_str(content)
        
        # Verify snake_case converted to camelCase
        self.assertIn("givenName: Gregory", normalized)
        self.assertIn("familyName: Smith", normalized)
        # Verify --- boundaries are preserved
        self.assertTrue(normalized.startswith("---"))
        self.assertTrue(normalized.strip().endswith("Body content here"))

    def test_normalize_frontmatter_json(self) -> None:
        """Test JSON frontmatter normalization."""
        content = """---
{
  "given_name": "Gregory"
}
---
Body
"""
        normalized = normalize_frontmatter_str(content)
        self.assertIn('"givenName": "Gregory"', normalized)

    def test_normalize_frontmatter_unmodified(self) -> None:
        """Test that normalization does not affect content without frontmatter."""
        content = "Hello World"
        self.assertEqual(normalize_frontmatter_str(content), content)
        
        # Non-dict frontmatter
        non_dict = "---\n- list\n---\nHello"
        self.assertEqual(normalize_frontmatter_str(non_dict), non_dict)

    def test_normalize_all(self) -> None:
        """Test bulk normalization of frontmatter."""
        with TemporaryDirectory() as tmpdir:
            wiki_path = Path(tmpdir)
            
            # Create files
            file1 = wiki_path / "file1.md"
            file2 = wiki_path / "file2.md"
            
            file1.write_text("---\ngiven_name: Alice\n---\nBody1", encoding="utf-8")
            
            # file2 already has @context and camelCase keys
            file2_content = """---
@context:
  "@vocab": https://schema.org/
  wiki: https://{{owner}}.github.io/{{repo}}/wiki/
  foaf: http://xmlns.com/foaf/0.1/
givenName: Bob
---
Body2"""
            file2.write_text(file2_content, encoding="utf-8")
            
            # Dry run
            results_dry = normalize_all(wiki_path, dry_run=True)
            self.assertEqual(results_dry["fixed"], 1)
            self.assertEqual(results_dry["skipped"], 1)
            
            # Verify file1 was not updated
            self.assertIn("given_name: Alice", file1.read_text(encoding="utf-8"))
            
            # Normal run
            results = normalize_all(wiki_path, dry_run=False)
            self.assertEqual(results["fixed"], 1)
            
            # Verify file1 was updated
            self.assertIn("givenName: Alice", file1.read_text(encoding="utf-8"))


    def test_split_frontmatter_body(self) -> None:
        """Test split_frontmatter_body returns (frontmatter, body) correctly."""
        # Valid frontmatter
        content = """---
id: wiki:test
name: Test
---
Body text here"""
        data, body = split_frontmatter_body(content)
        self.assertIsNotNone(data)
        self.assertEqual(data["name"], "Test")
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
name: Test
---
Body with --- dashes --- in text"""
        data, body = split_frontmatter_body(content)
        self.assertIsNotNone(data)
        self.assertEqual(body, "Body with --- dashes --- in text")


if __name__ == "__main__":
    unittest.main()
