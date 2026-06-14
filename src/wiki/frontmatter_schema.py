"""JSON Schema validation for wiki document frontmatter."""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

from jsonschema import Draft202012Validator
from jsonschema.exceptions import ValidationError

from .config import Config
from .graph import _effective_types, resolve_type
from .parser import document_data_from_path
from .paths import iter_document_files, route_for_document_file

logger = logging.getLogger(__name__)

JSON_SCHEMA_KEY = "wazoo:jsonSchema"
TARGET_CLASS_KEY = "sh:targetClass"

REMOTE_FETCH_TIMEOUT = 10
MAX_SCHEMA_BYTES = 1_000_000

SchemaIssue = tuple[str, str]  # (missing_schema_ref | frontmatter_schema, message)


def coerce_schema_refs(value: object) -> list[str] | None:
    """Normalize wazoo:jsonSchema to a non-empty list of strings, or None if absent."""
    if value is None:
        return None
    if isinstance(value, str):
        text = value.strip()
        return [text] if text else None
    if isinstance(value, list):
        refs: list[str] = []
        for item in value:
            if not isinstance(item, str):
                raise ValueError("wazoo:jsonSchema list items must be strings")
            text = item.strip()
            if not text:
                raise ValueError("wazoo:jsonSchema list items must be non-empty strings")
            refs.append(text)
        return refs or None
    raise ValueError("wazoo:jsonSchema must be a string or list of strings")


def is_remote_schema_ref(ref: str) -> bool:
    return ref.startswith("http://") or ref.startswith("https://")


def resolve_local_schema_path(raw: str, config_root: Path) -> Path:
    """Resolve a local wazoo:jsonSchema path relative to the wiki config root."""
    text = raw.strip().replace("\\", "/")
    path = Path(text)
    if not path.is_absolute():
        path = config_root / path
    return path.resolve()


def schema_path_within_root(path: Path, config_root: Path) -> bool:
    try:
        path.resolve().relative_to(config_root.resolve())
    except ValueError:
        return False
    return True


def local_schema_is_valid(path: Path, config_root: Path) -> bool:
    if not schema_path_within_root(path, config_root):
        return False
    return path.is_file() and path.name.lower().endswith(".json")


def normalize_type_uri(type_token: object, config: Config) -> str:
    return str(resolve_type(type_token, config.context))


def is_schema_binding_document(fm_data: dict[str, Any]) -> bool:
    if not fm_data.get(TARGET_CLASS_KEY):
        return False
    try:
        return coerce_schema_refs(fm_data.get(JSON_SCHEMA_KEY)) is not None
    except ValueError:
        return False


def validation_payload(fm_data: dict[str, Any]) -> dict[str, Any]:
    """Frontmatter dict for JSON Schema validation (exclude schema pointers and SHACL keys)."""
    payload: dict[str, Any] = {}
    for key, value in fm_data.items():
        if key.startswith("@"):
            continue
        if key in {"id", JSON_SCHEMA_KEY}:
            continue
        if key.startswith("sh:") or key == TARGET_CLASS_KEY:
            continue
        payload[key] = value
    return payload


def _dedupe_refs(refs: list[str]) -> list[str]:
    seen: set[str] = set()
    ordered: list[str] = []
    for ref in refs:
        if ref in seen:
            continue
        seen.add(ref)
        ordered.append(ref)
    return ordered


def build_type_schema_registry(config: Config) -> dict[str, list[str]]:
    """Map normalized target-class URI to schema reference strings from binding documents."""
    registry: dict[str, list[str]] = {}
    for file_path in iter_document_files(config):
        fm_data = document_data_from_path(file_path, content_predicate=config.graph.content_predicate)
        if not fm_data or not is_schema_binding_document(fm_data):
            continue
        try:
            refs = coerce_schema_refs(fm_data.get(JSON_SCHEMA_KEY))
        except ValueError:
            continue
        if not refs:
            continue
        target = fm_data.get(TARGET_CLASS_KEY)
        if target is None:
            continue
        type_key = normalize_type_uri(target, config)
        registry.setdefault(type_key, []).extend(refs)
    return {key: _dedupe_refs(refs) for key, refs in registry.items()}


