"""Init scaffold option models."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, field_validator

_LINK_STYLES = frozenset({"wikilink", "markdown"})
_VALID_URL_STYLES = frozenset({"dir", "file"})


class InitOptions(BaseModel):
    model_config = ConfigDict(extra="ignore")

    wiki_iri: str
    base_url: str = "/wiki"
    url_style: str = "dir"
    content_predicate: str | None = None
    link_style: str | None = None
    site_title: str = "Wiki CLI"

    @field_validator("url_style", mode="before")
    @classmethod
    def _validate_url_style(cls, value: object) -> str:
        normalized = str(value or "dir").strip().lower()
        if normalized not in _VALID_URL_STYLES:
            raise ValueError(f"Invalid url_style: {value}")
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
