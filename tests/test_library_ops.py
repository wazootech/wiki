"""Smoke tests for library-first operation entry points."""

from __future__ import annotations

import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from wiki import (
    BuildOptions,
    Workspace,
    build_workspace,
    export_documents,
    format_files,
    render_workspace,
)


class TestLibraryOps(unittest.TestCase):
    def _scaffold(self) -> tuple[Path, Path, Workspace]:
        tmpdir = TemporaryDirectory()
        self.addCleanup(tmpdir.cleanup)
        root = Path(tmpdir.name)
        wiki = root / "wiki"
        wiki.mkdir()
        (root / "wiki.yaml").write_text("wiki:\n  inputs: [wiki]\n", encoding="utf-8")
        page = wiki / "Page.md"
        page.write_text(
            "---\ntype: schema:WebPage\nname: Page\n---\n\n# Page\n\nContent.\n",
            encoding="utf-8",
        )
        return root, page, Workspace.load(root)

    def test_build_workspace_writes_site(self) -> None:
        root, _, workspace = self._scaffold()
        output_dir = root / "_site"
        result = build_workspace(
            workspace,
            BuildOptions(output_dir=output_dir, skip_preflight=True),
        )
        self.assertTrue(result.ok, result.error_message)
        self.assertGreater(result.page_count, 0)
        self.assertTrue((output_dir / "wiki" / "Page" / "index.html").exists())

    def test_format_files_check_only(self) -> None:
        _, _, workspace = self._scaffold()
        report = format_files(workspace, None, check_only=True)
        self.assertTrue(report.ok)
        self.assertEqual(report.formatted_count, 0)

    def test_export_documents_turtle(self) -> None:
        _, page, workspace = self._scaffold()
        result = export_documents(
            workspace,
            [page],
            rdf_format="turtle",
            mode="expanded",
        )
        self.assertTrue(result.ok, result.error_message)
        self.assertTrue(result.output.strip())

    def test_render_workspace_check_only(self) -> None:
        _, _, workspace = self._scaffold()
        report = render_workspace(workspace, None, check_only=True)
        self.assertTrue(report.ok)
        self.assertEqual(report.updated_count, 0)
