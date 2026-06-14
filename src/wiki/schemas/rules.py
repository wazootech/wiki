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
    remote_schema_refs: Literal["allow", "deny", "allowlist"] = "allow"
    remote_schema_hosts: list[str] = Field(default_factory=list)

    @field_validator("missing_layout_file", "frontmatter_schema", "missing_schema_ref", mode="before")
    @classmethod
    def _validate_severity(cls, value: object) -> Severity:
        return coerce_severity(value)

    @field_validator("remote_schema_refs", mode="before")
    @classmethod
    def _validate_remote_schema_refs(cls, value: object) -> str:
        if value is None:
            return "allow"
        if not isinstance(value, str):
            raise ValueError(f"expected allow, deny, or allowlist, got {value!r}")
        normalized = value.strip().lower()
        if normalized not in {"allow", "deny", "allowlist"}:
            raise ValueError(f"expected allow, deny, or allowlist, got {value!r}")
        return normalized

    @field_validator("remote_schema_hosts", mode="before")
    @classmethod
    def _validate_remote_schema_hosts(cls, value: object) -> list[str]:
        if value is None:
            return []
        if isinstance(value, str):
            text = value.strip()
            return [text] if text else []
        if isinstance(value, list):
            hosts: list[str] = []
            for item in value:
                if not isinstance(item, str):
                    raise ValueError("remote_schema_hosts items must be strings")
                text = item.strip()
                if not text:
                    raise ValueError("remote_schema_hosts items must be non-empty strings")
                hosts.append(text)
            return hosts
        raise ValueError(f"expected remote_schema_hosts string or list, got {value!r}")


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
