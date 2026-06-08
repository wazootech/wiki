"""Central WikiConfig and Context managing CLI settings, paths, check rules, and namespace bindings."""

from __future__ import annotations

import json
import fnmatch
import logging
from pathlib import Path
from typing import Any
import yaml
from mdformat._conf import InvalidConfError, _validate_keys, _validate_values
from rdflib import Namespace, RDF, RDFS, OWL
from rdflib.namespace import XSD

logger = logging.getLogger(__name__)

_LINK_STYLES = frozenset({"wikilink", "markdown"})
DEFAULT_LINK_STYLE = "markdown"


def _normalize_link_style(value: str | None) -> str:
    if value is None:
        return DEFAULT_LINK_STYLE
    if not isinstance(value, str):
        raise ValueError(f"Invalid link_style: {value!r} (expected wikilink or markdown)")
    normalized = value.strip().lower()
    if normalized not in _LINK_STYLES:
        raise ValueError(f"Invalid link_style: {value!r} (expected wikilink or markdown)")
    return normalized

DEFAULT_BASE_URL = "/wiki"
DEFAULT_URL_STYLE = "dir"
VALID_URL_STYLES = {"dir", "file"}

# Standard static namespaces
SCHEMA = Namespace("https://schema.org/")
WIKI = Namespace("https://wiki.example.org/")
FOAF = Namespace("http://xmlns.com/foaf/0.1/")
DC = Namespace("http://purl.org/dc/elements/1.1/")
DCTERMS = Namespace("http://purl.org/dc/terms/")
SH = Namespace("http://www.w3.org/ns/shacl#")
WAZOO = Namespace("https://wazootech.github.io/wiki-cli/vocab/")

DEFAULT_FILENAME_PATTERN = r"[A-Za-z0-9_()-]+\.md"

DEFAULT_CHECK_RULES = {
    "forbidden_layout_keys": "error",
    "missing_layout_file": "error",
}

DEFAULT_LINT_RULES = {
    "broken_links": "warning",
    "filename_pattern": "warning",
    "headings": "off",
    "heading_levels": "off",
    "duplicate_headings": "off",
    "thematic_breaks": "off",
    "link_style": "warning",
}

ALLOWED_SEVERITIES = {"error", "warning", "off"}

ALLOWED_CONFIG_KEYS = {
    "input_dirs",
    "asset_dirs",
    "wiki_base",
    "check",
    "lint",
    "context",
    "@context",
    "content_predicate",
    "uri_ext",
    "filename_pattern",
    "base_url",
    "url_style",
    "exclude",
    "page_layout",
    "sparql_service",
    "link_renames",
    "link_style",
    "fmt",
}

ALLOWED_CHECK_KEYS = {
    "forbidden_layout_keys",
    "missing_layout_file",
}
ALLOWED_LINT_KEYS = {
    "broken_links",
    "filename_pattern",
    "headings",
    "heading_levels",
    "duplicate_headings",
    "thematic_breaks",
    "link_style",
}
ALLOWED_SPARQL_SERVICE_KEYS = {"enabled", "path"}


def _looks_like_regex(value: str) -> bool:
    return any(ch in value for ch in "[]()\\")


def _normalize_severity_rules(
    rules: dict[str, str] | None,
    defaults: dict[str, str],
    block_name: str,
    allowed_keys: set[str],
) -> dict[str, str]:
    """Merge user severities with defaults and validate values."""
    merged = {**defaults}
    if not rules:
        return merged
    unknown = sorted(k for k in rules if k not in allowed_keys)
    if unknown:
        raise ValueError(f"Invalid {block_name} keys: {', '.join(unknown)}")
    for key, value in rules.items():
        if value is False or value == "false":
            value = "off"
        elif value is True or value == "true":
            value = "error"
        if value not in ALLOWED_SEVERITIES:
            if block_name == "check" and key == "filename_pattern" and _looks_like_regex(str(value)):
                raise ValueError(
                    "check.filename_pattern must be error, warning, or off; "
                    "put the regex in top-level filename_pattern"
                )
            raise ValueError(
                f"Invalid {block_name}.{key} severity: {value!r} (expected error, warning, or off)"
            )
        merged[key] = value
    return merged


