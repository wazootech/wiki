"""Helpers for `wiki init`: GitHub repo parsing, URL inference, and wiki.yml rendering."""

from __future__ import annotations

import re
import subprocess
from collections.abc import Callable
from functools import lru_cache
from importlib.resources import files
from pathlib import Path

from jinja2 import Environment, PackageLoader, select_autoescape

from .schemas import DEFAULT_INIT_LAYOUT, InitOptions, ScaffoldResult
from .schemas.wiki_config import DEFAULT_WIKI_BASE, normalize_base_iri

__all__ = [
    "DEFAULT_INIT_LAYOUT",
    "DOCS_WIKI_INIT_OPTIONS",
    "InitOptions",
    "copy_default_logo",
    "copy_official_init_layout",
    "copy_packaged_assets",
    "load_packaged_official_layout",
    "scaffold_logo_svg",
    "render_wiki_yaml",
    "resolve_init_options",
    "scaffold_workspace",
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


# Init options for this repository's docs/ wiki (parity with docs/wiki.yml).
DOCS_WIKI_INIT_OPTIONS = InitOptions(
    graph_context_wiki="https://wazootech.github.io/wiki/",
    site_base_url="/wiki",
    site_url_style=DEFAULT_URL_STYLE,
    graph_content_predicate="schema:articleBody",
    link_style="standard",
    site_layout="wikipedia",
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
    wiki_inputs: list[str] | None = None,
    graph_base_iri: str | None = None,
    graph_implicit_types: list[str] | None = None,
    graph_implicit_types_policy: str | None = None,
    graph_include_file_extension: bool | None = None,
    site_layout: str | None = None,
    prompt_site_layout: Callable[[], str] | None = None,
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
    used_context_prompt = False
    if resolved_context_wiki is None:
        resolved_context_wiki = prompt_context_wiki(DEFAULT_WIKI_BASE)
        used_context_prompt = True
    resolved_context_wiki = normalize_base_iri(resolved_context_wiki)

    resolved_base_url = site_base_url or inferred_base_url or DEFAULT_BASE_URL
    resolved_base_url = normalize_base_url(resolved_base_url)

    resolved_url_style = site_url_style or DEFAULT_URL_STYLE

    resolved_site_layout = site_layout
    if (
        resolved_site_layout is None
        and used_context_prompt
        and prompt_site_layout is not None
    ):
        resolved_site_layout = prompt_site_layout()
    elif resolved_site_layout is None:
        resolved_site_layout = DEFAULT_INIT_LAYOUT

    return InitOptions(
        graph_context_wiki=resolved_context_wiki,
        site_base_url=resolved_base_url,
        site_url_style=resolved_url_style,
        graph_content_predicate=graph_content_predicate,
        link_style=link_style,
        wiki_inputs=wiki_inputs,
        graph_base_iri=graph_base_iri,
        graph_implicit_types=graph_implicit_types,
        graph_implicit_types_policy=graph_implicit_types_policy,
        graph_include_file_extension=graph_include_file_extension,
        site_layout=resolved_site_layout,
    )


_INIT_TEMPLATE_NAME = "wiki.yml"
_OFFICIAL_LAYOUTS_DIR = "layouts"
_OFFICIAL_LAYOUT_FILES = {
    "wikipedia": "wikipedia.html",
    "minimal": "index.html",
}
_PACKAGED_ASSETS_DIR = "assets"
_PACKAGED_ASSET_FILES = ("wikipedia.css",)
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
    """Render the packaged wiki.yml scaffold into wiki.yml content."""
    rendered = _init_template_env().get_template(_INIT_TEMPLATE_NAME).render(**opts.model_dump())
    return _strip_scaffold_comment(rendered)


def load_packaged_official_layout(layout: str) -> str:
    """Return a packaged official init layout (wikipedia or minimal/index)."""
    filename = _OFFICIAL_LAYOUT_FILES.get(layout)
    if filename is None:
        raise ValueError(f"Unknown official layout: {layout!r}")
    return files("wiki").joinpath(f"{_OFFICIAL_LAYOUTS_DIR}/{filename}").read_text(
        encoding="utf-8"
    )


def copy_official_init_layout(dest: Path, layout: str) -> None:
    """Copy an official init layout into a workspace (wikipedia shell; minimal is packaged)."""
    if layout == "minimal":
        return
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(load_packaged_official_layout(layout), encoding="utf-8")


def copy_packaged_assets(dest_dir: Path) -> None:
    """Copy bundled wiki assets (for example wikipedia.css) into a workspace assets/ directory."""
    dest_dir.mkdir(parents=True, exist_ok=True)
    for filename in _PACKAGED_ASSET_FILES:
        text = files("wiki").joinpath(f"{_PACKAGED_ASSETS_DIR}/{filename}").read_text(encoding="utf-8")
        (dest_dir / filename).write_text(text, encoding="utf-8")


def scaffold_logo_svg() -> str:
    """Return the default sidebar logo SVG for init scaffolding with tweak comments."""
    from .site.layout_context import build_logo_svg

    svg = build_logo_svg("W")
    svg = svg.replace(
        '<linearGradient id="globeGrad"',
        "<!-- wiki tweak: primary theme — edit globeGrad stops; adjust gridGrad accent to match -->\n"
        '    <linearGradient id="globeGrad"',
        1,
    )
    svg = svg.replace(
        "<text ",
        "<!-- wiki tweak: logo letter (one character) -->\n  <text ",
        1,
    )
    return svg


def copy_default_logo(dest: Path) -> None:
    """Write the default sidebar logo into a workspace."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(scaffold_logo_svg(), encoding="utf-8")


_README_TEMPLATE = (
    "# My Wiki\n\n"
    "A semantic markdown knowledge base powered by the Wiki CLI.\n\n"
    "## Workspace Layout\n\n"
    "- `wiki.yml` — Workspace configuration, namespace prefixes, and `fmt` defaults.\n"
    "- `assets/logo.svg` — Sidebar logo (served via `wiki.assets`).\n"
    "- `wiki/` — Contains markdown files with semantic frontmatter.\n"
    "  - `Person_Shape.md` — SHACL shape for Person documents.\n"
    "  - `Ethan_Davidson.md` — An example Person document.\n\n"
    "## Commands\n\n"
    "- **Check** (integrity: SHACL, JSON Schema, route safety, layout frontmatter):\n"
    "  ```bash\n"
    "  wiki check\n"
    "  ```\n"
    "- **Lint** (conventions: broken links, filename pattern, heading style):\n"
    "  ```bash\n"
    "  wiki lint\n"
    "  ```\n"
    "- **Preview** (starts a local dev server with auto-reload):\n"
    "  ```bash\n"
    "  wiki serve --watch\n"
    "  ```\n"
    "- **Build** (compiles to static HTML site):\n"
    "  ```bash\n"
    "  wiki build\n"
    "  ```\n"
)

_PERSON_SHAPE_TEMPLATE = (
    "---\n"
    "id: wiki:PersonShape\n"
    "type: sh:NodeShape\n"
    "sh:targetClass: schema:Person\n"
    "sh:property:\n"
    "  - sh:path: schema:givenName\n"
    "    sh:datatype: xsd:string\n"
    "    sh:minCount: 1\n"
    "  - sh:path: schema:familyName\n"
    "    sh:datatype: xsd:string\n"
    "    sh:minCount: 1\n"
    "---\n\n"
    "# Person shape\n\n"
    "Defines validation rules for Person profiles in this wiki.\n"
)

_EXAMPLE_PERSON_TEMPLATE = (
    "<!-- wiki tweak: replace with your first page -->\n"
    "---\n"
    "type: schema:Person\n"
    "givenName: Ethan\n"
    "familyName: Davidson\n"
    "---\n\n"
    "# Ethan Davidson\n\n"
    "Welcome to my personal wiki page! This page serves as a starting point and conforming example of a Person profile.\n"
)


def scaffold_workspace(
    cwd: Path,
    init_options: InitOptions,
    *,
    init_git: bool = False,
) -> ScaffoldResult:
    """Write wiki.yml, starter pages, assets, and optional layout files."""
    import shutil

    written: list[Path] = []
    config_path = cwd / "wiki.yml"
    readme_path = cwd / "README.md"
    wiki_dir = cwd / "wiki"

    wiki_dir.mkdir(parents=True, exist_ok=True)
    readme_path.write_text(_README_TEMPLATE, encoding="utf-8")
    written.extend([readme_path, wiki_dir])

    person_shape = wiki_dir / "Person_Shape.md"
    person_shape.write_text(_PERSON_SHAPE_TEMPLATE, encoding="utf-8")
    example_person = wiki_dir / "Ethan_Davidson.md"
    example_person.write_text(_EXAMPLE_PERSON_TEMPLATE, encoding="utf-8")
    written.extend([person_shape, example_person])

    config_content = render_wiki_yaml(init_options)
    config_path.write_text(config_content, encoding="utf-8")
    written.append(config_path)

    layouts_dir = cwd / "layouts"
    layouts_dir.mkdir(parents=True, exist_ok=True)
    if init_options.site_layout == "wikipedia":
        wiki_layout_path = layouts_dir / "wikipedia.html"
        if not wiki_layout_path.exists():
            copy_official_init_layout(wiki_layout_path, "wikipedia")
            written.append(wiki_layout_path)

    assets_dir = cwd / "assets"
    css_path = assets_dir / "wikipedia.css"
    if init_options.site_layout == "wikipedia" and not css_path.exists():
        copy_packaged_assets(assets_dir)
        written.append(css_path)

    logo_path = cwd / "assets" / "logo.svg"
    if not logo_path.exists():
        copy_default_logo(logo_path)
        written.append(logo_path)

    if init_git:
        if shutil.which("git") is None:
            return ScaffoldResult(
                ok=False,
                error_message="git was requested with --git, but no git executable was found on PATH.",
            )
        try:
            subprocess.run(["git", "init"], cwd=cwd, check=True, capture_output=True, text=True)
        except subprocess.CalledProcessError as exc:
            stderr = exc.stderr.strip() if exc.stderr else "unknown git init error"
            return ScaffoldResult(ok=False, error_message=f"git init failed: {stderr}")

    layout_note = (
        "layouts/wikipedia.html and assets/wikipedia.css"
        if init_options.site_layout == "wikipedia"
        else "packaged minimal layout (site.layout unset)"
    )
    message = (
        f"Initialized wiki.yml, README.md, wiki/ starter files, assets/logo.svg, and {layout_note}."
    )
    if init_git:
        message += " Ran git init."

    return ScaffoldResult(
        ok=True,
        config_path=config_path,
        written_paths=written,
        message=message,
    )
