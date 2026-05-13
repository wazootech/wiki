"""Custom Click Choice type with format name aliases (MIME types, file extensions) and "did you mean" suggestions."""

from __future__ import annotations

import re
from difflib import get_close_matches
from typing import Any, Optional

import click


class FormatChoice(click.Choice):
    """A Click Choice that accepts format aliases and suggests close matches.

    In addition to the canonical short names (e.g. ``"turtle"``, ``"json"``),
    each recognised alias — MIME type (``"text/turtle"``), file extension
    (``"ttl"``), or alternative name (``"ntriples"``) — is transparently
    resolved to its canonical short name.

    On invalid input, ``difflib.get_close_matches`` is used to suggest alternatives.
    """

    #: Mapping from alias → canonical short name.  Shared across all instances.
    #: Includes MIME types, file extensions, and common alternative names.
    FORMAT_ALIASES: dict[str, str] = {
        # SPARQL result media types
        "application/sparql-results+json": "json",
        "application/json": "json",
        "text/csv": "csv",
        "text/tab-separated-values": "tsv",
        "application/sparql-results+xml": "xml",
        # Graph serialisation media types
        "text/turtle": "turtle",
        "application/x-turtle": "turtle",
        "text/n3": "n3",
        "application/n-triples": "nt",
        "application/ld+json": "json-ld",
        "application/rdf+xml": "xml",
        "application/n-quads": "nquads",
        "application/trig": "trig",
        # Common file extensions
        "ttl": "turtle",
        "tt": "turtle",
        "ntriples": "nt",
        "n-triples": "nt",
        "nq": "nquads",
        "n-quads": "nquads",
        "rdf": "xml",
        "jsonld": "json-ld",
        "md": "markdown",
    }

    def __init__(
        self,
        choices: list[str],
        case_sensitive: bool = True,
        cutoff: float = 0.6,
    ) -> None:
        super().__init__(choices, case_sensitive=case_sensitive)
        self.cutoff = cutoff

    # ------------------------------------------------------------------
    # Resolve MIME types before the normal Choice machinery runs
    # ------------------------------------------------------------------

    def normalize_choice(self, choice: Any, ctx: Optional[click.Context]) -> str:
        raw = str(choice)

        # Alias lookup — case-insensitive when case_sensitive=False
        alias_map = self.FORMAT_ALIASES
        if not self.case_sensitive:
            alias_map = {k.casefold(): v for k, v in self.FORMAT_ALIASES.items()}
            lookup_key = raw.casefold()
        else:
            lookup_key = raw

        canonical = alias_map.get(lookup_key)
        if canonical is not None:
            choice = canonical

        return super().normalize_choice(choice, ctx)

    # ------------------------------------------------------------------
    # "Did you mean … ?"  when an invalid value is entered
    # ------------------------------------------------------------------

    def get_invalid_choice_message(self, value: Any, ctx: Optional[click.Context]) -> str:
        base = super().get_invalid_choice_message(value, ctx)

        valid = list(dict.fromkeys(str(c) for c in self.choices))
        valid.extend(self.FORMAT_ALIASES)

        suggestions = get_close_matches(str(value), valid, n=3, cutoff=self.cutoff)
        if suggestions:
            pretty = ", ".join(repr(s) for s in suggestions)
            base += f"  Did you mean {pretty}?"
        return base
