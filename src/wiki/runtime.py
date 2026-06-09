"""Runtime helpers for applying CLI overrides to loaded config."""

from __future__ import annotations

from .config import Config


def resolve_runtime_config(
    config: Config,
    *,
    base_url: str | None = None,
    url_style: str | None = None,
) -> Config:
    runtime_config = config.model_copy(deep=True)
    if base_url is not None:
        runtime_config.site.base_url = base_url.rstrip("/")
    if url_style is not None:
        runtime_config.site.url_style = url_style
    return runtime_config
