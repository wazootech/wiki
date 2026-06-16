"""Document export library operations."""

from __future__ import annotations

import json
from collections.abc import Sequence
from pathlib import Path
from typing import Any

from .format import process_rdf_format
from .parser import document_data_from_path
from .paths import iter_document_files, route_for_document_file, select_document_paths
from .schemas import ExportResult
from .workspace import Wiki

_RAW_FORMATS = frozenset({"turtle", "xml", "n3", "nt", "trig", "nquads"})


def export_documents(
    workspace: Wiki,
    files: Sequence[Path] | None = None,
    *,
    rdf_format: str,
    mode: str,
) -> ExportResult:
    config = workspace.config
    result_payload: Any

    if files:
        if len(files) > 1 and rdf_format in _RAW_FORMATS:
            return ExportResult(
                ok=False,
                error_message=(
                    "raw RDF export formats require a single FILE or whole-wiki export (omit FILE)."
                ),
            )
        selected = select_document_paths(config, tuple(files))
        converted_list = []
        for file_path in selected:
            data = document_data_from_path(file_path, content_predicate=config.graph.content_predicate)
            if data is None:
                return ExportResult(
                    ok=False,
                    error_message=f"No valid document metadata found in {file_path.name}",
                )
            converted_list.append(
                {
                    "name": file_path.name,
                    "rdf": process_rdf_format(
                        data,
                        route_for_document_file(config, file_path),
                        config,
                        rdf_format,
                        mode=mode,
                    ),
                }
            )
        result_payload = converted_list[0] if len(converted_list) == 1 else converted_list
    else:
        converted_list = []
        for file_path in iter_document_files(config):
            data = document_data_from_path(file_path, content_predicate=config.graph.content_predicate)
            if data:
                converted_list.append(
                    {
                        "name": file_path.name,
                        "rdf": process_rdf_format(
                            data,
                            route_for_document_file(config, file_path),
                            config,
                            rdf_format,
                            mode=mode,
                        ),
                    }
                )
        result_payload = converted_list

    if rdf_format in _RAW_FORMATS and not isinstance(result_payload, list):
        output_str = (
            result_payload["rdf"]
            if isinstance(result_payload["rdf"], str)
            else json.dumps(result_payload["rdf"], indent=2, default=str)
        )
    else:
        output_str = json.dumps(result_payload, indent=2, default=str)

    return ExportResult(ok=True, output=output_str)
