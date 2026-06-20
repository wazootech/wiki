"""Sphinx configuration for wazootech-wiki Python API reference."""

from __future__ import annotations

import sys
from pathlib import Path

# Make the source package importable
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

project = "wazootech-wiki"
copyright = "2026, wazootech"
author = "wazootech"
release = "0.1.15"

extensions = [
    "sphinx.ext.autodoc",
    "sphinx.ext.napoleon",
    "sphinx_autodoc_typehints",
    "sphinxcontrib.autodoc_pydantic",
    "sphinx.ext.viewcode",
]

templates_path = ["_templates"]
exclude_patterns = ["_build", "Thumbs.db", ".DS_Store"]

html_theme = "furo"
html_static_path = ["_static"]

autodoc_default_options = {
    "members": True,
    "undoc-members": True,
    "show-inheritance": True,
}

napoleon_google_docstring = True
napoleon_numpy_docstring = False
