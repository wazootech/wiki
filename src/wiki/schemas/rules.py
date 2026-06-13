"""Check and lint config models."""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

Severity = Literal["error", "warning", "off"]


def coerce_severity(value: object) -> Severity:
    if value is False or value == "false":
        return "off"
    if value is True or value == "true":
        return "error"
    if value in ("error", "warning", "off"):
        return value  # type: ignore[return-value]
    raise ValueError(f"expected error, warning, or off, got {value!r}")


class CheckConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")

    missing_layout_file: Annotated[Severity, Field(default="error")] = "error"
    frontmatter_schema: Annotated[Severity, Field(default="error")] = "error"
    missing_schema_ref: Annotated[Severity, Field(default="error")] = "error"

    @field_validator("missing_layout_file", "frontmatter_schema", "missing_schema_ref", mode="before")
    @classmethod
    def _validate_severity(cls, value: object) -> Severity:
        return coerce_severity(value)


class LintConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")

    broken_links: Annotated[Severity, Field(default="warning")] = "warning"
    filename_pattern: Annotated[Severity, Field(default="warning")] = "warning"
    headings: Annotated[Severity, Field(default="off")] = "off"
    heading_levels: Annotated[Severity, Field(default="off")] = "off"
    duplicate_headings: Annotated[Severity, Field(default="off")] = "off"
    thematic_breaks: Annotated[Severity, Field(default="off")] = "off"
    link_style: Annotated[Severity, Field(default="warning")] = "warning"

    @field_validator(
        "broken_links",
        "filename_pattern",
        "headings",
        "heading_levels",
        "duplicate_headings",
        "thematic_breaks",
        "link_style",
        mode="before",
    )
    @classmethod
    def _validate_severity(cls, value: object) -> Severity:
        return coerce_severity(value)
