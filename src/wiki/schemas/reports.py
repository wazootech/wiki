"""Typed operation result models for library-first API."""

from __future__ import annotations

from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field

from .rules import Severity

IssueSeverity = Literal["error", "warning"]


class Issue(BaseModel):
    code: str
    message: str
    path: Path | None = None
    severity: IssueSeverity = "error"


class AuditReport(BaseModel):
    ok: bool = True
    errors: list[Issue] = Field(default_factory=list)
    warnings: list[Issue] = Field(default_factory=list)

    @classmethod
    def empty(cls) -> AuditReport:
        return cls()

    def merge(self, other: AuditReport) -> AuditReport:
        return AuditReport(
            ok=self.ok and other.ok,
            errors=self.errors + other.errors,
            warnings=self.warnings + other.warnings,
        )

    def apply_strict(self) -> AuditReport:
        if not self.warnings:
            return self
        return AuditReport(
            ok=False,
            errors=self.errors + self.warnings,
            warnings=[],
        )

    def messages(self) -> tuple[list[str], list[str]]:
        return [issue.message for issue in self.errors], [issue.message for issue in self.warnings]


class LinkReport(BaseModel):
    ok: bool = True
    opportunities: int = 0
    fixes: int = 0
    changed_paths: list[Path] = Field(default_factory=list)
    remaining_broken: int = 0
    lines: list[str] = Field(default_factory=list)


class RenderReport(BaseModel):
    ok: bool = True
    updated_count: int = 0
    error_count: int = 0
    stale_files: list[str] = Field(default_factory=list)
    render_errors: list[str] = Field(default_factory=list)


class BuildOptions(BaseModel):
    output_dir: Path
    render_first: bool = False
    reload_graph: bool = False
    disk_cache: bool = False
    skip_preflight: bool = False
    verbose: bool = False


class BuildResult(BaseModel):
    ok: bool = True
    page_count: int = 0
    asset_count: int = 0
    written_paths: list[Path] = Field(default_factory=list)
    preflight: AuditReport | None = None
    error_message: str | None = None


class ExportResult(BaseModel):
    ok: bool = True
    output: str = ""
    error_message: str | None = None


class FmtReport(BaseModel):
    ok: bool = True
    stale_files: list[Path] = Field(default_factory=list)
    formatted_count: int = 0
    error_message: str | None = None
    verbose_lines: list[str] = Field(default_factory=list)


class ScaffoldResult(BaseModel):
    ok: bool = True
    config_path: Path | None = None
    written_paths: list[Path] = Field(default_factory=list)
    message: str = ""
    error_message: str | None = None


def severity_for_rule(rules: object, rule_key: str) -> Severity:
    return getattr(rules, rule_key, "warning")  # type: ignore[no-any-return]
