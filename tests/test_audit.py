import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from wiki.config import WikiConfig
from wiki.audit import (
    audit_broken_links,
    audit_filenames,
    audit_headings,
    audit_internal_links,
    audit_markdown_flavor,
    load_shapes,
    check_shacl_file,
    check_shacl_all,
    run_checks,
)


class TestChecking(unittest.TestCase):
    def test_audit_filenames_validation(self) -> None:
        """Test auditing of filenames for lowercase kebab-case naming standard."""
        with TemporaryDirectory() as tmpdir:
            config = WikiConfig(input_dirs=[tmpdir], filename_pattern="[a-z0-9-]+")
            
            # Create valid and invalid files
            valid_path = Path(tmpdir) / "valid-kebab-case.md"
            invalid_path = Path(tmpdir) / "Invalid_Name.md"
            
            valid_path.write_text("content", encoding="utf-8")
            invalid_path.write_text("content", encoding="utf-8")
            
            warnings = audit_filenames(config)
            self.assertEqual(len(warnings), 1)
            self.assertIn("Filename 'Invalid_Name.md' does not match filenamePattern.", warnings[0])

    def test_audit_broken_links_validation(self) -> None:
        """Test auditing of internal link structures (WikiLinks and Markdown links)."""
        with TemporaryDirectory() as tmpdir:
            config = WikiConfig(input_dirs=[tmpdir])
            
            # Create one target file
            target_path = Path(tmpdir) / "target-page.md"
            target_path.write_text("content", encoding="utf-8")
            
            # Create a source file with both valid and broken links
            source_content = """---
id: wiki:source
type: Person
---
Here is a valid WikiLink [[target-page]] and a broken WikiLink [[non-existent-page]].
And a valid Markdown link [Target](target-page.md) and a broken Markdown link [Broken](missing.md).
"""
            source_path = Path(tmpdir) / "source-page.md"
            source_path.write_text(source_content, encoding="utf-8")
            
            warnings = audit_broken_links(config)
            
            # Verify exactly the two broken links are reported
            self.assertEqual(len(warnings), 2)
            self.assertTrue(any("Broken WikiLink [non-existent-page]" in w for w in warnings))
            self.assertTrue(any("Broken Markdown link [missing.md]" in w for w in warnings))

    def test_audit_broken_wiki_curie_in_frontmatter(self) -> None:
        """Frontmatter wiki: CURIEs must resolve to an existing document route."""
        with TemporaryDirectory() as tmpdir:
            config = WikiConfig(input_dirs=[tmpdir])
            Path(tmpdir, "Wiki_CLI.md").write_text("---\ntype: SoftwareApplication\n---\n", encoding="utf-8")
            Path(tmpdir, "Farzapedia.md").write_text(
                "---\ntype: TechArticle\nabout: wiki:llm-wiki-cli\n---\n",
                encoding="utf-8",
            )

            warnings = audit_broken_links(config)
            self.assertEqual(len(warnings), 1)
            self.assertIn("wiki:llm-wiki-cli", warnings[0])
            self.assertIn("Metadata reference", warnings[0])

    def test_internal_links_config_alias(self) -> None:
        """Deprecated check.internalLinks maps to brokenLinks severity."""
        config = WikiConfig(input_dirs=["wiki"], check={"internalLinks": "off"})
        self.assertEqual(config.check.get("brokenLinks"), "off")

    def test_wiki_curie_with_fragment_resolves_to_page_route(self) -> None:
        """wiki:Page#fragment refers to the same vault route as wiki:Page."""
        with TemporaryDirectory() as tmpdir:
            config = WikiConfig(input_dirs=[tmpdir])
            Path(tmpdir, "Microdata.md").write_text(
                '---\ntype: TechArticle\n---\n<div itemid="wiki:Microdata#example"></div>\n',
                encoding="utf-8",
            )
            self.assertEqual(audit_broken_links(config), [])

    def test_markdown_can_link_to_yaml_document(self) -> None:
        with TemporaryDirectory() as tmpdir:
            config = WikiConfig(input_dirs=[tmpdir])

            yml_target = Path(tmpdir) / "yml-target.yml"
            yml_target.write_text("type: Thing\nname: YML\n", encoding="utf-8")
            yaml_target = Path(tmpdir) / "yaml-target.yaml"
            yaml_target.write_text("type: Thing\nname: YAML\n", encoding="utf-8")

            source_path = Path(tmpdir) / "source-page.md"
            source_path.write_text("See [[yml-target]], [[yaml-target]].", encoding="utf-8")

            warnings = audit_internal_links(config)
            self.assertEqual(warnings, [])

    def test_audit_filenames_includes_yaml_documents(self) -> None:
        with TemporaryDirectory() as tmpdir:
            config = WikiConfig(input_dirs=[tmpdir], filename_pattern="[a-z0-9-]+")

            invalid_yml = Path(tmpdir) / "Invalid_Name.yml"
            invalid_yml.write_text("type: Thing\n", encoding="utf-8")
            invalid_yaml = Path(tmpdir) / "Invalid_Name.yaml"
            invalid_yaml.write_text("type: Thing\n", encoding="utf-8")

            warnings = audit_filenames(config)
            self.assertEqual(len(warnings), 2)
            self.assertTrue(any("Invalid_Name.yml" in w for w in warnings))
            self.assertTrue(any("Invalid_Name.yaml" in w for w in warnings))

    def test_load_shapes_edge_cases(self) -> None:
        """Test load_shapes behaves predictably with different underlying graph states."""
        from wiki.graph import load_graph
        from rdflib import Graph

        # Empty graph
        with TemporaryDirectory() as tmpdir:
            data_graph = Graph()
            shapes = load_shapes(data_graph)
            self.assertEqual(len(shapes), 0)
            
            # Loading from configuration with missing directories
            config = WikiConfig(input_dirs=[Path(tmpdir) / "non-existent"])
            data_graph_conf = load_graph(config, infer=False)
            shapes_conf = load_shapes(data_graph_conf)
            self.assertEqual(len(shapes_conf), 0)

    def test_check_shacl_file_and_all(self) -> None:
        """Test check_shacl_file and check_shacl_all for conformance."""
        with TemporaryDirectory() as tmpdir:
            wiki_dir = Path(tmpdir) / "wiki"
            wiki_dir.mkdir()
            
            # Create a basic shape file alongside the wiki files
            shape_content = """
@prefix sh: <http://www.w3.org/ns/shacl#> .
@prefix schema: <https://schema.org/> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

schema:PersonShape
    a sh:NodeShape ;
    sh:targetClass schema:Person ;
    sh:property [
        sh:path schema:name ;
        sh:minCount 1 ;
        sh:datatype xsd:string ;
    ] .
"""
            (wiki_dir / "person-shape.ttl").write_text(shape_content, encoding="utf-8")
            config = WikiConfig(input_dirs=[wiki_dir])
            
            # 1. No frontmatter -> check_shacl_file returns None
            no_fm_file = wiki_dir / "no-fm.md"
            no_fm_file.write_text("just text", encoding="utf-8")
            self.assertIsNone(check_shacl_file(no_fm_file, config))
            
            # 2. File with valid Person (name present)
            valid_person = wiki_dir / "valid-person.md"
            valid_person.write_text("""---
type: Person
name: Gregory
---
""", encoding="utf-8")
            res_valid = check_shacl_file(valid_person, config)
            self.assertIsNotNone(res_valid)
            self.assertTrue(res_valid[0])  # conforms
            
            # 3. File with invalid Person (missing name)
            invalid_person = wiki_dir / "invalid-person.md"
            invalid_person.write_text("""---
type: Person
---
""", encoding="utf-8")
            res_invalid = check_shacl_file(invalid_person, config)
            self.assertIsNotNone(res_invalid)
            self.assertFalse(res_invalid[0])  # does not conform
            
            # 4. Test check_shacl_all integrates both
            conforms_all, results_all = check_shacl_all(config)
            self.assertFalse(conforms_all)

    def test_run_checks_severity_and_promotion(self) -> None:
        """Test run_checks respects configuration for warning levels and promotions."""
        with TemporaryDirectory() as tmpdir:
            wiki_dir = Path(tmpdir)
            
            # Create an invalid filename violating lowercase kebab-case
            invalid_file = wiki_dir / "Invalid_Name.md"
            invalid_file.write_text("""---
type: schema:WebPage
---
""", encoding="utf-8")
            
            # Scenario A: check.filenamePattern is "warning"
            config_warning = WikiConfig(input_dirs=[wiki_dir], filename_pattern="[a-z0-9-]+", check={"filenamePattern": "warning"})
            res_warning = run_checks(config_warning)
            self.assertTrue(res_warning["conforms"])
            self.assertEqual(len(res_warning["warnings"]), 1)
            self.assertEqual(len(res_warning["errors"]), 0)
            
            # Scenario B: check.filenamePattern is "error"
            config_error = WikiConfig(input_dirs=[wiki_dir], filename_pattern="[a-z0-9-]+", check={"filenamePattern": "error"})
            res_error = run_checks(config_error)
            self.assertFalse(res_error["conforms"])
            self.assertEqual(len(res_error["warnings"]), 0)
            self.assertEqual(len(res_error["errors"]), 1)
            
            # Scenario C: check.filenamePattern is "off"
            config_off = WikiConfig(input_dirs=[wiki_dir], filename_pattern="[a-z0-9-]+", check={"filenamePattern": "off"})
            res_off = run_checks(config_off)
            self.assertTrue(res_off["conforms"])
            self.assertEqual(len(res_off["warnings"]), 0)
            self.assertEqual(len(res_off["errors"]), 0)

    def test_filename_pattern_reports_non_matching_stems(self) -> None:
        """Custom filenamePattern controls filename hygiene without preset styles."""
        with TemporaryDirectory() as tmpdir:
            wiki_dir = Path(tmpdir)
            (wiki_dir / "Ethan_Davidson.md").write_text("---\ntype: schema:Person\n---\n", encoding="utf-8")
            (wiki_dir / "ethan-davidson.md").write_text("---\ntype: schema:Person\n---\n", encoding="utf-8")

            config = WikiConfig(input_dirs=[wiki_dir], filename_pattern="[A-Z][A-Za-z0-9_]*")
            res = run_checks(config)

            self.assertTrue(res["conforms"])
            self.assertEqual(len(res["warnings"]), 1)
            self.assertIn("ethan-davidson.md", res["warnings"][0])

    def test_wikilink_resolution_requires_path_specifier_target(self) -> None:
        """Wikilinks use path specifiers and do not space-normalize targets."""
        with TemporaryDirectory() as tmpdir:
            wiki_dir = Path(tmpdir)
            (wiki_dir / "Ethan_Davidson.md").write_text("---\ntype: schema:Person\n---\n", encoding="utf-8")
            (wiki_dir / "Source.md").write_text(
                "---\ntype: schema:CreativeWork\n---\n\nSee [[Ethan Davidson]].",
                encoding="utf-8",
            )

            config = WikiConfig(input_dirs=[wiki_dir])
            res = run_checks(config)

            self.assertTrue(any("Broken WikiLink [Ethan Davidson]" in w for w in res["warnings"]))

    def test_audit_headings_numbered_and_thematic_break(self) -> None:
        with TemporaryDirectory() as tmpdir:
            config = WikiConfig(input_dirs=[tmpdir])
            page = Path(tmpdir) / "Bad.md"
            page.write_text(
                "---\ntype: TechArticle\n---\n## 1. First step\n\n---\n\nBody.\n",
                encoding="utf-8",
            )
            warnings = audit_headings(config)
            self.assertTrue(any("Numbered heading" in w for w in warnings))
            self.assertTrue(any("Thematic break" in w for w in warnings))

    def test_audit_headings_title_case(self) -> None:
        with TemporaryDirectory() as tmpdir:
            config = WikiConfig(input_dirs=[tmpdir])
            Path(tmpdir, "Page.md").write_text(
                "---\ntype: TechArticle\n---\n## Related Standards Guide\n",
                encoding="utf-8",
            )
            warnings = audit_headings(config)
            self.assertTrue(any("title case" in w for w in warnings))

    def test_audit_markdown_flavor_gfm_rejects_wikilinks(self) -> None:
        with TemporaryDirectory() as tmpdir:
            config = WikiConfig(input_dirs=[tmpdir], markdown_flavor="gfm")
            Path(tmpdir, "A.md").write_text("---\ntype: TechArticle\n---\nSee [[B]].\n", encoding="utf-8")
            self.assertEqual(len(audit_markdown_flavor(config)), 1)

    def test_audit_markdown_flavor_obsidian_allows_wikilinks(self) -> None:
        with TemporaryDirectory() as tmpdir:
            config = WikiConfig(input_dirs=[tmpdir], markdown_flavor="obsidian")
            Path(tmpdir, "A.md").write_text("---\ntype: TechArticle\n---\nSee [[B]].\n", encoding="utf-8")
            self.assertEqual(audit_markdown_flavor(config), [])

    def test_run_checks_headings_severity(self) -> None:
        with TemporaryDirectory() as tmpdir:
            wiki_dir = Path(tmpdir) / "wiki"
            wiki_dir.mkdir()
            (wiki_dir / "x.md").write_text(
                "---\ntype: TechArticle\n---\n## 1. Bad\n",
                encoding="utf-8",
            )
            config = WikiConfig(input_dirs=[wiki_dir], check={"headings": "error"})
            res = run_checks(config)
            self.assertFalse(res["conforms"])
            self.assertTrue(any("Numbered heading" in e for e in res["errors"]))

    def test_frontmatter_defined_shapes(self) -> None:
        """Test that SHACL shapes defined in markdown frontmatter are loaded and enforced."""
        with TemporaryDirectory() as tmpdir:
            wiki_dir = Path(tmpdir) / "wiki"
            wiki_dir.mkdir()

            config = WikiConfig(input_dirs=[wiki_dir])

            # Create a shape inside markdown frontmatter
            shape_file = wiki_dir / "project-shape.md"
            shape_file.write_text("""---
id: wiki:ProjectShape
type: sh:NodeShape
sh:targetClass: schema:Project
sh:property:
  - sh:path: schema:name
    sh:minCount: 1
    sh:datatype: xsd:string
---
# Project Shape
""", encoding="utf-8")

            # Create an invalid project (missing name)
            invalid_project = wiki_dir / "invalid-project.md"
            invalid_project.write_text("""---
type: Project
---
""", encoding="utf-8")

            # Create a valid project
            valid_project = wiki_dir / "valid-project.md"
            valid_project.write_text("""---
type: Project
name: LLM Wiki CLI
---
""", encoding="utf-8")

            # Validate the invalid project
            res_invalid = check_shacl_file(invalid_project, config)
            self.assertIsNotNone(res_invalid)
            self.assertFalse(res_invalid[0])  # Should NOT conform because of missing name

            # Validate the valid project
            res_valid = check_shacl_file(valid_project, config)
            self.assertIsNotNone(res_valid)
            self.assertTrue(res_valid[0])  # Should conform


if __name__ == "__main__":
    unittest.main()
