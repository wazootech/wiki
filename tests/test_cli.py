import json
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from click.testing import CliRunner

from wiki_cli.cli import main


class TestCLI(unittest.TestCase):
    def test_cli_create_scaffolds_file(self) -> None:
        """Test that wiki create scaffolds a new document with standardized frontmatter."""
        runner = CliRunner()
        with TemporaryDirectory() as tmpdir:
            # Run "wiki create" pointing to our temporary directory
            result = runner.invoke(
                main,
                [
                    "--wiki-dir", tmpdir,
                    "create", "My New Document",
                    "-v"
                ]
            )
            self.assertEqual(result.exit_code, 0)
            self.assertIn("Created document my-new-document.md", result.output)
            
            # Verify file exists and has correct content
            file_path = Path(tmpdir) / "my-new-document.md"
            self.assertTrue(file_path.exists())
            
            content = file_path.read_text(encoding="utf-8")
            self.assertIn("id: wiki:my-new-document", content)
            self.assertIn("type: schema:WebPage", content)
            self.assertIn("name: My New Document", content)
            self.assertIn("# My New Document", content)

    def test_cli_create_duplicate_fails(self) -> None:
        """Test that wiki create fails if the document already exists."""
        runner = CliRunner()
        with TemporaryDirectory() as tmpdir:
            # Create once
            result1 = runner.invoke(main, ["--wiki-dir", tmpdir, "create", "Duplicate"])
            self.assertEqual(result1.exit_code, 0)
            
            # Create twice
            result2 = runner.invoke(main, ["--wiki-dir", tmpdir, "create", "Duplicate"])
            self.assertEqual(result2.exit_code, 1)
            self.assertIn("Error: Document duplicate.md already exists", result2.output)

    def test_cli_check_succeeds_and_fails(self) -> None:
        """Test that wiki check succeeds on valid documents and fails on violations."""
        runner = CliRunner()
        with TemporaryDirectory() as tmpdir:
            # 1. Running check on empty directory conforms silently (success)
            result = runner.invoke(main, ["--wiki-dir", tmpdir, "check"])
            self.assertEqual(result.exit_code, 0)
            self.assertEqual(result.output, "")
            
            # 2. Add an invalid filename and test that strict mode fails
            invalid_file = Path(tmpdir) / "Invalid_Name.md"
            invalid_file.write_text("""---
id: wiki:invalid
type: schema:WebPage
name: Invalid Page
---
""", encoding="utf-8")
            
            result_strict = runner.invoke(main, ["--wiki-dir", tmpdir, "check", "--strict", "-v"])
            self.assertEqual(result_strict.exit_code, 1)
            self.assertIn("Errors:", result_strict.output)
            self.assertIn("is not lowercase kebab-case", result_strict.output)

    def test_cli_check_single_file(self) -> None:
        """Test wiki check with a single file specified."""
        runner = CliRunner()
        with TemporaryDirectory() as tmpdir:
            wiki_dir = Path(tmpdir)
            valid_file = wiki_dir / "valid-file.md"
            valid_file.write_text("""---
id: wiki:valid-file
type: schema:WebPage
name: Valid File
---
""", encoding="utf-8")
            
            # Conforming single file check
            result = runner.invoke(main, ["--wiki-dir", str(wiki_dir), "check", str(valid_file)])
            self.assertEqual(result.exit_code, 0)
            
            # Non-conforming single file check
            invalid_file = wiki_dir / "Invalid_Name.md"
            invalid_file.write_text("""---
id: wiki:invalid-name
type: schema:WebPage
name: Invalid Name
---
""", encoding="utf-8")
            result_invalid = runner.invoke(main, ["--wiki-dir", str(wiki_dir), "check", str(invalid_file), "--strict"])
            self.assertEqual(result_invalid.exit_code, 1)

    def test_cli_query_formats(self) -> None:
        """Test that wiki query executes successfully with various output formats."""
        runner = CliRunner()
        with TemporaryDirectory() as tmpdir:
            wiki_dir = Path(tmpdir)
            # Create a simple page
            (wiki_dir / "alice.md").write_text("""---
type: Person
name: Alice
---
""", encoding="utf-8")
            
            # Run simple query SELECT name
            query_str = "SELECT ?name WHERE { ?s <https://schema.org/name> ?name }"
            
            # Table format
            res_table = runner.invoke(main, ["--wiki-dir", str(wiki_dir), "query", "--no-inference", query_str])
            self.assertEqual(res_table.exit_code, 0)
            self.assertIn("Alice", res_table.output)
            
            # JSON format
            res_json = runner.invoke(main, ["--wiki-dir", str(wiki_dir), "query", "-f", "json", "--no-inference", query_str])
            self.assertEqual(res_json.exit_code, 0)
            parsed = json.loads(res_json.output)
            self.assertIn("results", parsed)
            
            # Error mode - invalid SPARQL syntax
            res_err = runner.invoke(main, ["--wiki-dir", str(wiki_dir), "query", "INVALID QUERY"])
            self.assertEqual(res_err.exit_code, 1)

    def test_cli_query_jq_filter(self) -> None:
        """Test that wiki query --jq extracts values from JSON output."""
        runner = CliRunner()
        with TemporaryDirectory() as tmpdir:
            wiki_dir = Path(tmpdir)
            (wiki_dir / "alice.md").write_text("""---
type: Person
name: Alice
---
""", encoding="utf-8")

            query_str = "SELECT ?name WHERE { ?s <https://schema.org/name> ?name }"

            # --jq auto-switches to JSON and extracts the value
            result = runner.invoke(main, [
                "--wiki-dir", str(wiki_dir),
                "query", "--no-inference", query_str,
                "--jq", "results.bindings[].name.value"
            ])
            self.assertEqual(result.exit_code, 0)
            self.assertIn("Alice", result.output)

            # --jq with no matches produces no output
            result_empty = runner.invoke(main, [
                "--wiki-dir", str(wiki_dir),
                "query", "--no-inference", query_str,
                "--jq", "results.nonexistent"
            ])
            self.assertEqual(result_empty.exit_code, 0)
            self.assertEqual(result_empty.output.strip(), "")

    def test_cli_render_inline_sparql(self) -> None:
        """Test that wiki render updates inline SPARQL blocks correctly."""
        runner = CliRunner()
        with TemporaryDirectory() as tmpdir:
            wiki_dir = Path(tmpdir)
            
            # Create a source file with SPARQL block
            source_content = """---
type: Person
name: Gregory
---
<!-- sparql:start -->
```sparql
SELECT ?name WHERE { ?s <https://schema.org/name> ?name }
```
<!-- sparql:end -->
"""
            file_path = wiki_dir / "gregory.md"
            file_path.write_text(source_content, encoding="utf-8")
            
            result = runner.invoke(main, ["--wiki-dir", str(wiki_dir), "render", "--no-inference", "-v"])
            self.assertEqual(result.exit_code, 0)
            
            # Verify the SPARQL block was rendered and updated inline
            updated_content = file_path.read_text(encoding="utf-8")
            self.assertIn("Gregory", updated_content)

    def test_cli_export(self) -> None:
        """Test that wiki export supports bulk and single file exports."""
        runner = CliRunner()
        with TemporaryDirectory() as tmpdir:
            wiki_dir = Path(tmpdir)
            
            # Create a simple page
            valid_file = wiki_dir / "gregory.md"
            valid_file.write_text("""---
type: Person
name: Gregory
---
""", encoding="utf-8")
            
            # Bulk export (raw default)
            result_bulk = runner.invoke(main, ["--wiki-dir", str(wiki_dir), "export"])
            self.assertEqual(result_bulk.exit_code, 0)
            data_bulk = json.loads(result_bulk.output)
            self.assertEqual(len(data_bulk), 1)
            self.assertEqual(data_bulk[0]["rdf"]["name"], "Gregory")
            
            # Single file export (raw default)
            result_single = runner.invoke(main, ["--wiki-dir", str(wiki_dir), "export", str(valid_file)])
            self.assertEqual(result_single.exit_code, 0)
            data_single = json.loads(result_single.output)
            self.assertEqual(data_single["rdf"]["name"], "Gregory")
            
            # Single file export failure (no frontmatter)
            no_fm_file = wiki_dir / "no-fm.md"
            no_fm_file.write_text("Hello", encoding="utf-8")
            result_fail = runner.invoke(main, ["--wiki-dir", str(wiki_dir), "export", str(no_fm_file)])
            self.assertEqual(result_fail.exit_code, 1)
    
    def test_cli_export_formats(self) -> None:
        """Test that wiki export supports various --rdf-format options."""
        runner = CliRunner()
        with TemporaryDirectory() as tmpdir:
            wiki_dir = Path(tmpdir)
            page = wiki_dir / "alice.md"
            page.write_text("""---
type: Person
name: Alice
---
""", encoding="utf-8")
            
            # json-ld format returns expanded JSON-LD
            result = runner.invoke(main, ["--wiki-dir", str(wiki_dir), "export", str(page), "--rdf-format", "json-ld"])
            self.assertEqual(result.exit_code, 0)
            data = json.loads(result.output)
            self.assertIsInstance(data["rdf"], list)
            self.assertIn("@id", data["rdf"][0])
            
            # turtle format returns serialized turtle string
            result = runner.invoke(main, ["--wiki-dir", str(wiki_dir), "export", str(page), "--rdf-format", "turtle"])
            self.assertEqual(result.exit_code, 0)
            data = json.loads(result.output)
            self.assertIn("schema:name", data["rdf"])  # turtle has prefix:name
            self.assertIn("Alice", data["rdf"])
            
            # xml format returns serialized RDF/XML string
            result = runner.invoke(main, ["--wiki-dir", str(wiki_dir), "export", str(page), "--rdf-format", "xml"])
            self.assertEqual(result.exit_code, 0)
            data = json.loads(result.output)
            self.assertIn("rdf:Description", data["rdf"])
            
            # nt format returns N-Triples string
            result = runner.invoke(main, ["--wiki-dir", str(wiki_dir), "export", str(page), "--rdf-format", "nt"])
            self.assertEqual(result.exit_code, 0)
            data = json.loads(result.output)
            self.assertIn("Alice", data["rdf"])
            self.assertIn(".", data["rdf"].strip()[-1])  # N-Triples ends with dot


    def test_cli_build(self) -> None:
        """Test that wiki build generates static HTML site (file style)."""
        runner = CliRunner()
        with TemporaryDirectory() as tmpdir:
            wiki_dir = Path(tmpdir) / "wiki"
            wiki_dir.mkdir()

            (wiki_dir / "alice.md").write_text("""---
type: Person
name: Alice
---
# Alice
Hello from Alice.

See also [[bob]].""", encoding="utf-8")

            (wiki_dir / "bob.md").write_text("""---
type: Person
name: Bob
---
# Bob
Hello from Bob.

## Early Life
Bob was born.""", encoding="utf-8")

            output_dir = Path(tmpdir) / "_site"

            result = runner.invoke(main, ["--wiki-dir", str(wiki_dir), "build", "--output-dir", str(output_dir), "-v"])
            self.assertEqual(result.exit_code, 0)
            self.assertIn("Built", result.output)

            self.assertTrue((output_dir / "wiki" / "index.html").exists())
            self.assertTrue((output_dir / "wiki" / "alice.html").exists())
            self.assertTrue((output_dir / "wiki" / "bob.html").exists())
            self.assertTrue((output_dir / "wiki" / "bob" / "early-life.html").exists())

            index_content = (output_dir / "wiki" / "index.html").read_text()
            self.assertIn("Alice", index_content)
            self.assertIn("Bob", index_content)
            self.assertIn("alice.html", index_content)
            self.assertIn("bob.html", index_content)
            self.assertIn("bob/early-life.html", index_content)

            alice_content = (output_dir / "wiki" / "alice.html").read_text()
            self.assertIn("Hello from Alice", alice_content)
            self.assertIn("bob.html", alice_content)

    def test_cli_build_dir_style(self) -> None:
        """Test that wiki build --url-style dir produces <slug>/index.html with clean links."""
        runner = CliRunner()
        with TemporaryDirectory() as tmpdir:
            wiki_dir = Path(tmpdir) / "wiki"
            wiki_dir.mkdir()

            (wiki_dir / "alice.md").write_text("""---
type: Person
name: Alice
---
# Alice
Hello from Alice.

See also [[bob]].""", encoding="utf-8")

            (wiki_dir / "bob.md").write_text("""---
type: Person
name: Bob
---
# Bob
Hello from Bob.

## Early Life
Bob was born.""", encoding="utf-8")

            output_dir = Path(tmpdir) / "_site"

            result = runner.invoke(main, ["--wiki-dir", str(wiki_dir), "build", "--output-dir", str(output_dir), "--url-style", "dir", "-v"])
            self.assertEqual(result.exit_code, 0)
            self.assertIn("Built", result.output)

            self.assertTrue((output_dir / "wiki" / "index.html").exists())
            self.assertTrue((output_dir / "wiki" / "alice" / "index.html").exists())
            self.assertTrue((output_dir / "wiki" / "bob" / "index.html").exists())
            self.assertTrue((output_dir / "wiki" / "bob" / "early-life" / "index.html").exists())

            index_content = (output_dir / "wiki" / "index.html").read_text()
            self.assertIn('href="/wiki/alice"', index_content)
            self.assertIn('href="/wiki/bob"', index_content)
            self.assertIn('href="/wiki/bob/early-life"', index_content)

            alice_content = (output_dir / "wiki" / "alice" / "index.html").read_text()
            self.assertIn("Hello from Alice", alice_content)
            self.assertIn('href="/wiki/bob"', alice_content)

    def test_cli_build_with_base_url(self) -> None:
        """Test that wiki build --base-url prefixes all paths."""
        runner = CliRunner()
        with TemporaryDirectory() as tmpdir:
            wiki_dir = Path(tmpdir) / "wiki"
            wiki_dir.mkdir()

            (wiki_dir / "alice.md").write_text("""---
type: Person
name: Alice
---
# Alice
Hello from [[bob]].""", encoding="utf-8")

            (wiki_dir / "bob.md").write_text("""---
type: Person
name: Bob
---
# Bob
Hello from [[alice]].""", encoding="utf-8")

            output_dir = Path(tmpdir) / "_site"

            result = runner.invoke(main, ["--wiki-dir", str(wiki_dir), "build", "--output-dir", str(output_dir), "--base-url", "/my-wiki"])
            self.assertEqual(result.exit_code, 0)

            alice_content = (output_dir / "my-wiki" / "alice.html").read_text()
            self.assertIn('/my-wiki/bob.html', alice_content)
            self.assertIn('/my-wiki/', alice_content)

            index_content = (output_dir / "my-wiki" / "index.html").read_text()
            self.assertIn('/my-wiki/', index_content)

    def test_cli_build_no_wiki_dir(self) -> None:
        """Test that wiki build errors when wiki directory missing."""
        runner = CliRunner()
        result = runner.invoke(main, ["--wiki-dir", "nonexistent", "build"])
        self.assertEqual(result.exit_code, 1)
        self.assertIn("Error", result.output)


if __name__ == "__main__":
    unittest.main()
