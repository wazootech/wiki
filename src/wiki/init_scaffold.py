"""Helpers for `wiki init`: GitHub repo parsing, URL inference, and wiki.yaml rendering."""

from __future__ import annotations

import re
import subprocess
from functools import lru_cache
from importlib.resources import files
from pathlib import Path
from typing import Callable

from jinja2 import Environment, PackageLoader, select_autoescape

from .schemas import InitOptions
from .schemas.wiki_config import DEFAULT_WIKI_BASE, normalize_base_iri

__all__ = [
    "DOCS_WIKI_INIT_OPTIONS",
    "InitOptions",
    "copy_default_layout",
    "copy_default_logo",
    "load_packaged_default_layout",
    "load_packaged_default_logo",
    "render_wiki_yaml",
    "resolve_init_options",
]

DEFAULT_BASE_URL = "/wiki"
DEFAULT_URL_STYLE = "dir"

_GITHUB_HTTPS_RE = re.compile(
    r"(?:https?://)?(?:www\.)?github\.com/(?P<owner>[^/]+)/(?P<repo>[^/]+?)(?:\.git)?/?$",
    re.IGNORECASE,
)
_GITHUB_SSH_RE = re.compile(
    r"git@github\.com:(?P<owner>[^/]+)/(?P<repo>[^/]+?)(?:\.git)?$",
    re.IGNORECASE,
)
_OWNER_REPO_RE = re.compile(r"^(?P<owner>[^/]+)/(?P<repo>[^/]+?)(?:\.git)?/?$")


def normalize_base_url(value: str) -> str:
    """Ensure base_url starts with / and has no trailing slash (except root)."""
    text = str(value).strip()
    if not text.startswith("/"):
        text = "/" + text
    if text != "/" and text.endswith("/"):
        text = text.rstrip("/")
    return text


def parse_github_repo(value: str) -> tuple[str, str]:
    """Parse owner/repo from shorthand, HTTPS, or SSH GitHub URLs."""
    text = value.strip()
    for pattern in (_GITHUB_HTTPS_RE, _GITHUB_SSH_RE, _OWNER_REPO_RE):
        match = pattern.match(text)
        if match:
            owner = match.group("owner")
            repo = match.group("repo")
            if repo.endswith(".git"):
                repo = repo[:-4]
            return owner, repo
    raise ValueError(
        f"Invalid GitHub repo: {value!r} (expected owner/repo, "
        "https://github.com/owner/repo, or git@github.com:owner/repo.git)"
    )


def infer_github_pages_urls(owner: str, repo: str) -> tuple[str, str]:
    """Return (context.wiki IRI, base_url) for a GitHub Pages project site."""
    context_wiki = normalize_base_iri(f"https://{owner}.github.io/{repo}")
    base_url = normalize_base_url(f"/{repo}")
    return context_wiki, base_url


def detect_origin_repo(cwd: Path) -> str | None:
    """Return owner/repo parsed from git remote origin, or None."""
    if not (cwd / ".git").exists():
        return None
    try:
        result = subprocess.run(
            ["git", "remote", "get-url", "origin"],
            cwd=cwd,
            check=True,
            capture_output=True,
            text=True,
        )
    except (subprocess.CalledProcessError, FileNotFoundError):
        return None
    remote_url = result.stdout.strip()
    if not remote_url:
        return None
    try:
        owner, repo = parse_github_repo(remote_url)
    except ValueError:
        return None
    return f"{owner}/{repo}"


# Init options for this repository's docs/ wiki (parity with docs/wiki.yaml).
DOCS_WIKI_INIT_OPTIONS = InitOptions(
    graph_context_wiki="https://wazootech.github.io/wiki/",
    site_base_url="/wiki",
    site_url_style=DEFAULT_URL_STYLE,
    graph_content_predicate="schema:articleBody",
    link_style="markdown",
)


