"""Central WikiConfig and Context managing CLI settings, paths, check rules, and namespace bindings."""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any, Optional
import yaml
from rdflib import Namespace, RDF, RDFS, OWL
from rdflib.namespace import XSD

logger = logging.getLogger(__name__)

# Standard static namespaces
SCHEMA = Namespace("https://schema.org/")
WIKI = Namespace("https://book.etok.me/wiki/")
FOAF = Namespace("http://xmlns.com/foaf/0.1/")
DC = Namespace("http://purl.org/dc/elements/1.1/")
DCTERMS = Namespace("http://purl.org/dc/terms/")

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
}


class Context:
    """Manages JSON-LD prefix and namespace bindings."""

    def __init__(self, namespaces: dict[str, Any] | None = None) -> None:
        self.namespaces = {}
        source = namespaces if namespaces is not None else DEFAULT_NAMESPACES
        for prefix, uri in source.items():
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
        wiki_dir: str | Path = "wiki",
        shapes_dir: str | Path = "shapes",
        reasoning_dir: str | Path = "reasoning",
        raw_dir: str | Path = "raw",
        wiki_base: str = "https://book.etok.me/wiki/",
        check: dict[str, str] | None = None,
        context: Context | None = None,
    ) -> None:
        self.wiki_dir = Path(wiki_dir)
        self.shapes_dir = Path(shapes_dir)
        self.reasoning_dir = Path(reasoning_dir)
        self.raw_dir = Path(raw_dir)
        self.wiki_base = wiki_base
        self.check = check if check is not None else {
            "filenameStyle": "warning",
            "internalLinks": "warning",
        }
        self.context = context if context is not None else Context()

    @property
    def namespaces(self) -> dict[str, Any]:
        """Expose namespaces for backward compatibility."""
        return self.context.namespaces

    def bind_namespaces(self, graph: Any) -> None:
        """Delegate namespace binding to Context for backward compatibility."""
        self.context.bind_namespaces(graph)

    @classmethod
    def load(cls, base_dir: Path = Path(".")) -> WikiConfig:
        """Load WikiConfig from wiki.yaml, wiki.yml, or wiki.json if present in base_dir."""
        config_files = ["wiki.yaml", "wiki.yml", "wiki.json"]
        for filename in config_files:
            config_path = base_dir / filename
            if config_path.exists():
                try:
                    content = config_path.read_text(encoding="utf-8")
                    if filename.endswith(".json"):
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

                        return cls(
                            wiki_dir=data.get("wiki_dir") or data.get("wikiDir") or "wiki",
                            shapes_dir=data.get("shapes_dir") or data.get("shapesDir") or "shapes",
                            reasoning_dir=data.get("reasoning_dir") or data.get("reasoningDir") or "reasoning",
                            raw_dir=data.get("raw_dir") or data.get("rawDir") or "raw",
                            wiki_base=data.get("wiki_base") or data.get("wikiBase") or "https://book.etok.me/wiki/",
                            check=data.get("check"),
                            context=context_obj,
                        )
                except Exception as e:
                    logger.warning("Failed to load config file %s: %s", filename, e)

        return cls()
