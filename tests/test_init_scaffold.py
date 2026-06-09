"""Tests for wiki init scaffold helpers."""

from __future__ import annotations

import subprocess
import yaml
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import TestCase
from unittest.mock import patch

from wiki.config import WikiConfig
from wiki.fmt_util import DEFAULT_FMT_OPTS
from wiki.init_scaffold import (
    InitOptions,
    detect_origin_repo,
    infer_github_pages_urls,
    normalize_base_url,
    normalize_wiki_base,
    parse_github_repo,
    render_default_layout,
    render_wiki_yaml,
    resolve_init_options,
)


class TestParseGithubRepo(TestCase):
    def test_owner_repo_shorthand(self) -> None:
        self.assertEqual(parse_github_repo("wazootech/wiki"), ("wazootech", "wiki"))

    def test_https_url(self) -> None:
        self.assertEqual(
            parse_github_repo("https://github.com/wazootech/wiki.git"),
            ("wazootech", "wiki"),
        )

    def test_ssh_url(self) -> None:
        self.assertEqual(
            parse_github_repo("git@github.com:wazootech/wiki-cli.git"),
            ("wazootech", "wiki-cli"),
        )

    def test_invalid_raises(self) -> None:
        with self.assertRaises(ValueError):
            parse_github_repo("not-a-repo")


class TestInferGithubPagesUrls(TestCase):
    def test_project_site(self) -> None:
        wiki_base, base_url = infer_github_pages_urls("wazootech", "wiki")
        self.assertEqual(wiki_base, "https://wazootech.github.io/wiki/")
        self.assertEqual(base_url, "/wiki")

    def test_hyphenated_repo(self) -> None:
        wiki_base, base_url = infer_github_pages_urls("wazootech", "wiki-cli")
        self.assertEqual(wiki_base, "https://wazootech.github.io/wiki-cli/")
        self.assertEqual(base_url, "/wiki-cli")


class TestNormalize(TestCase):
    def test_wiki_base_trailing_slash(self) -> None:
        self.assertEqual(normalize_wiki_base("https://example.org/wiki"), "https://example.org/wiki/")

    def test_base_url_leading_slash(self) -> None:
        self.assertEqual(normalize_base_url("wiki"), "/wiki")


class TestDetectOriginRepo(TestCase):
    def test_returns_none_without_git_dir(self) -> None:
        with TemporaryDirectory() as tmpdir:
            self.assertIsNone(detect_origin_repo(Path(tmpdir)))

    @patch("wiki.init_scaffold.subprocess.run")
    def test_parses_https_remote(self, run_mock) -> None:
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            (root / ".git").mkdir()
            run_mock.return_value = subprocess.CompletedProcess(
                args=[], returncode=0, stdout="https://github.com/wazootech/wiki.git\n", stderr=""
            )
            self.assertEqual(detect_origin_repo(root), "wazootech/wiki")


