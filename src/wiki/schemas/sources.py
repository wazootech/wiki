"""Pydantic models for wiki source declarations and lockfiles."""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

LOCKFILE_VERSION = 1
LOCKFILE_FILENAME = "wiki.lock"


class SourceConfig(BaseModel):
    """A single external source declared in wiki.yml."""

    model_config = ConfigDict(extra="forbid")

    name: str
    type: Literal["git"]
    url: str
    ref: str | None = None
    path: str | None = None
    description: str | None = None


class LockedSource(BaseModel):
    """A pinned source entry in wiki.lock."""

    url: str
    resolved_ref: str = ""
    ref: str | None = None
    path: str | None = None
    content_hash: str | None = None
    fetched_at: str = ""


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

    def timestamp(self) -> str:
        return datetime.now(timezone.utc).isoformat()
