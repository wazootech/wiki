"""Central Config and Context managing CLI settings, paths, check rules, and namespace bindings."""

from __future__ import annotations

from .context import (
    DEFAULT_NAMESPACES,
    Context,
)
from .schemas import CheckConfig, Config, LintConfig
from .schemas.wiki_config import (
    CONFIG_FILENAMES,
    DEFAULT_BASE_URL,
    DEFAULT_LINK_STYLE,
    DEFAULT_URL_STYLE,
    VALID_URL_STYLES,
    find_config_path,
    format_config_validation_error,
    normalize_api_path,
    normalize_url_style,
)

DEFAULT_FILENAME_PATTERN = r"[A-Za-z0-9_()-]+\.md"
DEFAULT_CHECK_CONFIG = CheckConfig()
DEFAULT_LINT_CONFIG = LintConfig()

__all__ = [
    "CONFIG_FILENAMES",
    "Context",
    "DEFAULT_BASE_URL",
    "DEFAULT_CHECK_CONFIG",
    "DEFAULT_FILENAME_PATTERN",
    "DEFAULT_LINT_CONFIG",
    "DEFAULT_LINK_STYLE",
    "DEFAULT_NAMESPACES",
    "DEFAULT_URL_STYLE",
    "VALID_URL_STYLES",
    "Config",
    "find_config_path",
    "format_config_validation_error",
    "normalize_api_path",
    "normalize_url_style",
]