def resolve_init_options(
    *,
    repo: str | None,
    graph_context_wiki: str | None,
    site_base_url: str | None,
    site_url_style: str | None,
    graph_content_predicate: str | None,
    link_style: str | None,
    cwd: Path,
    init_git: bool,
    prompt_context_wiki: Callable[[str], str],
    site_manifest_name: str = "Wiki CLI",
    wiki_inputs: list[str] | None = None,
    graph_base_iri: str | None = None,
    site_manifest_theme_color: str | None = None,
    graph_implicit_types: list[str] | None = None,
    graph_implicit_types_policy: str | None = None,
    graph_include_file_extension: bool | None = None,
) -> InitOptions:
    """Resolve init config from CLI flags, git remote, or interactive prompt."""
    inferred_context_wiki: str | None = None
    inferred_base_url: str | None = None

    repo_slug = repo
    if repo_slug is None and (init_git or (cwd / ".git").exists()):
        repo_slug = detect_origin_repo(cwd)

    if graph_context_wiki is None and repo_slug is not None:
        owner, repo_name = parse_github_repo(repo_slug)
        inferred_context_wiki, inferred_base_url = infer_github_pages_urls(owner, repo_name)

    resolved_context_wiki = graph_context_wiki or inferred_context_wiki
    if resolved_context_wiki is None:
        resolved_context_wiki = prompt_context_wiki(DEFAULT_WIKI_BASE)
    resolved_context_wiki = normalize_base_iri(resolved_context_wiki)

    resolved_base_url = site_base_url or inferred_base_url or DEFAULT_BASE_URL
    resolved_base_url = normalize_base_url(resolved_base_url)

    resolved_url_style = site_url_style or DEFAULT_URL_STYLE

    return InitOptions(
        graph_context_wiki=resolved_context_wiki,
        site_base_url=resolved_base_url,
        site_url_style=resolved_url_style,
        graph_content_predicate=graph_content_predicate,
        link_style=link_style,
        site_manifest_name=site_manifest_name,
        wiki_inputs=wiki_inputs,
        graph_base_iri=graph_base_iri,
        site_manifest_theme_color=site_manifest_theme_color,
        graph_implicit_types=graph_implicit_types,
        graph_implicit_types_policy=graph_implicit_types_policy,
        graph_include_file_extension=graph_include_file_extension,
    )


_INIT_TEMPLATE_NAME = "wiki.yaml.j2"
_DEFAULT_LAYOUT_TEMPLATE = "layout_default.html.j2"
_DEFAULT_LOGO_TEMPLATE = "assets/logo.svg"
_JINJA_COMMENT_PREFIX = "{# wiki init scaffold"


@lru_cache(maxsize=1)
def _init_template_env() -> Environment:
    return Environment(
        loader=PackageLoader("wiki", "templates"),
        autoescape=select_autoescape(default=False),
        keep_trailing_newline=True,
        trim_blocks=True,
        lstrip_blocks=True,
    )


def _strip_scaffold_comment(text: str) -> str:
    lines = text.splitlines(keepends=True)
    if lines and lines[0].startswith(_JINJA_COMMENT_PREFIX):
        return "".join(lines[1:])
    return text


def render_wiki_yaml(opts: InitOptions) -> str:
    """Render the packaged wiki.yaml.j2 scaffold into wiki.yaml content."""
    rendered = _init_template_env().get_template(_INIT_TEMPLATE_NAME).render(**opts.model_dump())
    return _strip_scaffold_comment(rendered)


def load_packaged_default_layout() -> str:
    """Return the packaged default page layout template content."""
    source = files("wiki").joinpath(f"templates/{_DEFAULT_LAYOUT_TEMPLATE}").read_text(encoding="utf-8")
    return _strip_scaffold_comment(source)


def copy_default_layout(dest: Path) -> None:
    """Copy the packaged default page layout into a workspace."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(load_packaged_default_layout(), encoding="utf-8")


def load_packaged_default_logo() -> str:
    """Return the packaged default sidebar logo SVG content."""
    return files("wiki").joinpath(f"templates/{_DEFAULT_LOGO_TEMPLATE}").read_text(encoding="utf-8")


def copy_default_logo(dest: Path) -> None:
    """Copy the packaged default sidebar logo into a workspace."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(load_packaged_default_logo(), encoding="utf-8")
