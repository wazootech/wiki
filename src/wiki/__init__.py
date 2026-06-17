"""Clean, pure, idiomatic Python CLI for managing a semantic LLM wiki."""

from __future__ import annotations

from .config import Config
from .errors import BuildError, UpgradeError, WikiError
from .link_ops import LinkOptions
from .schemas import (
    AuditReport,
    BuildOptions,
    BuildResult,
    ExportResult,
    FmtReport,
    InitOptions,
    Issue,
    LinkReport,
    RenderReport,
    ScaffoldResult,
)
from .workspace import Wiki

__version__ = "0.1.15"

__all__ = [
    "__version__",
    "AuditReport",
    "BuildError",
    "BuildOptions",
    "BuildResult",
    "Config",
    "ExportResult",
    "FmtReport",
    "InitOptions",
    "Issue",
    "LinkOptions",
    "LinkReport",
    "RenderReport",
    "ScaffoldResult",
    "UpgradeError",
    "WikiError",
    "Wiki",
]
