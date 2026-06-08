"""Helpers for `wiki init`: GitHub repo parsing, URL inference, and wiki.yaml rendering."""

from __future__ import annotations

import re
import subprocess
from dataclasses import asdict, dataclass
from functools import lru_cache
from pathlib import Path
from typing import Callable

from jinja2 import Environment, PackageLoader, select_autoescape

DEFAULT_WAZOO = "https://schema.wazoo.dev/"
DEFAULT_WIKI_BASE = "https://wiki.example.org/"
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


def normalize_wiki_base(value: str) -> str:
    """Ensure wiki_base ends with a trailing slash."""
    return str(value).rstrip("/") + "/"


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
    """Return (wiki_base, base_url) for a GitHub Pages project site."""
    wiki_base = normalize_wiki_base(f"https://{owner}.github.io/{repo}")
    base_url = normalize_base_url(f"/{repo}")
    return wiki_base, base_url


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


@dataclass
class InitOptions:
    wiki_base: str
    base_url: str = DEFAULT_BASE_URL
    url_style: str = DEFAULT_URL_STYLE
    wazoo: str = DEFAULT_WAZOO
    content_predicate: str | None = None
    link_style: str | None = None
    site_title: str = "Wiki CLI"


def resolve_init_options(
    *,
    repo: str | None,
    wiki_base: str | None,
    base_url: str | None,
    url_style: str | None,
    wazoo: str | None,
    content_predicate: str | None,
    link_style: str | None,
    cwd: Path,
    init_git: bool,
    prompt_wiki_base: Callable[[str], str],
) -> InitOptions:
    """Resolve init config from CLI flags, git remote, or interactive prompt."""
    inferred_wiki_base: str | None = None
    inferred_base_url: str | None = None

    repo_slug = repo
    if repo_slug is None and (init_git or (cwd / ".git").exists()):
        repo_slug = detect_origin_repo(cwd)

    if wiki_base is None and repo_slug is not None:
        owner, repo_name = parse_github_repo(repo_slug)
        inferred_wiki_base, inferred_base_url = infer_github_pages_urls(owner, repo_name)

    resolved_wiki_base = wiki_base or inferred_wiki_base
    if resolved_wiki_base is None:
        resolved_wiki_base = prompt_wiki_base(DEFAULT_WIKI_BASE)
    resolved_wiki_base = normalize_wiki_base(resolved_wiki_base)

    resolved_base_url = base_url or inferred_base_url or DEFAULT_BASE_URL
    resolved_base_url = normalize_base_url(resolved_base_url)

    resolved_wazoo = normalize_wiki_base(wazoo or DEFAULT_WAZOO)
    resolved_url_style = url_style or DEFAULT_URL_STYLE

    return InitOptions(
        wiki_base=resolved_wiki_base,
        base_url=resolved_base_url,
        url_style=resolved_url_style,
        wazoo=resolved_wazoo,
        content_predicate=content_predicate,
        link_style=link_style,
    )


_INIT_TEMPLATE_NAME = "wiki.yaml.j2"
_MDFORMAT_TEMPLATE_NAME = "mdformat.toml.j2"
_DEFAULT_LAYOUT_TEMPLATE = "layouts/default.html.j2"
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
    rendered = _init_template_env().get_template(_INIT_TEMPLATE_NAME).render(**asdict(opts))
    return _strip_scaffold_comment(rendered)


def render_mdformat_toml() -> str:
    """Return the packaged .mdformat.toml scaffold for `wiki fmt`."""
    return _init_template_env().get_template(_MDFORMAT_TEMPLATE_NAME).render()


def render_default_layout(opts: InitOptions) -> str:
    """Render the packaged default.html.j2 page layout scaffold."""
    rendered = _init_template_env().get_template(_DEFAULT_LAYOUT_TEMPLATE).render(**asdict(opts))
    return _strip_scaffold_comment(rendered)
