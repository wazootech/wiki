"""Pydantic schema models for wiki config and domain types."""

from .domain import BrokenLink, BrokenLinkFix, LinkOpportunity, OutputEntry, PageRoute
from .init import InitOptions
from .metadata import METADATA_VIEWS, MetadataView
from .rules import CheckRules, LintRules, Severity, coerce_severity
from .site import InfoboxRow, TocItem, VirtualPage, WikiSite
from .wiki_config import (
    GraphBlock,
    LinkBlock,
    SiteBlock,
    SparqlServiceBlock,
    VaultBlock,
    WikiConfig,
)

__all__ = [
    "BrokenLink",
    "BrokenLinkFix",
    "CheckRules",
    "GraphBlock",
    "InfoboxRow",
    "InitOptions",
    "LinkBlock",
    "LinkOpportunity",
    "LintRules",
    "METADATA_VIEWS",
    "MetadataView",
    "OutputEntry",
    "PageRoute",
    "Severity",
    "SiteBlock",
    "SparqlServiceBlock",
    "TocItem",
    "VaultBlock",
    "VirtualPage",
    "WikiConfig",
    "WikiSite",
    "coerce_severity",
]
