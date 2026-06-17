"""Markdown formatting library operations."""

from __future__ import annotations

from collections.abc import Sequence
from pathlib import Path

from .fmt_util import format_markdown
from .paths import iter_markdown_files, select_markdown_paths
from .schemas import FmtReport
from .workspace import Wiki


def _format_files(
    workspace: Wiki,
    files: Sequence[Path] | None = None,
    *,
    check_only: bool = False,
    verbose: bool = False,
) -> FmtReport:
    config = workspace.config
    if files:
        target_files = select_markdown_paths(config, tuple(files))
    else:
        target_files = list(iter_markdown_files(config))

    report = FmtReport()
    for file_path in target_files:
        try:
            original = file_path.read_text(encoding="utf-8")
            formatted = format_markdown(original, file_path, config)
            if original != formatted:
                report.stale_files.append(file_path)
                if not check_only:
                    file_path.write_text(formatted, encoding="utf-8")
                    report.formatted_count += 1
                    if verbose:
                        report.verbose_lines.append(f"Formatted {file_path.name}")
            elif verbose:
                report.verbose_lines.append(f"Already formatted {file_path.name}")
        except Exception as exc:
            report.ok = False
            report.error_message = f"Error formatting {file_path.name}: {exc}"
            return report

    report.ok = not report.stale_files if check_only else True
    return report