def normalize_check_rules(check: dict[str, str] | None) -> dict[str, str]:
    """Merge user check (integrity) severities with defaults."""
    return _normalize_severity_rules(check, DEFAULT_CHECK_RULES, "check", ALLOWED_CHECK_KEYS)


def normalize_lint_rules(lint: dict[str, str] | None) -> dict[str, str]:
    """Merge user lint (convention) severities with defaults."""
    return _normalize_severity_rules(lint, DEFAULT_LINT_RULES, "lint", ALLOWED_LINT_KEYS)


def _unknown_keys(data: dict[str, Any], allowed: set[str]) -> list[str]:
    return sorted(k for k in data if k not in allowed)


def _parse_fmt(
    fmt_data: Any, config_name: str, base_dir: Path
) -> dict[str, Any] | Path | None:
    if fmt_data is None:
        return None
    if isinstance(fmt_data, dict):
        conf_label = Path(f"{config_name} fmt")
        try:
            _validate_keys(fmt_data, conf_label)
            _validate_values(fmt_data, conf_label)
        except InvalidConfError as exc:
            raise ValueError(f"Invalid config file {config_name}: {exc}") from exc
        return fmt_data
    if isinstance(fmt_data, str):
        text = fmt_data.strip()
        if not text:
            raise ValueError(f"Invalid config file {config_name}: fmt path must not be empty")
        path_obj = Path(text)
        if path_obj.is_absolute():
            raise ValueError(
                f"Invalid config file {config_name}: fmt path must be relative to the config file"
            )
        return base_dir / path_obj
    raise ValueError(
        f"Invalid config file {config_name}: fmt must be a mapping or path string"
    )


def _validate_config_keys(data: dict[str, Any], config_name: str) -> None:
    if "html_template" in data:
        raise ValueError(
            f"Invalid config file {config_name}: html_template was renamed to page_layout"
        )
    if "wiki_page_layout" in data:
        raise ValueError(
            f"Invalid config file {config_name}: wiki_page_layout was renamed to page_layout"
        )
    if "serve_api" in data:
        raise ValueError(
            f"Invalid config file {config_name}: serve_api was renamed to sparql_service"
        )
    unknown_top_level = _unknown_keys(data, ALLOWED_CONFIG_KEYS)
    if unknown_top_level:
        raise ValueError(f"Invalid config file {config_name}: unknown top-level keys: {', '.join(unknown_top_level)}")

    check_data = data.get("check")
    if check_data is not None:
        if not isinstance(check_data, dict):
            raise ValueError(f"Invalid config file {config_name}: check must be a mapping")
        unknown_check = _unknown_keys(check_data, ALLOWED_CHECK_KEYS)
        if unknown_check:
            raise ValueError(f"Invalid config file {config_name}: unknown check keys: {', '.join(unknown_check)}")

    lint_data = data.get("lint")
    if lint_data is not None:
        if not isinstance(lint_data, dict):
            raise ValueError(f"Invalid config file {config_name}: lint must be a mapping")
        unknown_lint = _unknown_keys(lint_data, ALLOWED_LINT_KEYS)
        if unknown_lint:
            raise ValueError(f"Invalid config file {config_name}: unknown lint keys: {', '.join(unknown_lint)}")

    sparql_service_data = data.get("sparql_service")
    if sparql_service_data is not None:
        if not isinstance(sparql_service_data, dict):
            raise ValueError(f"Invalid config file {config_name}: sparql_service must be a mapping")
        unknown_sparql_service = _unknown_keys(sparql_service_data, ALLOWED_SPARQL_SERVICE_KEYS)
        if unknown_sparql_service:
            raise ValueError(
                f"Invalid config file {config_name}: unknown sparql_service keys: {', '.join(unknown_sparql_service)}"
            )


DEFAULT_NAMESPACES = {
    "schema": SCHEMA,
    "wiki": WIKI,
    "foaf": FOAF,
    "rdf": RDF,
    "rdfs": RDFS,
    "xsd": XSD,
    "owl": OWL,
    "dc": DC,
    "dcterms": DCTERMS,
    "sh": SH,
    "wazoo": WAZOO,
}


