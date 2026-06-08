"""Shared domain DTOs for vault paths, links, and audit issues."""

from __future__ import annotations

from pathlib import Path

from pydantic import BaseModel, ConfigDict


class PageRoute(BaseModel):
    model_config = ConfigDict(frozen=True)

    source: Path
    route: str


class OutputEntry(BaseModel):
    model_config = ConfigDict(frozen=True)

    source: Path | None
    output_path: Path
    public_url: str
    kind: str


class BrokenLink(BaseModel):
    model_config = ConfigDict(frozen=True)

    source_route: str
    source_path: Path
    link_kind: str
    raw_target: str
    issue_kind: str
    message: str
    match_start: int | None = None
    match_end: int | None = None
    full_match: str | None = None


class BrokenLinkFix(BaseModel):
    model_config = ConfigDict(frozen=True)

    issue: BrokenLink
    replacement_target: str
    description: str


class LinkOpportunity(BaseModel):
    model_config = ConfigDict(frozen=True)

    source_route: str
    source_file: str
    line: int
    column: int
    matched_text: str
    target_route: str
    target_title: str
