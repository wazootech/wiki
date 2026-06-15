"""Tests for Workspace session API."""

import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from wiki.config import Config
from wiki.schemas import AuditReport, Issue
from wiki.workspace import Workspace


class TestWorkspace(unittest.TestCase):
    def test_load_and_check_whole_wiki(self) -> None:
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            wiki = root / "wiki"
            wiki.mkdir()
            (wiki / "Page.md").write_text("# Page\n\nContent.", encoding="utf-8")
            (root / "wiki.yaml").write_text("wiki:\n  inputs: [wiki]\n", encoding="utf-8")

            workspace = Workspace.load(root)
            with patch("wiki.workspace.run_check", return_value=AuditReport.empty()) as mock_check:
                report = workspace.check()
            self.assertTrue(report.ok)
            mock_check.assert_called_once()

    def test_file_scoped_check_passes_file_paths(self) -> None:
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            wiki = root / "wiki"
            wiki.mkdir()
            page = wiki / "Page.md"
            page.write_text("---\ntype: schema:WebPage\n---\n", encoding="utf-8")
            (root / "wiki.yaml").write_text("wiki:\n  inputs: [wiki]\n", encoding="utf-8")

            workspace = Workspace.load(root)
            with patch("wiki.workspace.run_check", return_value=AuditReport.empty()) as mock_check:
                workspace.check([page])
            _, kwargs = mock_check.call_args
            self.assertIsNotNone(kwargs.get("file_paths"))

    def test_with_runtime_overrides_site(self) -> None:
        config = Config(wiki={"inputs": [Path("/tmp/wiki")]}, site={"base_url": "/wiki"})
        workspace = Workspace(config)
        runtime = workspace.with_runtime(base_url="/custom", url_style="file")
        self.assertEqual(runtime.config.site.base_url, "/custom")
        self.assertEqual(runtime.config.site.url_style, "file")
        self.assertEqual(workspace.config.site.base_url, "/wiki")

    def test_preflight_merges_lint_and_check(self) -> None:
        config = Config(wiki={"inputs": [Path("/tmp/wiki")]})
        workspace = Workspace(config)
        lint_report = AuditReport(
            warnings=[Issue(code="headings", message="warn", severity="warning")],
        )
        check_report = AuditReport(
            errors=[Issue(code="shacl_violation", message="fail", severity="error")],
            ok=False,
        )
        with patch("wiki.workspace.run_lint", return_value=lint_report), patch(
            "wiki.workspace.run_check",
            return_value=check_report,
        ):
            report = workspace.preflight()
        self.assertFalse(report.ok)
        self.assertEqual(len(report.errors), 1)
        self.assertEqual(len(report.warnings), 1)
