"""Domain exceptions raised by library operations."""

from __future__ import annotations


class WikiError(Exception):
    """Base exception for wiki library operations."""


class BuildError(WikiError):
    """Raised when static site build cannot proceed safely."""


class UpgradeError(WikiError):
    """Raised when self-upgrade cannot run."""
