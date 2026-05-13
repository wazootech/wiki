"""Central WikiConfig and Context managing CLI settings, paths, check rules, and namespace bindings."""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any
import yaml
from rdflib import Namespace, RDF, RDFS, OWL
from rdflib.namespace import XSD

logger = logging.getLogger(__name__)

# Standard static namespaces
SCHEMA = Namespace("https://schema.org/")
WIKI = Namespace("https://wiki.example.org/")
FOAF = Namespace("http://xmlns.com/foaf/0.1/")
DC = Namespace("http://purl.org/dc/elements/1.1/")
DCTERMS = Namespace("http://purl.org/dc/terms/")
SH = Namespace("http://www.w3.org/ns/shacl#")

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
        wiki_base: str = "https://wiki.example.org/",
        check: dict[str, str] | None = None,
        context: Context | None = None,
        content_predicate: str | None = None,
        uri_ext: bool = False,
    ) -> None:
        self.input_dirs = [Path(d) for d in (input_dirs or ["wiki"])]

        self.wiki_base = wiki_base
        self.check = check if check is not None else {
            "filenameStyle": "warning",
            "internalLinks": "warning",
        }
        self.context = context if context is not None else Context({"wiki": wiki_base}, wiki_base=wiki_base)
        self.context.wiki_base = wiki_base
        self.content_predicate = content_predicate
        self.uri_ext = uri_ext

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

                        # Parse inputDirs as a list or single string
                        input_data = data.get("input_dirs") or data.get("inputDirs") or ["wiki"]
                        if isinstance(input_data, str):
                            input_data = [input_data]
                        elif not isinstance(input_data, list):
                            input_data = ["wiki"]

                        # Derive absolute reference point for system paths relative to config location
                        base_dir = config_path.parent.absolute()
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

                        return cls(
                            input_dirs=[resolve(d) for d in input_data],
                            wiki_base=data.get("wiki_base") or data.get("wikiBase") or context_wiki_base or "https://wiki.example.org/",
                            check=data.get("check"),
                            context=context_obj,
                            content_predicate=data.get("content_predicate") or data.get("contentPredicate"),
                            uri_ext=uri_ext,
                        )
                except Exception as e:
                    logger.warning("Failed to load config file %s: %s", config_path.name, e)

        return cls()
