"""Pydantic models for wiki source declarations and lockfiles."""

from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

LOCKFILE_VERSION = 2
LOCKFILE_FILENAME = "wiki.lock"


class SourceConfig(BaseModel):
    """A single external source declared in wiki.yml."""

    model_config = ConfigDict(extra="forbid")

    name: str
    type: Literal["git"]
    url: str
    ref: str | None = None
    path: str | None = None


class GraphDescriptor(BaseModel):
    """Read-only description of a graph participating in a composed wiki."""

    model_config = ConfigDict(extra="forbid")

    name: str
    uri: str
    kind: Literal["root", "source"]
    source_name: str | None = None
    source_type: Literal["git"] | None = None
    url: str | None = None
    ref: str | None = None
    resolved_ref: str | None = None
    path: str | None = None
    local_path: Path | None = None
    required_by: list[str] = Field(default_factory=list)


class LockedSource(BaseModel):
    """A pinned source entry in wiki.lock.

    ``required_by`` lists the names of sources (or ``"root"`` for top-level
    entries declared directly in the root ``wiki.yml``) that depend on this
    source. An empty list means the source is a top-level root entry.
    """

    url: str
    resolved_ref: str = ""
    ref: str | None = None
    path: str | None = None
    fetched_at: str = ""
    required_by: list[str] = Field(default_factory=list)


class Lockfile(BaseModel):
    """Machine-authored lockfile recording pinned source state."""

    model_config = ConfigDict(extra="forbid")

    version: int = LOCKFILE_VERSION
    sources: dict[str, LockedSource] = Field(default_factory=dict)

    @classmethod
    def load(cls, path: Path) -> Lockfile:
        import json

        if not path.exists():
            return cls()
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            return cls.model_validate(data)
        except Exception:
            return cls()

    def save(self, path: Path) -> None:
        import json

        path.write_text(
            json.dumps(
                self.model_dump(mode="json"),
                indent=2,
                ensure_ascii=False,
            ),
            encoding="utf-8",
        )

    @staticmethod
    def timestamp() -> str:
        return datetime.now(UTC).isoformat()
