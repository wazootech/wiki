"""Pydantic schema models for wiki config and domain types."""

from .domain import BrokenLink, BrokenLinkFix, LinkOpportunity, OutputEntry, PageRoute
from .init import InitOptions
from .layout import (
    LAYOUT_MARKUP_PATHS,
    LAYOUT_RAW_JSON_PATHS,
    LayoutContext,
    PageLayoutContext,
    PageLayoutPart,
    PageMetadataContext,
    PageNavContext,
    SiteLayoutContext,
    WikiLayoutContext,
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
from .site import InfoboxRow, TocItem, VirtualPage, WikiSite
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
    "InfoboxRow",
    "InitOptions",
    "LAYOUT_MARKUP_PATHS",
    "LAYOUT_RAW_JSON_PATHS",
    "LayoutContext",
    "LinkConfig",
    "LinkOpportunity",
    "LintConfig",
    "PageLayoutContext",
    "PageLayoutPart",
    "PageMetadataContext",
    "PageNavContext",
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
    "WikiLayoutContext",
    "VirtualPage",
    "Config",
    "WikiSite",
    "coerce_severity",
]
