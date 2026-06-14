"""Tests for wiki init scaffold helpers."""

from __future__ import annotations

import subprocess
import yaml
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import TestCase
from unittest.mock import patch

from wiki.config import Config
from wiki.fmt_util import DEFAULT_FMT_OPTS
from wiki.schemas.wiki_config import normalize_base_iri
from wiki.init_scaffold import (
    InitOptions,
    copy_default_layout,
    copy_default_logo,
    detect_origin_repo,
    infer_github_pages_urls,
    load_packaged_default_layout,
    load_packaged_default_logo,
    normalize_base_url,
    parse_github_repo,
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
        context_wiki, base_url = infer_github_pages_urls("wazootech", "wiki")
        self.assertEqual(context_wiki, "https://wazootech.github.io/wiki/")
        self.assertEqual(base_url, "/wiki")

    def test_hyphenated_repo(self) -> None:
        context_wiki, base_url = infer_github_pages_urls("wazootech", "wiki-cli")
        self.assertEqual(context_wiki, "https://wazootech.github.io/wiki-cli/")
        self.assertEqual(base_url, "/wiki-cli")


class TestNormalize(TestCase):
    def test_base_iri_trailing_slash(self) -> None:
        self.assertEqual(normalize_base_iri("https://example.org/wiki"), "https://example.org/wiki/")

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
                graph_context_wiki="https://wazootech.github.io/wiki/",
                site_base_url="/wiki",
                site_url_style="dir",
                graph_content_predicate="schema:articleBody",
                link_style="markdown",
            ),
        )
        self.assertIn("wiki: https://wazootech.github.io/wiki/", rendered)
        self.assertNotIn("wiki_base:", rendered)
        self.assertIn("wazoo: https://schema.wazoo.dev/", rendered)
        self.assertIn("base_url: /wiki", rendered)
        self.assertIn("content_predicate: schema:articleBody", rendered)
        self.assertIn("style: markdown", rendered)
        self.assertIn("link:", rendered)
        self.assertNotIn("headings: off", rendered)
        self.assertNotIn("heading_levels: off", rendered)
        self.assertNotIn("duplicate_headings: off", rendered)
        self.assertNotIn("thematic_breaks: off", rendered)
        self.assertIn("missing_layout_file: error", rendered)
        self.assertIn("frontmatter_schema: error", rendered)
        self.assertIn("missing_schema_ref: error", rendered)
        self.assertIn('wrap: "no"', rendered)
        self.assertIn("extensions: [gfm, frontmatter, wikilink]", rendered)
        self.assertIn("assets:", rendered)
        self.assertIn("- assets", rendered)
        self.assertIn("layout: layouts/default.html.j2", rendered)
        self.assertNotIn("manifest:", rendered)
        self.assertIn("# fmt: .mdformat.toml", rendered)
        self.assertNotIn("{#", rendered)
        self.assertNotIn("__", rendered)

    def test_rendered_fmt_matches_default_fmt_opts(self) -> None:
        rendered = render_wiki_yaml(InitOptions(graph_context_wiki="https://wiki.example.org/"))
        parsed = yaml.safe_load(rendered)
        self.assertEqual(parsed["fmt"], DEFAULT_FMT_OPTS)

    def test_omits_optional_fields_when_unset(self) -> None:
        rendered = render_wiki_yaml(
            InitOptions(graph_context_wiki="https://wiki.example.org/"),
        )
        self.assertIn("# content_predicate: schema:articleBody", rendered)
        self.assertNotIn("\ncontent_predicate:", rendered)

    def test_rendered_yaml_parses_and_loads(self) -> None:
        with TemporaryDirectory() as tmpdir:
            config_path = Path(tmpdir) / "wiki.yaml"
            config_path.write_text(
                render_wiki_yaml(InitOptions(graph_context_wiki="https://wiki.example.org/")),
                encoding="utf-8",
            )
            parsed = yaml.safe_load(config_path.read_text(encoding="utf-8"))
            self.assertNotIn("wiki_base", parsed["graph"])
            self.assertEqual(parsed["graph"]["context"]["wiki"], "https://wiki.example.org/")
            config = Config.load(config_path)
            self.assertEqual(config.base_iri, "https://wiki.example.org/")

    def test_load_packaged_default_layout(self) -> None:
        rendered = load_packaged_default_layout()
        self.assertIn("{{ page.title }}", rendered)
        self.assertIn("Wiki CLI", rendered)
        self.assertNotIn("{# wiki init scaffold", rendered)
        self.assertIn("<title>{{ page.title }} - Wiki CLI</title>", rendered)
        self.assertIn('placeholder="Search Wiki CLI"', rendered)
        self.assertIn("{{ site.base_url }}/assets/logo.svg", rendered)
        self.assertNotIn("{{ site.manifest", rendered)
        self.assertNotIn("{{ site.logo_svg }}", rendered)

    def test_load_packaged_default_logo(self) -> None:
        rendered = load_packaged_default_logo()
        self.assertIn("<svg", rendered)
        self.assertIn('viewBox="0 0 200 200"', rendered)
        self.assertIn(">W</text>", rendered)

        acme = load_packaged_default_logo("Acme Docs")
        self.assertIn(">A</text>", acme)

    def test_copy_default_layout(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dest = Path(tmpdir) / "layouts" / "default.html.j2"
            copy_default_layout(dest)
            self.assertEqual(dest.read_text(encoding="utf-8"), load_packaged_default_layout())

    def test_copy_default_logo(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dest = Path(tmpdir) / "assets" / "logo.svg"
            copy_default_logo(dest, site_name="Acme Docs")
            self.assertEqual(
                dest.read_text(encoding="utf-8"),
                load_packaged_default_logo("Acme Docs"),
            )


class TestResolveInitOptions(TestCase):
    def test_repo_flag_skips_prompt(self) -> None:
        opts = resolve_init_options(
            repo="wazootech/wiki",
            graph_context_wiki=None,
            site_base_url=None,
            site_url_style=None,
            graph_content_predicate=None,
            link_style=None,
            cwd=Path("."),
            init_git=False,
            prompt_context_wiki=lambda _: self.fail("prompt should not run"),
        )
        self.assertEqual(opts.graph_context_wiki, "https://wazootech.github.io/wiki/")
        self.assertEqual(opts.site_base_url, "/wiki")

    def test_context_wiki_overrides_repo(self) -> None:
        opts = resolve_init_options(
            repo="wazootech/wiki",
            graph_context_wiki="https://example.org/custom/",
            site_base_url="/custom",
            site_url_style=None,
            graph_content_predicate=None,
            link_style=None,
            cwd=Path("."),
            init_git=False,
            prompt_context_wiki=lambda _: self.fail("prompt should not run"),
        )
        self.assertEqual(opts.graph_context_wiki, "https://example.org/custom/")
        self.assertEqual(opts.site_base_url, "/custom")

    @patch("wiki.init_scaffold.detect_origin_repo", return_value="wazootech/wiki")
    def test_detects_git_remote_when_git_present(self, _detect_mock) -> None:
        with TemporaryDirectory() as tmpdir:
            (Path(tmpdir) / ".git").mkdir()
            opts = resolve_init_options(
                repo=None,
                graph_context_wiki=None,
                site_base_url=None,
                site_url_style=None,
                graph_content_predicate=None,
                link_style=None,
                cwd=Path(tmpdir),
                init_git=False,
                prompt_context_wiki=lambda _: self.fail("prompt should not run"),
            )
        self.assertEqual(opts.graph_context_wiki, "https://wazootech.github.io/wiki/")


INIT_OPTIONS_TO_CONFIG_PATH = {
    "graph_context_wiki": ("graph", "context", "wiki"),
    "site_base_url": ("site", "base_url"),
    "site_url_style": ("site", "url_style"),
    "graph_content_predicate": ("graph", "content_predicate"),
    "link_style": ("link", "style"),
    "wiki_inputs": ("wiki", "inputs"),
    "graph_base_iri": ("graph", "base_iri"),
    "graph_implicit_types": ("graph", "implicit_types"),
    "graph_implicit_types_policy": ("graph", "implicit_types_policy"),
    "graph_include_file_extension": ("graph", "include_file_extension"),
}

# Init-only flags: affect scaffold assets, not wiki.yaml fields.
INIT_ONLY_OPTIONS = frozenset({"site_name", "site_theme_color"})


class TestInitLockstep(TestCase):
    def test_init_options_fields_match_cli_options(self) -> None:
        """Ensure every field in InitOptions has a matching --kebab-case Click CLI option."""
        from wiki.cli import init as init_cmd
        cli_option_names = {opt.opts[0] for opt in init_cmd.params if opt.opts}
        for field in InitOptions.model_fields.keys():
            expected_opt = "--" + field.replace("_", "-")
            # We allow options with both / and without / (e.g. --graph-include-file-extension/--no-graph-include-file-extension)
            # Click splits these but let's check prefix or inclusion
            found = False
            for opt_name in cli_option_names:
                if opt_name.startswith(expected_opt):
                    found = True
                    break
            self.assertTrue(
                found,
                f"InitOptions field '{field}' is missing a matching CLI option '{expected_opt}' in click 'init' command."
            )

    def test_init_options_map_to_valid_config_paths(self) -> None:
        """Ensure every InitOptions field maps to a valid Pydantic model path on Config."""
        from typing import get_args, get_origin, Union
        from pydantic import BaseModel
        for field, path in INIT_OPTIONS_TO_CONFIG_PATH.items():
            self.assertIn(field, InitOptions.model_fields, f"Mapped field '{field}' is not in InitOptions.")
            
            current_model = Config
            for part in path:
                if hasattr(current_model, "model_fields"):
                    self.assertIn(part, current_model.model_fields, f"Path part '{part}' for field '{field}' is not a valid field in {current_model.__name__}.")
                    field_info = current_model.model_fields[part]
                    annotation = field_info.annotation
                    
                    origin = get_origin(annotation)
                    if origin is Union:
                        next_model = None
                        for arg in get_args(annotation):
                            if isinstance(arg, type) and issubclass(arg, BaseModel):
                                next_model = arg
                                break
                        current_model = next_model
                    elif isinstance(annotation, type) and issubclass(annotation, BaseModel):
                        current_model = annotation
                    else:
                        current_model = None
                else:
                    break
        
        for field in InitOptions.model_fields:
            if field in INIT_ONLY_OPTIONS:
                continue
            self.assertIn(field, INIT_OPTIONS_TO_CONFIG_PATH, f"InitOptions field '{field}' is not mapped in INIT_OPTIONS_TO_CONFIG_PATH.")
