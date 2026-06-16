"""Clean, pure, idiomatic Python CLI for managing a semantic LLM wiki."""

from __future__ import annotations

from .audit import merge_results, run_check, run_lint
from .config import Config
from .errors import BuildError, UpgradeError, WikiError
from .export_ops import export_documents
from .fmt_ops import format_files
from .init_scaffold import scaffold_workspace
from .link_ops import LinkOptions, run_link
from .publish import build_workspace
from .render_ops import render_workspace
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
from .workspace import Workspace

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
    "Workspace",
    "build_workspace",
    "export_documents",
    "format_files",
    "merge_results",
    "run_check",
    "run_lint",
    "run_link",
    "render_workspace",
    "scaffold_workspace",
]
