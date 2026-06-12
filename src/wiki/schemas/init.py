"""Init scaffold option models."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, field_validator

_LINK_STYLES = frozenset({"wikilink", "markdown"})
_VALID_URL_STYLES = frozenset({"dir", "file"})


class InitOptions(BaseModel):
    model_config = ConfigDict(extra="ignore")

    graph_context_wiki: str
    site_base_url: str = "/wiki"
    site_url_style: str = "dir"
    graph_content_predicate: str | None = None
    link_style: str | None = None
    site_manifest_name: str = "Wiki CLI"
    vault_inputs: list[str] | None = None
    graph_base_iri: str | None = None
    site_manifest_theme_color: str | None = None
    graph_implicit_types: list[str] | None = None
    graph_implicit_types_policy: str | None = None
    graph_include_file_extension: bool | None = None

    @field_validator("site_url_style", mode="before")
    @classmethod
    def _validate_url_style(cls, value: object) -> str:
        normalized = str(value or "dir").strip().lower()
        if normalized not in _VALID_URL_STYLES:
            raise ValueError(f"Invalid site_url_style: {value}")
        return normalized

    @field_validator("link_style", mode="before")
    @classmethod
    def _validate_link_style(cls, value: object) -> str | None:
        if value is None:
            return None
        if not isinstance(value, str):
            raise ValueError(f"expected wikilink or markdown, got {value!r}")
        normalized = value.strip().lower()
        if normalized not in _LINK_STYLES:
            raise ValueError(f"expected wikilink or markdown, got {value!r}")
        return normalized
