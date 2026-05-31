import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from wiki.config import WikiConfig
from wiki.paths import (
    build_page_manifest,
    detect_output_collisions,
    OutputEntry,
    page_output_path,
    page_routes,
    page_url,
    route_for_markdown_file,
    validate_filename_pattern,
    validate_route_safety,
)
from wiki.audit import audit_internal_links, audit_markdown_flavor


class TestWikiPaths(unittest.TestCase):
    def test_route_preserves_case_folders_and_copy_suffix(self) -> None:
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            wiki = root / "wiki"
            games = wiki / "games"
            games.mkdir(parents=True)
            page = games / "Pokemon_Diamond_(copy_1).md"
            page.write_text("# Pokemon", encoding="utf-8")
            config = WikiConfig(input_dirs=[wiki], config_root=root)

            self.assertEqual(route_for_markdown_file(config, page), "games/Pokemon_Diamond_(copy_1)")

    def test_index_md_maps_to_containing_folder(self) -> None:
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            wiki = root / "wiki"
            games = wiki / "games"
            games.mkdir(parents=True)
            root_index = wiki / "index.md"
            folder_index = games / "index.md"
            root_index.write_text("# Home", encoding="utf-8")
            folder_index.write_text("# Games", encoding="utf-8")
            config = WikiConfig(input_dirs=[wiki], config_root=root)

            self.assertEqual(route_for_markdown_file(config, root_index), "")
            self.assertEqual(route_for_markdown_file(config, folder_index), "games")

    def test_dir_url_style_uses_trailing_slash(self) -> None:
        self.assertEqual(page_url("/wiki", "Ethan_Davidson", "dir"), "/wiki/Ethan_Davidson/")
        self.assertEqual(page_url("/wiki", "", "dir"), "/wiki/")
        self.assertEqual(page_url("/wiki", "Ethan_Davidson", "file"), "/wiki/Ethan_Davidson.html")

    def test_output_paths_for_dir_and_file_styles(self) -> None:
        owned = Path("_site") / "wiki"
        self.assertEqual(page_output_path(owned, "games/Pokemon", "dir"), owned / "games" / "Pokemon" / "index.html")
        self.assertEqual(page_output_path(owned, "games/Pokemon", "file"), owned / "games" / "Pokemon.html")
        self.assertEqual(page_output_path(owned, "", "dir"), owned / "index.html")

    def test_route_safety_rejects_spaces_and_url_special_chars(self) -> None:
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            wiki = root / "wiki"
            wiki.mkdir()
            (wiki / "Bad Page.md").write_text("# Bad", encoding="utf-8")
            (wiki / "Bad#Page.md").write_text("# Bad", encoding="utf-8")
            config = WikiConfig(input_dirs=[wiki], config_root=root)

            issues = validate_route_safety(config)
            self.assertEqual(len(issues), 2)
            self.assertTrue(any("spaces are not allowed" in issue for issue in issues))
            self.assertTrue(any("characters '#'" in issue for issue in issues))

    def test_filename_pattern_is_full_match(self) -> None:
        with TemporaryDirectory() as tmpdir:
            page = Path(tmpdir) / "Bad Name.md"
            page.write_text("# Bad", encoding="utf-8")
            config = WikiConfig(filename_pattern="[A-Za-z0-9_()-]+")

            self.assertEqual(validate_filename_pattern(config, page), "Filename 'Bad Name.md' does not match filenamePattern.")

    def test_excluded_markdown_files_do_not_create_routes(self) -> None:
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            wiki = root / "wiki"
            drafts = wiki / "drafts"
            drafts.mkdir(parents=True)
            (wiki / "Published.md").write_text("# Published", encoding="utf-8")
            (drafts / "Draft.md").write_text("# Draft", encoding="utf-8")
            config = WikiConfig(input_dirs=[wiki], exclude=["wiki/drafts/**"], config_root=root)

            self.assertEqual([route.route for route in page_routes(config)], ["Published"])

    def test_duplicate_routes_collide(self) -> None:
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            wiki = root / "wiki"
            about = wiki / "About"
            about.mkdir(parents=True)
            (wiki / "About.md").write_text("# About", encoding="utf-8")
            (about / "index.md").write_text("# About", encoding="utf-8")
            config = WikiConfig(input_dirs=[wiki], config_root=root)

            entries = build_page_manifest(config, root / "_site" / "wiki", "/wiki", "dir")
            issues = detect_output_collisions(entries)
            self.assertGreaterEqual(len(issues), 1)
            self.assertTrue(any("About" in issue for issue in issues))

    def test_case_only_output_paths_collide(self) -> None:
        entries = [
            OutputEntry(Path("Page.md"), Path("_site/wiki/Page/index.html"), "/wiki/Page/", "page"),
            OutputEntry(Path("page.md"), Path("_site/wiki/page/index.html"), "/wiki/page/", "page"),
        ]

        issues = detect_output_collisions(entries)
        self.assertGreaterEqual(len(issues), 1)
        self.assertTrue(any("Page.md" in issue and "page.md" in issue for issue in issues))

    def test_internal_links_resolve_current_file_relative_fragments(self) -> None:
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            wiki = root / "wiki"
            people = wiki / "people"
            games = wiki / "games"
            people.mkdir(parents=True)
            games.mkdir()
            (people / "Ethan_Davidson.md").write_text("# Ethan\n\nSee [[../games/Pokemon_Diamond#Release History]].", encoding="utf-8")
            (games / "Pokemon_Diamond.md").write_text("# Pokemon\n\n## Release History", encoding="utf-8")
            config = WikiConfig(input_dirs=[wiki], config_root=root)

            self.assertEqual(audit_internal_links(config), [])

    def test_internal_links_report_missing_heading_fragment(self) -> None:
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            wiki = root / "wiki"
            wiki.mkdir()
            (wiki / "A.md").write_text("# A\n\nSee [[B#Missing]].", encoding="utf-8")
            (wiki / "B.md").write_text("# B\n\n## Present", encoding="utf-8")
            config = WikiConfig(input_dirs=[wiki], config_root=root)

            issues = audit_internal_links(config)
            self.assertEqual(len(issues), 1)
            self.assertIn("missing heading '#missing'", issues[0])

    def test_gfm_reports_wikilink_markdown_flavor_warning(self) -> None:
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            wiki = root / "wiki"
            wiki.mkdir()
            (wiki / "A.md").write_text("# A\n\nSee [[B]].", encoding="utf-8")
            config = WikiConfig(input_dirs=[wiki], markdown_flavor="gfm", config_root=root)

            issues = audit_markdown_flavor(config)
            self.assertEqual(len(issues), 1)
            self.assertIn("Wikilink syntax is not enabled", issues[0])


if __name__ == "__main__":
    unittest.main()
