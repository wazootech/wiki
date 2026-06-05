"""Central WikiConfig and Context managing CLI settings, paths, check rules, and namespace bindings."""

from __future__ import annotations

import json
import fnmatch
import logging
from pathlib import Path
from typing import Any
import yaml
from rdflib import Namespace, RDF, RDFS, OWL
from rdflib.namespace import XSD

logger = logging.getLogger(__name__)

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

DEFAULT_CHECK_RULES = {
    "filenamePattern": "warning",
    "brokenLinks": "warning",
    "headings": "off",
}


def normalize_check_rules(check: dict[str, str] | None) -> dict[str, str]:
    """Merge user check severities with defaults."""
    merged = {**DEFAULT_CHECK_RULES}
    if check:
        merged.update(check)
    return merged


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
    """Manages the overall wiki configuration, including paths, check rules, and Context."""

    def __init__(
        self,
        input_dirs: list[str | Path] | None = None,
        asset_dirs: list[str | Path] | None = None,
        wiki_base: str = "https://wiki.example.org/",
        check: dict[str, str] | None = None,
        context: Context | None = None,
        content_predicate: str | None = None,
        uri_ext: bool = False,
        filename_pattern: str | None = None,
        base_url: str = DEFAULT_BASE_URL,
        url_style: str = DEFAULT_URL_STYLE,
        exclude: list[str] | None = None,
        config_root: str | Path | None = None,
        html_template: Path | None = None,
        serve_api_enabled: bool = True,
        serve_api_path: str = "/api/sparql",
    ) -> None:
        self.config_root = Path(config_root) if config_root is not None else Path.cwd()
        self.input_dirs = [Path(d) for d in (input_dirs or ["wiki"])]
        self.asset_dirs = [Path(d) for d in (asset_dirs or [])]

        self.wiki_base = wiki_base
        self.check = normalize_check_rules(check)
        self.context = context if context is not None else Context({"wiki": wiki_base}, wiki_base=wiki_base)
        self.context.wiki_base = wiki_base
        self.content_predicate = content_predicate
        self.uri_ext = uri_ext
        self.filename_pattern = filename_pattern
        self.base_url = base_url.rstrip("/") if base_url else ""
        self.url_style = normalize_url_style(url_style)
        self.exclude = [str(p).replace("\\", "/") for p in (exclude or [])]
        self.html_template = html_template
        self.serve_api_enabled = bool(serve_api_enabled)
        self.serve_api_path = normalize_api_path(serve_api_path)

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

                        # Parse inputDirs as a list or single string
                        input_data = _as_list(data.get("input_dirs") or data.get("inputDirs") or ["wiki"])

                        asset_data = data.get("asset_dirs") if data.get("asset_dirs") is not None else data.get("assetDirs")
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

                        uri_ext = data.get("uri_ext") if data.get("uri_ext") is not None else data.get("uriExt", False)
                        if not isinstance(uri_ext, bool):
                            uri_ext = False

                        # Parse html_template as optional path to document shell
                        html_template_raw = data.get("html_template")
                        html_template_path: Path | None = None
                        if isinstance(html_template_raw, str) and html_template_raw.strip():
                            p = Path(html_template_raw.strip())
                            html_template_path = (p if p.is_absolute() else base_dir / p).resolve()

                        serve_api_data = data.get("serveApi") if isinstance(data.get("serveApi"), dict) else {}
                        serve_api_enabled = serve_api_data.get("enabled", True)
                        if not isinstance(serve_api_enabled, bool):
                            serve_api_enabled = True
                        serve_api_path = serve_api_data.get("path", "/api/sparql")

                        return cls(
                            input_dirs=[resolve(d) for d in input_data],
                            asset_dirs=[resolve(d) for d in asset_data],
                            wiki_base=data.get("wiki_base") or data.get("wikiBase") or context_wiki_base or "https://wiki.example.org/",
                            check=data.get("check"),
                            context=context_obj,
                            content_predicate=data.get("content_predicate") or data.get("contentPredicate"),
                            uri_ext=uri_ext,
                            filename_pattern=data.get("filename_pattern") or data.get("filenamePattern"),
                            base_url=data.get("base_url") if data.get("base_url") is not None else data.get("baseUrl", DEFAULT_BASE_URL),
                            url_style=data.get("url_style") or data.get("urlStyle") or DEFAULT_URL_STYLE,
                            exclude=[str(p) for p in exclude_data],
                            config_root=base_dir,
                            html_template=html_template_path,
                            serve_api_enabled=serve_api_enabled,
                            serve_api_path=serve_api_path,
                        )
                except Exception as e:
                    logger.warning("Failed to load config file %s: %s", config_path.name, e)

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
        raise ValueError(f"Invalid urlStyle: {value}")
    return normalized


def normalize_api_path(value: str | None) -> str:
    raw = str(value or "/api/sparql").strip()
    if not raw.startswith("/"):
        raise ValueError(f"Invalid serveApi.path: {value}")
    normalized = raw.rstrip("/")
    return normalized or "/"

