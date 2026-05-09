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

    def __init__(self, namespaces: dict[str, Any] | None = None) -> None:
        self.namespaces = DEFAULT_NAMESPACES.copy()
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
        wiki_dir: str | Path = "wiki",
        shapes_dir: str | Path | None = None,
        reasoning_dir: str | Path | None = None,
        raw_dir: str | Path = "raw",
        import_dirs: list[str | Path] | None = None,
        wiki_base: str = "https://wiki.example.org/",
        check: dict[str, str] | None = None,
        context: Context | None = None,
        content_predicate: str | None = None,
    ) -> None:
        self.wiki_dir = Path(wiki_dir)
        self.raw_dir = Path(raw_dir)
        
        # Support consolidated import_dirs, falling back to specific folders
        self.import_dirs: list[Path] = []
        if import_dirs:
            self.import_dirs.extend(Path(d) for d in import_dirs)
        if shapes_dir:
            self.import_dirs.append(Path(shapes_dir))
        if reasoning_dir:
            self.import_dirs.append(Path(reasoning_dir))
            
        # Ensure uniqueness and existence check handled elsewhere, 
        # but keep the variables for backward compat
        self.shapes_dir = Path(shapes_dir) if shapes_dir else Path("shapes")
        self.reasoning_dir = Path(reasoning_dir) if reasoning_dir else Path("reasoning")
        
        self.wiki_base = wiki_base
        self.check = check if check is not None else {
            "filenameStyle": "warning",
            "internalLinks": "warning",
        }
        self.context = context if context is not None else Context({"wiki": wiki_base})
        self.content_predicate = content_predicate

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

                        # Parse importDirs as a list or single string
                        import_data = data.get("import_dirs") or data.get("importDirs") or []
                        if isinstance(import_data, str):
                            import_data = [import_data]
                        elif not isinstance(import_data, list):
                            import_data = []

                        # Derive wiki_base intelligently from explicit property OR context fallback
                        context_wiki_base = None
                        if context_obj and "wiki" in context_obj.namespaces:
                            context_wiki_base = str(context_obj.namespaces["wiki"])

                        return cls(
                            wiki_dir=data.get("wiki_dir") or data.get("wikiDir") or "wiki",
                            shapes_dir=data.get("shapes_dir") or data.get("shapesDir"),
                            reasoning_dir=data.get("reasoning_dir") or data.get("reasoningDir"),
                            import_dirs=import_data,
                            raw_dir=data.get("raw_dir") or data.get("rawDir") or "raw",
                            wiki_base=data.get("wiki_base") or data.get("wikiBase") or context_wiki_base or "https://wiki.example.org/",
                            check=data.get("check"),
                            context=context_obj,
                            content_predicate=data.get("content_predicate") or data.get("contentPredicate"),
                        )
                except Exception as e:
                    logger.warning("Failed to load config file %s: %s", filename, e)

        return cls()
