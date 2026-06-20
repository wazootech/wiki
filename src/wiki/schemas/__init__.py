"""Pydantic schema models for wiki config, CLI options, and domain types."""

from .cli import COMMAND_MODELS, EXPORT_FORMATS, QUERY_FORMATS
from .domain import BrokenLink, BrokenLinkFix, LinkOpportunity, OutputEntry, PageRoute
from .init import InitOptions
from .layout import (
    LAYOUT_MARKUP_PATHS,
    LAYOUT_RAW_JSON_PATHS,
    LayoutContext,
    PageLayoutContext,
    SiteLayoutContext,
)
from .metadata import METADATA_VIEWS, MetadataView
from .reports import (
    AuditReport,
    BuildOptions,
    BuildResult,
    ExportResult,
    FmtReport,
    Issue,
    LinkReport,
    RenderReport,
    ScaffoldResult,
)
from .rules import CheckConfig, LintConfig, Severity, coerce_severity
from .site import TocItem, VirtualPage, WikiSite
from .wiki_config import (
    Config,
    FmtConfig,
    GraphConfig,
    LinkConfig,
    SiteConfig,
    SparqlServiceConfig,
    WikiConfig,
)

__all__ = [
    "AuditReport",
    "COMMAND_MODELS",
    "EXPORT_FORMATS",
    "QUERY_FORMATS",
    "BuildOptions",
    "BuildResult",
    "ExportResult",
    "FmtReport",
    "Issue",
    "LinkReport",
    "RenderReport",
    "ScaffoldResult",
    "BrokenLink",
    "BrokenLinkFix",
    "CheckConfig",
    "FmtConfig",
    "GraphConfig",
    "InitOptions",
    "LAYOUT_MARKUP_PATHS",
    "LAYOUT_RAW_JSON_PATHS",
    "LayoutContext",
    "LinkConfig",
    "LinkOpportunity",
    "LintConfig",
    "PageLayoutContext",
    "METADATA_VIEWS",
    "MetadataView",
    "OutputEntry",
    "PageRoute",
    "Severity",
    "SiteConfig",
    "SiteLayoutContext",
    "SparqlServiceConfig",
    "TocItem",
    "WikiConfig",
    "VirtualPage",
    "Config",
    "WikiSite",
    "coerce_severity",
]