class TestRenderWikiYaml(TestCase):
    def test_renders_optional_fields(self) -> None:
        rendered = render_wiki_yaml(
            InitOptions(
                wiki_base="https://wazootech.github.io/wiki/",
                base_url="/wiki",
                url_style="dir",
                content_predicate="schema:articleBody",
                link_style="markdown",
            ),
        )
        self.assertIn("wiki_base: https://wazootech.github.io/wiki/", rendered)
        self.assertIn("wazoo: https://schema.wazoo.dev/", rendered)
        self.assertIn("base_url: /wiki", rendered)
        self.assertIn("content_predicate: schema:articleBody", rendered)
        self.assertIn("style: markdown", rendered)
        self.assertIn("link:", rendered)
        self.assertIn("headings: off", rendered)
        self.assertIn("heading_levels: off", rendered)
        self.assertIn("duplicate_headings: off", rendered)
        self.assertIn("thematic_breaks: off", rendered)
        self.assertIn("missing_layout_file: error", rendered)
        self.assertIn("wrap: \"no\"", rendered)
        self.assertIn("extensions: [gfm, frontmatter, wikilink]", rendered)
        self.assertIn("# fmt: .mdformat.toml", rendered)
        self.assertNotIn("{#", rendered)
        self.assertNotIn("__", rendered)

    def test_rendered_fmt_matches_default_fmt_opts(self) -> None:
        rendered = render_wiki_yaml(InitOptions(wiki_base="https://wiki.example.org/"))
        parsed = yaml.safe_load(rendered)
        self.assertEqual(parsed["fmt"], DEFAULT_FMT_OPTS)

    def test_omits_optional_fields_when_unset(self) -> None:
        rendered = render_wiki_yaml(
            InitOptions(wiki_base="https://wiki.example.org/"),
        )
        self.assertIn("# content_predicate: schema:articleBody", rendered)
        self.assertNotIn("\ncontent_predicate:", rendered)

    def test_rendered_yaml_parses_and_loads(self) -> None:
        with TemporaryDirectory() as tmpdir:
            config_path = Path(tmpdir) / "wiki.yaml"
            config_path.write_text(
                render_wiki_yaml(InitOptions(wiki_base="https://wiki.example.org/")),
                encoding="utf-8",
            )
            parsed = yaml.safe_load(config_path.read_text(encoding="utf-8"))
            self.assertEqual(parsed["graph"]["wiki_base"], "https://wiki.example.org/")
            self.assertEqual(parsed["graph"]["context"]["wiki"], "https://wiki.example.org/")
            config = WikiConfig.load(config_path)
            self.assertEqual(config.wiki_base, "https://wiki.example.org/")

    def test_render_default_layout(self) -> None:
        rendered = render_default_layout(InitOptions(wiki_base="https://wiki.example.org/"))
        self.assertIn("{page_title}", rendered)
        self.assertIn("{site_title}", rendered)
        self.assertNotIn("{# wiki init scaffold", rendered)
        self.assertIn('<title>{page_title} - {site_title}</title>', rendered)
        self.assertIn('placeholder="Search {site_title}"', rendered)


class TestResolveInitOptions(TestCase):
    def test_repo_flag_skips_prompt(self) -> None:
        opts = resolve_init_options(
            repo="wazootech/wiki",
            wiki_base=None,
            base_url=None,
            url_style=None,
            content_predicate=None,
            link_style=None,
            cwd=Path("."),
            init_git=False,
            prompt_wiki_base=lambda _: self.fail("prompt should not run"),
        )
        self.assertEqual(opts.wiki_base, "https://wazootech.github.io/wiki/")
        self.assertEqual(opts.base_url, "/wiki")

    def test_wiki_base_overrides_repo(self) -> None:
        opts = resolve_init_options(
            repo="wazootech/wiki",
            wiki_base="https://example.org/custom/",
            base_url="/custom",
            url_style=None,
            content_predicate=None,
            link_style=None,
            cwd=Path("."),
            init_git=False,
            prompt_wiki_base=lambda _: self.fail("prompt should not run"),
        )
        self.assertEqual(opts.wiki_base, "https://example.org/custom/")
        self.assertEqual(opts.base_url, "/custom")

    @patch("wiki.init_scaffold.detect_origin_repo", return_value="wazootech/wiki")
    def test_detects_git_remote_when_git_present(self, _detect_mock) -> None:
        with TemporaryDirectory() as tmpdir:
            (Path(tmpdir) / ".git").mkdir()
            opts = resolve_init_options(
                repo=None,
                wiki_base=None,
                base_url=None,
                url_style=None,
                content_predicate=None,
                link_style=None,
                cwd=Path(tmpdir),
                init_git=False,
                prompt_wiki_base=lambda _: self.fail("prompt should not run"),
            )
        self.assertEqual(opts.wiki_base, "https://wazootech.github.io/wiki/")
