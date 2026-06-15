"""Pydantic schema models for wiki config and domain types."""

from .domain import BrokenLink, BrokenLinkFix, LinkOpportunity, OutputEntry, PageRoute
from .init import DEFAULT_INIT_LAYOUT, InitOptions
from .metadata import METADATA_VIEWS, MetadataView
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
    "BrokenLink",
    "BrokenLinkFix",
    "CheckConfig",
    "FmtConfig",
    "GraphConfig",
    "InfoboxRow",
    "InitOptions",
    "LinkConfig",
    "LinkOpportunity",
    "LintConfig",
    "METADATA_VIEWS",
    "MetadataView",
    "OutputEntry",
    "PageRoute",
    "Severity",
    "SiteConfig",
    "SparqlServiceConfig",
    "TocItem",
    "WikiConfig",
    "VirtualPage",
    "Config",
    "DEFAULT_INIT_LAYOUT",
    "WikiSite",
    "coerce_severity",
]
