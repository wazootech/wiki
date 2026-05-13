"""Lightweight key-path extractor for JSON query results (zero dependencies).

Supports dot-separated keys, array wildcards (``[]``), and numeric index access (``[0]``).

Examples::

    resolve_path({"a": {"b": [{"c": 1}, {"c": 2}]}}, "a.b[].c")
    # -> [1, 2]
"""

from __future__ import annotations

import re
from typing import Any


_TOKEN_RE = re.compile(r"(\w+)|\[(\d+)\]|\[\]")


def _tokenize(path: str) -> list[str]:
    """Tokenize a dot-separated path into steps.

    >>> _tokenize("a.b[].c[0]")
    ["a", "b", "[]", "c", "[0]"]
    """
    parts = path.split(".")
    tokens: list[str] = []
    for part in parts:
        pos = 0
        while pos < len(part):
            m = _TOKEN_RE.match(part, pos)
            if m is None:
                raise ValueError(f"Invalid path token at position {pos} in '{part}'")
            if m.group(1):
                tokens.append(m.group(1))
            elif m.group(2):
                tokens.append(f"[{m.group(2)}]")
            else:
                tokens.append("[]")
            pos = m.end()
    return tokens


def _resolve_step(obj: Any, step: str) -> list[Any]:
    """Resolve a single step against an object, returning a list of values."""
    if step == "[]":
        if isinstance(obj, list):
            return list(obj)
        return []
    if step.startswith("[") and step.endswith("]"):
        try:
            idx = int(step[1:-1])
            if isinstance(obj, (list, tuple)) and 0 <= idx < len(obj):
                return [obj[idx]]
        except (ValueError, IndexError):
            pass
        return []
    if isinstance(obj, dict) and step in obj:
        return [obj[step]]
    return []


def resolve_path(obj: Any, path: str) -> list[Any]:
    """Walk *path* against *obj* and return all matched values.

    Returns an empty list if the path does not match (no error raised).
    """
    steps = _tokenize(path)

    candidates: list[Any] = [obj]
    for step in steps:
        next_candidates: list[Any] = []
        for c in candidates:
            next_candidates.extend(_resolve_step(c, step))
        candidates = next_candidates
        if not candidates:
            break

    return candidates