class Context:
    """Manages JSON-LD prefix and namespace bindings."""

    def __init__(self, namespaces: dict[str, Any] | None = None, wiki_base: str = "https://wiki.example.org/") -> None:
        self.namespaces = DEFAULT_NAMESPACES.copy()
        self.wiki_base = wiki_base
        if namespaces is not None:
            for prefix, uri in namespaces.items():
                if isinstance(uri, str):
                    self.namespaces[prefix] = Namespace(uri)
                else:
                    self.namespaces[prefix] = uri

    def bind_namespaces(self, graph: Any) -> None:
        """Bind all managed namespaces to an RDFLib Graph instance."""
        for prefix, namespace in self.namespaces.items():
            graph.bind(prefix, namespace)


class WikiConfig:
    """Manages wiki configuration: paths, check/lint severities, and RDF context."""

    def __init__(
        self,
        input_dirs: list[str | Path] | None = None,
        asset_dirs: list[str | Path] | None = None,
        wiki_base: str = "https://wiki.example.org/",
        check: dict[str, str] | None = None,
        lint: dict[str, str] | None = None,
        context: Context | None = None,
        content_predicate: str | None = None,
        uri_ext: bool = False,
        filename_pattern: str | None = None,
        base_url: str = DEFAULT_BASE_URL,
        url_style: str = DEFAULT_URL_STYLE,
        exclude: list[str] | None = None,
        config_root: str | Path | None = None,
        page_layout: Path | None = None,
        sparql_service_enabled: bool = False,
        sparql_service_path: str = "/api/sparql",
        link_renames: dict[str, str] | None = None,
        link_style: str | None = None,
        fmt: dict[str, Any] | Path | None = None,
    ) -> None:
        self.config_root = Path(config_root) if config_root is not None else Path.cwd()
        self.input_dirs = [Path(d) for d in (input_dirs or ["wiki"])]
        self.asset_dirs = [Path(d) for d in (asset_dirs or [])]

        self.wiki_base = wiki_base
        self.check = normalize_check_rules(check)
        self.lint = normalize_lint_rules(lint)
        self.context = context if context is not None else Context({"wiki": wiki_base}, wiki_base=wiki_base)
        self.context.wiki_base = wiki_base
        self.content_predicate = content_predicate
        self.uri_ext = uri_ext
        self.filename_pattern = filename_pattern
        self.base_url = base_url.rstrip("/") if base_url else ""
        self.url_style = normalize_url_style(url_style)
        self.exclude = [str(p).replace("\\", "/") for p in (exclude or [])]
        self.page_layout = page_layout
        self.sparql_service_enabled = bool(sparql_service_enabled)
        self.sparql_service_path = normalize_api_path(sparql_service_path)
        self.link_renames = dict(link_renames or {})
        self.link_style = _normalize_link_style(link_style)
        self.fmt = fmt

    def relative_to_root(self, path: Path) -> str:
        """Return a config-root-relative POSIX path for glob matching."""
        try:
            rel = path.resolve().relative_to(self.config_root.resolve())
        except ValueError:
            rel = path
        return rel.as_posix().strip("/")

    def is_excluded(self, path: Path) -> bool:
        rel = self.relative_to_root(path)
        return any(fnmatch.fnmatchcase(rel, pattern) for pattern in self.exclude)

    @property
    def namespaces(self) -> dict[str, Any]:
        """Expose namespaces for backward compatibility."""
        return self.context.namespaces

    def bind_namespaces(self, graph: Any) -> None:
        """Delegate namespace binding to Context for backward compatibility."""
        self.context.bind_namespaces(graph)

    @classmethod
    def load(cls, path: Path = Path(".")) -> WikiConfig:
        """Load WikiConfig from an explicit file path or search standard names in a directory."""
        if path.is_file():
            potential_paths = [path]
        else:
            potential_paths = [path / f for f in ["wiki.yaml", "wiki.yml", "wiki.json"]]

        for config_path in potential_paths:
            if config_path.exists():
                try:
                    content = config_path.read_text(encoding="utf-8")
                    if config_path.suffix == ".json":
                        data = json.loads(content)
                    else:
                        data = yaml.safe_load(content)

                    if isinstance(data, dict):
                        _validate_config_keys(data, config_path.name)

                        # Extract context mapping (support both "@context" and "context")
                        context_data = data.get("@context") or data.get("context")
                        context_obj = None
                        if isinstance(context_data, dict):
                            prefixes = {}
                            for k, v in context_data.items():
                                if not k.startswith("@") and isinstance(v, str):
                                    prefixes[k] = v
                            context_obj = Context(prefixes)

                        # Derive absolute reference point for system paths relative to config location
                        base_dir = config_path.parent.absolute()

                        # Parse input_dirs as a list or single string
                        input_data = _as_list(data.get("input_dirs") or ["wiki"])

                        asset_data = data.get("asset_dirs")
                        if asset_data is None:
                            asset_data = ["assets"] if (base_dir / "assets").is_dir() else []
                        asset_data = _as_list(asset_data)

                        exclude_data = _as_list(data.get("exclude") or [])

                        def resolve(p: Any) -> Any:
                            if not p:
                                return p
                            path_obj = Path(p)
                            return path_obj if path_obj.is_absolute() else base_dir / path_obj

                        # Derive wiki_base intelligently from explicit property OR context fallback
                        context_wiki_base = None
                        if context_obj and "wiki" in context_obj.namespaces:
                            context_wiki_base = str(context_obj.namespaces["wiki"])

                        uri_ext = data.get("uri_ext", False)
                        if not isinstance(uri_ext, bool):
                            uri_ext = False

                        # Parse page_layout as optional path to the site default layout file
                        layout_raw = data.get("page_layout")
                        page_layout_path: Path | None = None
                        if isinstance(layout_raw, str) and layout_raw.strip():
                            p = Path(layout_raw.strip())
                            page_layout_path = (p if p.is_absolute() else base_dir / p).resolve()

                        sparql_service_data = (
                            data.get("sparql_service") if isinstance(data.get("sparql_service"), dict) else {}
                        )
                        sparql_service_enabled = sparql_service_data.get("enabled", False)
                        if not isinstance(sparql_service_enabled, bool):
                            sparql_service_enabled = True
                        sparql_service_path = sparql_service_data.get("path", "/api/sparql")

                        link_renames_raw = data.get("link_renames")
                        link_renames: dict[str, str] = {}
                        if isinstance(link_renames_raw, dict):
                            link_renames = {
                                str(key): str(value)
                                for key, value in link_renames_raw.items()
                                if isinstance(key, str) and isinstance(value, str)
                            }

                        return cls(
                            input_dirs=[resolve(d) for d in input_data],
                            asset_dirs=[resolve(d) for d in asset_data],
                            wiki_base=data.get("wiki_base") or context_wiki_base or "https://wiki.example.org/",
                            check=data.get("check"),
                            lint=data.get("lint"),
                            context=context_obj,
                            content_predicate=data.get("content_predicate"),
                            uri_ext=uri_ext,
                            filename_pattern=data.get("filename_pattern"),
                            base_url=data.get("base_url", DEFAULT_BASE_URL),
                            url_style=data.get("url_style") or DEFAULT_URL_STYLE,
                            exclude=[str(p) for p in exclude_data],
                            config_root=base_dir,
                            page_layout=page_layout_path,
                            sparql_service_enabled=sparql_service_enabled,
                            sparql_service_path=sparql_service_path,
                            link_renames=link_renames,
                            link_style=data.get("link_style"),
                            fmt=_parse_fmt(data.get("fmt"), config_path.name, base_dir),
                        )
                    raise ValueError(f"Invalid config file {config_path.name}: top-level content must be a mapping")
                except Exception as e:
                    raise ValueError(f"Failed to load config file {config_path.name}: {e}") from e

        return cls()


def _as_list(value: Any) -> list[Any]:
    if isinstance(value, list):
        return value
    if isinstance(value, str):
        return [value]
    return []





def normalize_url_style(value: str | None) -> str:
    normalized = str(value or DEFAULT_URL_STYLE).strip().lower()
    if normalized not in VALID_URL_STYLES:
        raise ValueError(f"Invalid url_style: {value}")
    return normalized


def normalize_api_path(value: str | None) -> str:
    raw = str(value or "/api/sparql").strip()
    if not raw.startswith("/"):
        raise ValueError(f"Invalid sparql_service.path: {value}")
    normalized = raw.rstrip("/")
    return normalized or "/"