class SchemaLoader:
    """Load and cache JSON Schema documents from local paths or remote URLs."""

    def __init__(
        self,
        config_root: Path,
        *,
        remote_schema_refs: str = "allow",
        remote_schema_hosts: list[str] | None = None,
    ) -> None:
        self.config_root = config_root.resolve()
        self.remote_schema_refs = remote_schema_refs
        self.remote_schema_hosts = set(remote_schema_hosts or [])
        self._schema_cache: dict[str, tuple[dict[str, Any] | None, str | None]] = {}
        self._validator_cache: dict[str, tuple[Draft202012Validator | None, str | None]] = {}

    def _remote_policy_error(self, ref: str) -> str | None:
        if self.remote_schema_refs == "allow":
            return None
        if self.remote_schema_refs == "deny":
            return "remote schema refs are disabled by check.remote_schema_refs"
        host = urlsplit(ref).hostname
        if host is None or host not in self.remote_schema_hosts:
            label = host or ref
            return f"remote schema host {label!r} is not allowed by check.remote_schema_hosts"
        return None

    def load_schema(self, ref: str) -> tuple[dict[str, Any] | None, str | None]:
        if ref in self._schema_cache:
            return self._schema_cache[ref]

        if is_remote_schema_ref(ref):
            policy_error = self._remote_policy_error(ref)
            if policy_error:
                schema, error = None, policy_error
            else:
                schema, error = self._fetch_remote(ref)
        else:
            schema, error = self._load_local(ref)

        self._schema_cache[ref] = (schema, error)
        return schema, error

    def get_validator(self, ref: str) -> tuple[Draft202012Validator | None, str | None]:
        if ref in self._validator_cache:
            return self._validator_cache[ref]

        schema, error = self.load_schema(ref)
        if error or schema is None:
            self._validator_cache[ref] = (None, error)
            return None, error

        try:
            validator = Draft202012Validator(schema)
        except Exception as exc:
            message = f"invalid JSON Schema document ({exc})"
            self._validator_cache[ref] = (None, message)
            return None, message

        self._validator_cache[ref] = (validator, None)
        return validator, None

    def _load_local(self, ref: str) -> tuple[dict[str, Any] | None, str | None]:
        path = resolve_local_schema_path(ref, self.config_root)
        if not local_schema_is_valid(path, self.config_root):
            return None, "must resolve to a readable .json file under the wiki config root"
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            return None, f"could not be read as JSON ({exc})"
        if not isinstance(data, dict):
            return None, "must contain a JSON object"
        return data, None

    def _fetch_remote(self, ref: str) -> tuple[dict[str, Any] | None, str | None]:
        request = Request(ref, headers={"User-Agent": "Wiki-CLI/jsonschema"})
        try:
            with urlopen(request, timeout=REMOTE_FETCH_TIMEOUT) as response:
                raw = response.read(MAX_SCHEMA_BYTES + 1)
        except HTTPError as exc:
            return None, f"HTTP {exc.code}"
        except URLError as exc:
            return None, str(exc.reason)
        except TimeoutError:
            return None, "request timed out"
        except OSError as exc:
            return None, str(exc)

        if len(raw) > MAX_SCHEMA_BYTES:
            return None, f"response exceeds {MAX_SCHEMA_BYTES} bytes"

        try:
            data = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            return None, f"response is not valid JSON ({exc})"
        if not isinstance(data, dict):
            return None, "response must be a JSON object"
        return data, None


def _effective_schema_refs(
    fm_data: dict[str, Any],
    registry: dict[str, list[str]],
    config: Config,
) -> list[tuple[str, str | None]]:
    """Return (schema_ref, via_label) pairs to validate, deduped."""
    refs: list[tuple[str, str | None]] = []
    seen: set[str] = set()

    for type_token in _effective_types(fm_data, config):
        type_uri = normalize_type_uri(type_token, config)
        for ref in registry.get(type_uri, []):
            if ref in seen:
                continue
            seen.add(ref)
            refs.append((ref, f"via type {type_token}"))

    if not is_schema_binding_document(fm_data):
        try:
            page_refs = coerce_schema_refs(fm_data.get(JSON_SCHEMA_KEY))
        except ValueError:
            page_refs = None
        if page_refs:
            for ref in page_refs:
                if ref in seen:
                    continue
                seen.add(ref)
                refs.append((ref, None))

    return refs


def _format_missing_ref(route: str, ref: str, detail: str, *, binding: bool) -> str:
    if is_remote_schema_ref(ref):
        return f"In {route}: wazoo:jsonSchema {ref!r} could not be fetched ({detail})."
    if binding:
        return (
            f"In {route}: wazoo:jsonSchema on type binding {ref!r} {detail}."
        )
    return f"In {route}: wazoo:jsonSchema {ref!r} {detail}."


def _format_validation_error(route: str, ref: str, error: ValidationError, via: str | None) -> str:
    via_part = f", {via}" if via else ""
    return f"In {route}: {error.message} (schema: {ref}{via_part})"


def check_frontmatter_schema(
    config: Config,
    file_filter: set[str] | None = None,
    *,
    file_paths: list[Path] | None = None,
) -> tuple[list[str], list[str]]:
    """Return (missing_schema_ref issues, frontmatter_schema validation issues)."""
    if config.check.frontmatter_schema == "off" and config.check.missing_schema_ref == "off":
        return [], []

    registry = build_type_schema_registry(config)
    loader = SchemaLoader(
        config.config_root,
        remote_schema_refs=config.check.remote_schema_refs,
        remote_schema_hosts=config.check.remote_schema_hosts,
    )
    missing_issues: list[str] = []
    validation_issues: list[str] = []

    candidates = file_paths if file_paths is not None else iter_document_files(config)

    for file_path in candidates:
        try:
            route = route_for_document_file(config, file_path)
        except ValueError:
            continue
        if file_filter is not None and route not in file_filter:
            continue

        fm_data = document_data_from_path(file_path, content_predicate=config.graph.content_predicate)
        if not fm_data:
            continue

        try:
            coerce_schema_refs(fm_data.get(JSON_SCHEMA_KEY))
        except ValueError as exc:
            validation_issues.append(f"In {route}: {exc}.")
            continue

        if is_schema_binding_document(fm_data):
            try:
                binding_refs = coerce_schema_refs(fm_data.get(JSON_SCHEMA_KEY)) or []
            except ValueError:
                binding_refs = []
            for ref in binding_refs:
                _, error = loader.load_schema(ref)
                if error and config.check.missing_schema_ref != "off":
                    missing_issues.append(
                        _format_missing_ref(route, ref, error, binding=True)
                    )
            continue

        schema_refs = _effective_schema_refs(fm_data, registry, config)
        if not schema_refs:
            continue

        instance = validation_payload(fm_data)
        for ref, via in schema_refs:
            validator, error = loader.get_validator(ref)
            if error:
                if config.check.missing_schema_ref != "off":
                    missing_issues.append(_format_missing_ref(route, ref, error, binding=False))
                continue
            if validator is None:
                continue
            for validation_error in sorted(validator.iter_errors(instance), key=lambda e: list(e.path)):
                if config.check.frontmatter_schema != "off":
                    validation_issues.append(
                        _format_validation_error(route, ref, validation_error, via)
                    )

    return missing_issues, validation_issues
